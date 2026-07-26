#!/usr/bin/env node
/**
 * Custom player server for markcut.
 *
 * Modes:
 *   --label   – playback with label input overlay; labels map to media timestamps
 *   --edit    – edit input mode with AI-assisted changes
 *
 * Usage:
 *   node src/player/server.mjs <video.json> [--label] [--edit] [--port 3001]
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, writeFileSync, watchFile, existsSync, mkdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isDescriptiveRoot, resolveAndCompile, resolveAndCompileMarkdown, parseImportsBlock, extractDependencySpecs } from "./pipeline.mjs";
import { bundleFromEntries } from "./bundler.mjs";
import { extractScenes, MIME, serveFile, handleShutdown } from "./server-shared.mjs";
import { DEFAULT_EDIT_CLI, DEFAULT_STT_CLI, GOOGLE_MAPS_API_KEY } from "../config.mjs";


const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
const PORT = parseInt(process.argv.find(a => a.startsWith("--port="))?.split("=")[1] || process.argv[process.argv.indexOf("--port") + 1] || "3001", 10);

// Find video input path (.json or .md)
const inputArg = process.argv.find(a => (a.endsWith(".json") || a.endsWith(".md")) && !a.startsWith("--"));
const VIDEO_JSON = inputArg ? resolve(inputArg) : join(ROOT, "video.json");
const IS_MARKDOWN = VIDEO_JSON.endsWith(".md");
const MODE_LABEL = process.argv.includes("--label");
const MODE_EDIT = process.argv.includes("--edit");
// Storyboard mode: skip slow TTI/TTV generation. The compiler converts prompt
// image/video nodes into component placeholders so the user can review the
// story structure fast and chat to reshape it.
const MODE_STORYBOARD = process.argv.includes("--storyboard");

// ─── Variant configuration ─────────────────────────────────────────────────
// Each --variant flag defines a separate compilation target.
// The label can be a dash-separated chain (e.g. "zh-tiktok" → ["zh", "tiktok"]).
// The special label "default" means no variant overrides (base content).
//
// Usage: --variant default --variant zh-tiktok --variant en-tiktok --variant youtube
// This compiles 4 variants: default (no overrides), zh+tiktok, en+tiktok, youtube.
//
// Each variant is served at its own URL path: /, /zh-tiktok, /en-tiktok, /youtube.
//
// Compilations run sequentially (not parallel) to avoid resource contention
// from CLI tools like whisper, ffprobe, etc.
//
// Variant config:
//   { label: string, chain: string[] }
//   - label: display name / URL path segment (e.g. "default", "zh-tiktok")
//   - chain: variant override names (e.g. [], ["zh", "tiktok"], ["youtube"])
function parseVariantConfigs() {
  const labels = [];
  for (let i = 0; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === "--variant") {
      const next = process.argv[i + 1];
      if (next && !next.startsWith("--")) {
        labels.push(next);
        i++; // skip the value
      }
    } else if (arg.startsWith("--variant=")) {
      labels.push(arg.split("=")[1]);
    }
  }
  // If no --variant flags, default to a single "default" variant
  if (labels.length === 0) labels.push("default");
  return labels.map(label => ({
    label,
    chain: label === "default" ? [] : label.split("-"),
  }));
}
const VARIANT_CONFIGS = parseVariantConfigs();

// ─── SSE clients for reload notifications ────────────────────────────────
const sseClients = new Set();
let shutdownTimer = null;

/** Push a JSON event to all connected SSE clients. */
function ssePush(data) {
  const text = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try { client.write(text); } catch { sseClients.delete(client); }
  }
}

// ─── Label store for label mode ───────────────────────────────────────────
let labels = [];

// ─── Agent process (rpc mode) for --edit mode ─────────────────────────────
// A persistent `pi --mode rpc` subprocess: ONE cold start, MANY edit turns.
// The agent keeps conversation memory across edits (fast, no re-spawn).
//
// JSON-lines protocol over stdio:
//   request:  {"id":N,"type":"prompt","message":"..."}
//   response: {"id":N,"type":"response","command":"prompt","success":true}  (accepted)
//   events:   streamed; a turn ENDS at {"type":"agent_settled"}
// We collect assistant text from {"type":"message_end", message:{role:"assistant"}}
// events and resolve the pending /api/edit call on agent_settled.
let agentProcess = null;
let agentBusy = false;
let agentLineBuf = "";          // partial stdout line buffer
let agentTurnText = "";         // accumulated assistant text for the current turn
let agentTurnTimer = null;
/** Resolve/reject for the pending edit API call */
let pendingEditResolver = null;
const AGENT_TURN_TIMEOUT = 300000; // 5min safety net per turn

/** Pull text out of an assistant message_end event's content blocks. */
function extractAssistantText(message) {
  if (!message || message.role !== "assistant") return "";
  const content = Array.isArray(message.content) ? message.content : [];
  return content
    .filter((b) => b && b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("");
}

/** Resolve the pending edit call and reset per-turn state. */
function finishAgentTurn(result) {
  if (agentTurnTimer) { clearTimeout(agentTurnTimer); agentTurnTimer = null; }
  agentBusy = false;
  const turnText = agentTurnText;
  agentTurnText = "";
  const resolver = pendingEditResolver;
  pendingEditResolver = null;
  if (resolver) resolver({ ...result, output: result.output != null ? result.output : turnText });
}

/** Dispatch one parsed JSON line emitted on the agent's stdout. */
function handleAgentLine(obj) {
  if (!obj || typeof obj !== "object") return;
  const t = obj.type;
  if (t === "message_end") {
    const txt = extractAssistantText(obj.message);
    if (txt) {
      agentTurnText += (agentTurnText ? "\n" : "") + txt;
      // Push incremental assistant text to SSE clients
      ssePush({ type: "edit:progress", text: agentTurnText });
    }
    return;
  }
  if (t === "agent_settled" && pendingEditResolver) {
    ssePush({ type: "edit:done", summary: agentTurnText.substring(0, 120) });
    finishAgentTurn({ ok: true });
    return;
  }
  if (t === "response" && obj.command === "prompt" && pendingEditResolver) {
    // Preflight result: success means "accepted, events incoming"; failure aborts.
    if (obj.success === false) {
      ssePush({ type: "edit:error", error: obj.error || "prompt rejected" });
      finishAgentTurn({ ok: false, error: obj.error || "prompt rejected" });
    }
    return;
  }
  if (t === "extension_error" && obj.error) {
    console.warn(`  ⚠ agent extension error: ${String(obj.error).substring(0, 120)}`);
  }
}

/**
 * Start the persistent agent subprocess in rpc mode.
 * The system prompt is fixed for the server lifetime (it only references the
 * constant file path); per-edit context rides on each prompt's message.
 */
function startAgentProcess() {
  if (!MODE_EDIT) return;

  const agentCli = process.env.MARKCUT_EDIT_CLI || DEFAULT_EDIT_CLI;

  const fileLabel = VIDEO_JSON.split("/").pop();
  const sessionId = VIDEO_JSON.replace(/[^a-zA-Z0-9\-_.]/g, "_").replace(/^[^a-zA-Z0-9]+/, "").replace(/[^a-zA-Z0-9]+$/, "");
  const promptTemplate = readFileSync(join(ROOT, "skills/markcut/docs", "system-prompt-edit.md"), "utf-8");
  const systemPrompt = promptTemplate
    .replace(/@\{([^}]+)\}/g, (_, refPath) => {
      try { return readFileSync(resolve(ROOT, refPath.trim()), "utf-8"); }
      catch { console.warn(`  ⚠ could not read @{${refPath}}`); return `[Missing: ${refPath}]`; }
    })
    .replace(/\$\{fileName\}/g, fileLabel)
    .replace(/\$\{filePath\}/g, VIDEO_JSON);

  // Build the CLI command — strip -p/--prompt (rpc takes prompts via stdin) and
  // force --mode rpc. e.g.
  //   "npx pi --session-id {sessionid} --system-prompt {systemprompt} -p {prompt}"
  //   → "npx pi --session-id SID --system-prompt SP --mode rpc"
  const parts = agentCli.split(/\s+/).filter(Boolean);
  const resolvedParts = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p === "-p" || p === "--prompt") { i++; continue; } // drop prompt flag + value
    const resolved = p
      .replace(/\{sessionid\}/g, sessionId)
      .replace(/\{systemprompt\}/g, systemPrompt)
      .replace(/\{prompt\}/g, "");
    if (resolved) resolvedParts.push(resolved);
  }
  if (!resolvedParts.includes("--mode")) resolvedParts.push("--mode", "rpc");
  const cmd = resolvedParts[0];
  const cmdArgs = resolvedParts.slice(1);

  console.log(`  🎬 starting edit agent`);

  const child = spawn(cmd, cmdArgs, { cwd: ROOT, stdio: ["pipe", "pipe", "pipe"] });
  agentProcess = child;
  agentLineBuf = "";

  // stdout is pure JSON-lines in rpc mode (it takes over stdout). Parse line by line.
  child.stdout.on("data", (chunk) => {
    agentLineBuf += chunk.toString();
    let nl;
    while ((nl = agentLineBuf.indexOf("\n")) >= 0) {
      const line = agentLineBuf.slice(0, nl).trim();
      agentLineBuf = agentLineBuf.slice(nl + 1);
      if (!line) continue;
      let obj;
      try { obj = JSON.parse(line); } catch { continue; } // not JSON — ignore
      handleAgentLine(obj);
    }
  });

  child.stderr.on("data", (chunk) => { process.stderr.write(chunk); });

  child.on("exit", (code) => {
    console.log(`  ⚫ agent process exited (code ${code})`);
    agentProcess = null;
    if (pendingEditResolver) finishAgentTurn({ ok: false, error: `agent exited (code ${code})` });
    agentBusy = false;
    // Keep the session warm: restart on any exit while in edit mode.
    // The --session-id resumes conversation history from disk.
    if (MODE_EDIT) {
      console.log(`  🔄 restarting agent in 1s...`);
      setTimeout(() => startAgentProcess(), 1000);
    }
  });
}

/**
 * Send an edit prompt to the persistent rpc agent and resolve when the turn
 * settles. Completion is signalled authoritatively by the `agent_settled`
 * event — no idle-timeout guessing.
 * @param {string} prompt
 * @returns {Promise<{ok: boolean, output: string, error?: string}>}
 */
function sendToAgent(prompt) {
  return new Promise((resolve) => {
    if (!agentProcess || agentProcess.killed) {
      resolve({ ok: false, output: "", error: "agent process not running" });
      return;
    }
    if (agentBusy) {
      resolve({ ok: false, output: "", error: "agent is busy" });
      return;
    }

    agentBusy = true;
    agentTurnText = "";
    pendingEditResolver = resolve;

    // Safety net — the agent_settled event is the real completion signal.
    agentTurnTimer = setTimeout(() => {
      console.warn(`  ⏰ agent turn timed out after ${AGENT_TURN_TIMEOUT / 1000}s`);
      finishAgentTurn({ ok: false, output: agentTurnText + "\n[TIMEOUT]", error: "agent turn timed out" });
    }, AGENT_TURN_TIMEOUT);

    const id = Date.now();
    const req = JSON.stringify({ id, type: "prompt", message: prompt }) + "\n";
    console.log(`  📤 rpc prompt (id=${id}): ${prompt.substring(0, 80).replace(/\n/g, " ")}`);
    agentProcess.stdin.write(req);
  });
}

// ─── Edit history for context ─────────────────────────────────────────────
let editHistory = [];

// ─── .markcut/ directory layout ────────────────────────────────────────────
//   .markcut/                     ← server document root
//     generated/                  ← shared, content-addressed (across all variants & files)
//       tts/                      ← TTS audio (content-hash filenames)
//       media/                    ← TTI/TTV media (content-hash filenames)
//       includes/                 ← compiled sub-video JSON (content-hash)
//       components/               ← component bundles (content-hash, shared across variants)
//     <basename>/                 ← per-source-file
//       default/                  ← default variant artifacts
//         compiled.json
//       zh-tiktok/                ← variant-specific artifacts
//         compiled.json
const MARKCUT_BASE = join(dirname(VIDEO_JSON), ".markcut");
const MARKCUT_DIR = join(MARKCUT_BASE, "generated");
const BASENAME = VIDEO_JSON.split("/").pop().replace(/\.[^.]+$/, "");
const TTS_OUTPUT_DIR = join(MARKCUT_DIR, "tts");
const MEDIA_OUTPUT_DIR = join(MARKCUT_DIR, "media");
const INCLUDE_CACHE_DIR = join(MARKCUT_DIR, "includes");
const COMPONENT_OUTPUT_DIR = join(MARKCUT_DIR, "components");
/** Get the per-variant directory under .markcut/<basename>/<label>/ */
function variantDir(label) {
  return join(MARKCUT_BASE, BASENAME, label);
}

/** Get the compiled.json path for a given variant */
function compiledCacheFile(label) {
  return join(variantDir(label), "compiled.json");
}

/**
 * Recursively convert all absolute paths under MARKCUT_BASE to relative paths.
 * This makes the cached compiled.json portable across machines.
 * The /api/video-data endpoint converts them back to server-relative URLs.
 */
function makePathsRelative(obj) {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(makePathsRelative);
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string" && value.startsWith(MARKCUT_BASE)) {
      result[key] = value.replace(MARKCUT_BASE + "/", "");
    } else if (typeof value === "object" && value !== null) {
      result[key] = makePathsRelative(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Convert relative (to MARKCUT_BASE) paths in the compiled root to server-relative URLs
 * for the browser. This is the inverse of makePathsRelative — it prepends "/" to paths
 * so the browser can fetch them from the server.
 *
 * Handles:
 *   - compiled.imports (component bundle URL)
 *   - compiled.subtitle.src (VTT file)
 *   - Any node.src (media/tts/images) that is a relative path under MARKCUT_BASE
 */
function resolveAssetPaths(root) {
  const out = JSON.parse(JSON.stringify(root));

  function walkNode(node) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach(walkNode); return; }

    // Convert src fields that are relative paths
    if (typeof node.src === "string" && !node.src.startsWith("http://") && !node.src.startsWith("https://") && !node.src.startsWith("data:")) {
      // Already a relative path under MARKCUT_BASE (shouldn't be absolute)
      if (!node.src.startsWith("/") && !node.src.startsWith(".")) {
        // Plain relative path — prefix with / (server serves from project root)
        node.src = "/" + node.src;
      } else if (node.src.startsWith("./")) {
        // Dot-prefixed relative path — strip ./ and prefix with /
        node.src = "/" + node.src.slice(2);
      }
      // Convert absolute paths under MARKCUT_BASE
      if (typeof node.src === "string" && node.src.startsWith(MARKCUT_BASE)) {
        node.src = "/" + node.src.replace(MARKCUT_BASE + "/", "");
      }
    }

    // Convert subtitle src
    if (node.subtitle && typeof node.subtitle.src === "string") {
      if (node.subtitle.src.startsWith(MARKCUT_BASE)) {
        node.subtitle.src = "/" + node.subtitle.src.replace(MARKCUT_BASE + "/", "");
      } else if (!node.subtitle.src.startsWith("/") && !node.subtitle.src.startsWith("http")) {
        node.subtitle.src = "/" + node.subtitle.src;
      }
    }

    // Convert imports (component bundle URL)
    if (typeof node.imports === "string") {
      if (node.imports.startsWith(MARKCUT_BASE)) {
        node.imports = "/" + node.imports.replace(MARKCUT_BASE + "/", "");
      } else if (!node.imports.startsWith("/") && !node.imports.startsWith("http")) {
        node.imports = "/" + node.imports;
      }
    }

    if (Array.isArray(node.children)) {
      node.children.forEach(walkNode);
    }
  }

  walkNode(out);
  return out;
}

// ─── extractScenes imported from ./server-shared.mjs ────────────────────

// ─── Compiled root cache (per-variant) ────────────────────────────────────
// Keyed by variant label (e.g. "default", "zh-tiktok").
const compiledRootCache = new Map();
let pipelineRunning = false;

/**
 * Extract component import entries from the raw file source.
 * Handles both markdown (```js imports code fence) and JSON formats.
 */
function extractImportEntries(raw) {
  let entries = null;
  let extraSpecs = [];
  let rawSource = null;

  if (IS_MARKDOWN) {
    const match = raw.match(/^(```|~~~)\s*js imports\s*\n([\s\S]*?)^\1\s*$/m);
    if (match) {
      rawSource = match[2];
      entries = parseImportsBlock(match[2]);
      extraSpecs = extractDependencySpecs(match[2]);
    }
  } else {
    try {
      const parsed = JSON.parse(raw);
      const root = parsed.root || parsed;
      if (root.importsBlock) {
        rawSource = root.importsBlock;
        entries = parseImportsBlock(root.importsBlock);
        extraSpecs = extractDependencySpecs(root.importsBlock);
      }
    } catch { /* invalid JSON — skip */ }
  }

  return { entries, extraSpecs, rawSource };
}

/**
 * Compile a single variant and cache the result.
 *
 * @param {object} config - Variant config { label, chain }
 * @param {object} parsed - Parsed markdown variants (from parseMarkdownVariants)
 * @param {string} raw - Raw source file content
 */
async function compileVariant(config, parsed, raw) {
  const cacheKey = config.label;
  if (compiledRootCache.has(cacheKey)) return compiledRootCache.get(cacheKey);

  const vDir = variantDir(config.label);
  const subtitleDir = vDir;

  const { entries: importEntries, extraSpecs, rawSource } = extractImportEntries(raw);

  let compiled;

  if (IS_MARKDOWN) {
    let descriptive = parsed.base;

    if (config.chain.length > 0) {
      // Merge root config from the first variant's section
      const variantRoot = parsed.variants.get(config.chain[0]);
      if (variantRoot) {
        const { children: _, ...configOverrides } = variantRoot;
        descriptive = { ...descriptive, ...configOverrides };
      }
      const { resolveVariantOverrides } = await import("./pipeline.mjs");
      descriptive = resolveVariantOverrides(descriptive, config.chain);
    }

    console.log(`  📝 Variant "${config.label}": resolving...`);
    const { resolveAll, compileDescriptiveRoot } = await import("./pipeline.mjs");
    const resolved = await resolveAll(descriptive, {
      sourcePath: VIDEO_JSON,
      baseDir: dirname(VIDEO_JSON),
      scriptOutputDir: TTS_OUTPUT_DIR,
      mediaOutputDir: MEDIA_OUTPUT_DIR,
      includeOutputDir: INCLUDE_CACHE_DIR,
      sttCli: DEFAULT_STT_CLI,
      subtitleOutputDir: subtitleDir,
      storyboard: MODE_STORYBOARD,
      variants: config.chain.length > 0 ? config.chain : undefined,
    });
    compiled = compileDescriptiveRoot(resolved, {
      googleMapsApiKey: GOOGLE_MAPS_API_KEY || "",
    });
  } else {
    const parsedJson = JSON.parse(raw);
    const root = parsedJson.root || parsedJson;

    if (isDescriptiveRoot(root)) {
      let descriptive = root;

      if (config.chain.length > 0) {
        const { resolveVariantOverrides } = await import("./pipeline.mjs");
        descriptive = resolveVariantOverrides(descriptive, config.chain);
      }

      console.log(`  📝 Variant "${config.label}": resolving...`);
      compiled = await resolveAndCompile(descriptive, {
        sourcePath: VIDEO_JSON,
        baseDir: dirname(VIDEO_JSON),
        scriptOutputDir: TTS_OUTPUT_DIR,
        mediaOutputDir: MEDIA_OUTPUT_DIR,
        includeOutputDir: INCLUDE_CACHE_DIR,
        sttCli: DEFAULT_STT_CLI,
        subtitleOutputDir: subtitleDir,
        storyboard: MODE_STORYBOARD,
        variants: config.chain.length > 0 ? config.chain : undefined,
      });
    } else {
      compiled = root;
    }
  }

  // Bundle component imports — output goes to shared generated/components/ (content-addressed)
  // The bundler's cache dir doubles as both the temp project location and output dir.
  // Using a shared COMPONENT_OUTPUT_DIR ensures identical imports across variants
  // reuse the same cached bundle.
  const shouldBundle = (importEntries && importEntries.length > 0) || (rawSource && rawSource.trim());
  if (shouldBundle) {
    try {
      const bundle = await bundleFromEntries(importEntries || [], extraSpecs, rawSource, COMPONENT_OUTPUT_DIR);
      if (bundle.url) {
        compiled.imports = bundle.url;
        console.log(`  ✅ ${config.label}: components → ${bundle.exports.join(", ")}`);
      }
    } catch (e) {
      console.error(`  ⚠️  ${config.label}: component bundling failed:`, e.message);
    }
  }

  // Convert absolute paths under MARKCUT_BASE to relative paths for portability.
  // The cached compiled.json on disk should not contain absolute filesystem paths
  // so it's machine-independent. The /api/video-data endpoint converts them back
  // to server-relative URLs when serving.
  compiled = makePathsRelative(compiled);

  // Persist to disk
  try {
    mkdirSync(vDir, { recursive: true });
    writeFileSync(compiledCacheFile(config.label), JSON.stringify(compiled, null, 2), "utf-8");
  } catch (e) {
    console.warn(`  ⚠ Failed to write compiled.json for "${config.label}":`, e.message);
  }

  compiledRootCache.set(cacheKey, compiled);
  return compiled;
}

/**
 * Compile all variants sequentially.
 */
async function compileAllVariants() {
  const raw = readFileSync(VIDEO_JSON, "utf-8");
  let markdownParsed = null;

  console.log(`  📄 ${VIDEO_JSON.split("/").pop()}`);

  // Pre-parse markdown variants once (shared across all variants)
  if (IS_MARKDOWN) {
    const { parseMarkdownVariants } = await import("./pipeline.mjs");
    markdownParsed = parseMarkdownVariants(raw);
  }

  for (const config of VARIANT_CONFIGS) {
    const startTime = Date.now();
    await compileVariant(config, markdownParsed, raw);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`  ✅ "${config.label}" compiled (${elapsed}s)`);
  }
}

/**
 * Get a compiled root for a given variant label.
 * Returns the pre-compiled cached root (no re-compilation).
 */
async function loadCompiledRoot(variantLabel) {
  const label = variantLabel || "default";
  if (compiledRootCache.has(label)) return compiledRootCache.get(label);
  throw new Error(`Variant "${label}" not compiled. Available: ${[...compiledRootCache.keys()].join(", ")}`);
}

/**
 * Walk the compiled tree for include nodes. For each include with a `.meta.json`
 * companion file (created by resolveIncludes in the pipeline), bundle the
 * sub-video's component imports and write the bundle URL into the compiled JSON.
 *
 * Sub-video component bundles are stored under .markcut/generated/components/
 * (shared, content-addressed), served from .markcut/ as the document root.
 *
 * This runs AFTER resolveAndCompile so the server can bundle per-subvideo
 * component registrations independently.
 */
async function resolveIncludeImports(root) {
  const includes = [];

  function walk(node) {
    if (!node || typeof node !== "object") return;
    if (node.type === "include" && node.src) {
      includes.push(node);
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children) walk(child);
    }
  }
  walk(root);

  for (const inc of includes) {
    // Check for companion meta file
    const metaPath = inc.src.replace(/\.json$/, ".meta.json");
    if (!existsSync(metaPath)) continue;

    let meta;
    try {
      meta = JSON.parse(readFileSync(metaPath, "utf-8"));
    } catch {
      continue;
    }

    const { importEntries, extraSpecs, rawSource } = meta;
    if (!importEntries || importEntries.length === 0) continue;

    try {
      console.log(`  🔗 Sub-video includes: bundling ${importEntries.length} component(s) from "${inc.src}"`);
      // Use shared generated/components/ for content-addressed caching
      const bundle = await bundleFromEntries(importEntries, extraSpecs || [], rawSource, COMPONENT_OUTPUT_DIR);
      if (bundle.url) {
        // bundle.url: /Users/.../.markcut/generated/components/abc123.js
        // server root: .markcut/ — strip MARKCUT_BASE to get /generated/components/abc123.js
        let bundleUrl = bundle.url;
        if (bundleUrl.startsWith(MARKCUT_BASE)) {
          bundleUrl = bundleUrl.replace(MARKCUT_BASE, "");
        }
        if (!bundleUrl.startsWith("/")) bundleUrl = "/" + bundleUrl;

        // Update the compiled JSON file with the bundle URL
        const compiledPath = inc.src;
        const compiledData = JSON.parse(readFileSync(compiledPath, "utf-8"));
        if (compiledData.root) {
          compiledData.root.imports = bundleUrl;
        } else {
          compiledData.imports = bundleUrl;
        }
        writeFileSync(compiledPath, JSON.stringify(compiledData, null, 2), "utf-8");
        console.log(`  ✅ Sub-video components: ${bundle.exports.join(", ")}`);
      }
    } catch (e) {
      console.error(`  ⚠️  Sub-video component bundling failed for "${inc.src}":`, e.message);
    }
  }
}

// ─── Scene info per variant ─────────────────────────────────────────────
const scenesCache = new Map(); // label → { scenes, totalDuration }

async function compileAndExtractScenes() {
  // Compile all variants sequentially, then extract scenes for each
  await compileAllVariants();

  for (const config of VARIANT_CONFIGS) {
    try {
      const root = await loadCompiledRoot(config.label);
      const extracted = extractScenes(root);
      scenesCache.set(config.label, extracted);
    } catch (e) {
      console.error(`  ⚠ Could not extract scenes for "${config.label}":`, e.message);
    }
  }

  // Merge existing labels from labels.json into the compiled root (label mode)
  if (MODE_LABEL) {
    const labelsPath = join(dirname(VIDEO_JSON), "labels.json");
    try {
      const labelsRaw = readFileSync(labelsPath, "utf-8");
      const labelsData = JSON.parse(labelsRaw);
      const labelsRoot = labelsData.root || labelsData;
      const root = compiledRootCache.get("default");
      if (labelsRoot.children && root?.children) {
        for (let i = 0; i < Math.min(labelsRoot.children.length, root.children.length); i++) {
          const labelMedia = labelsRoot.children[i]?.children?.[0];
          const targetMedia = root.children[i]?.children?.[0];
          if (labelMedia && targetMedia && labelMedia.description) {
            targetMedia.description = labelMedia.description;
          }
        }
      }
      console.log(`  🏷️  Merged ${Object.keys(labelsRoot.children || {}).length} existing labels from labels.json`);
    } catch {
      // No existing labels file — that's fine
    }
  }
}

function getScenes(label) {
  const key = label || "default";
  return scenesCache.get(key) || { scenes: [], totalDuration: 0 };
}

// Will be awaited before announcing "Player ready"
const initScenesPromise = compileAndExtractScenes();

// ─── Watch source file for changes (all modes) ──────────────────────────
let lastContent = readFileSync(VIDEO_JSON, "utf-8");
watchFile(VIDEO_JSON, { interval: 1000 }, async (curr, prev) => {
  if (curr.mtimeMs === prev.mtimeMs) return;
  if (pipelineRunning) return;
  const newContent = readFileSync(VIDEO_JSON, "utf-8");
  if (newContent === lastContent) return;
  lastContent = newContent;
  pipelineRunning = true;
  console.log(`  📁 ${VIDEO_JSON} changed, re-running all variants...`);

  try {
    compiledRootCache.clear();
    scenesCache.clear();
    await compileAllVariants();

    for (const config of VARIANT_CONFIGS) {
      try {
        const root = await loadCompiledRoot(config.label);
        scenesCache.set(config.label, extractScenes(root));
      } catch {}
    }

    ssePush({ type: "reload" });
  } catch (e) {
    console.error("  ⚠️  Failed to re-process after change:", e.message);
  } finally {
    pipelineRunning = false;
  }
});
// ─── MIME imported from ./server-shared.mjs ──────────────────────────────

// ─── Variant detection from URL path ─────────────────────────────────────
// Extract variant label from the first path segment.
// "/" or "/default" → "default"
// "/zh-tiktok" → "zh-tiktok"
// "/zh-tiktok/player.js" → "zh-tiktok" (with subpath /player.js)
function parseVariantFromPath(urlPath) {
  const parts = urlPath.split("/").filter(Boolean);
  if (parts.length === 0) return { variant: "default", subpath: "/" };
  const first = parts[0];
  // Check if this segment matches a known variant label
  const match = VARIANT_CONFIGS.find(c => c.label === first);
  if (match) {
    const subpath = "/" + parts.slice(1).join("/");
    return { variant: match.label, subpath: subpath || "/" };
  }
  return { variant: "default", subpath: urlPath };
}

// ─── Resolve asset path ──────────────────────────────────────────────────
function resolveAsset(urlPath, variantLabel) {
  // Bundle dir for the Remotion Player (same for all variants)
  if (urlPath === "/player.js") return join(ROOT, "src", "player", "bundle", "player.js");
  // Absolute filesystem path — serve directly
  if (urlPath.startsWith("/") && existsSync(urlPath)) return urlPath;
  // Serve from variant dir, then .markcut/, then ROOT/public, etc.
  const vDir = variantDir(variantLabel || "default");
  const jsonDir = dirname(VIDEO_JSON);
  const candidates = [
    join(vDir, urlPath),
    join(MARKCUT_BASE, urlPath),
    join(MARKCUT_DIR, urlPath),
    join(ROOT, "public", urlPath),
    join(ROOT, urlPath),
    join(jsonDir, urlPath),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

// ─── HTML page ───────────────────────────────────────────────────────────
// Minimal HTML shell. All UI is rendered by React (player.js bundle).
// Mode-specific controls are in src/player/components/.
function getHtml(variantLabel) {
  const label = variantLabel || "default";
  const mode = MODE_LABEL ? "label" : MODE_EDIT ? "edit" : "preview";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Remotion Player${mode !== "preview" ? " — " + mode.charAt(0).toUpperCase() + mode.slice(1) : ""}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; overflow: hidden; background: #0a0a0a; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; flex-direction: column; align-items: center; }
  #header { display: flex; align-items: center; justify-content: flex-end; width: 100%; max-width: 500px; padding: 8px 12px; flex-shrink: 0; gap: 8px; }
  #header-status { font-size: 11px; color: rgba(255,255,255,.4); flex: 1; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #scene-info { font-size: 11px; color: rgba(255,255,255,.4); flex: 1; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #header-actions { display: flex; gap: 6px; align-items: center; flex-shrink: 0; }
  #close-btn { width: 22px; height: 22px; border-radius: 50%; border: 1px solid rgba(255,255,255,.15); background: rgba(0,0,0,.3); color: rgba(255,255,255,.4); font-size: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all .15s; }
  #close-btn:hover { background: rgba(255,60,60,.4); border-color: rgba(255,60,60,.5); color: #fff; }
  #variant-bar { display: flex; gap: 4px; align-items: center; width: 100%; max-width: 500px; padding: 6px 12px; flex-shrink: 0; overflow-x: auto; }
  .variant-link { font-size: 11px; padding: 3px 10px; border-radius: 12px; background: rgba(255,255,255,.06); color: rgba(255,255,255,.4); text-decoration: none; white-space: nowrap; transition: all .15s; }
  .variant-link:hover { background: rgba(255,255,255,.12); color: rgba(255,255,255,.7); }
  .variant-link.active { background: rgba(74,158,255,.2); color: #4a9eff; }
  #player-frame { flex: 1; width: 100%; max-width: 480px; min-height: 0; border-radius: 16px; overflow: hidden; border: 1px solid rgba(255,255,255,.08); background: #000; box-shadow: 0 4px 40px rgba(0,0,0,.6); margin: 0 12px; position: relative; }
  #root { width: 100%; height: 100%; }
  #reload-toast { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(74,158,255,.9); color: #fff; padding: 12px 24px; border-radius: 10px; font-size: 14px; font-weight: 600; opacity: 0; transition: opacity .3s; pointer-events: none; z-index: 200; backdrop-filter: blur(8px); }
  #reload-toast.show { opacity: 1; }
  #bottom-bar { display: flex; gap: 6px; align-items: center; width: 100%; max-width: 500px; padding: 8px 12px; flex-shrink: 0; }
  #edit-input, #label-input { flex: 1; padding: 8px 12px; border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.05); color: #eee; border-radius: 8px; font-size: 13px; outline: none; transition: border-color .15s; }
  #edit-input:focus, #label-input:focus { border-color: rgba(74,158,255,.5); }
  #edit-input::placeholder, #label-input::placeholder { color: rgba(255,255,255,.25); }
  #edit-btn, #label-btn { width: 32px; height: 32px; padding: 0; background: rgba(255,255,255,.06); color: rgba(255,255,255,.5); border: 1px solid rgba(255,255,255,.1); border-radius: 8px; cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center; transition: all .15s; flex-shrink: 0; }
  #edit-btn:hover, #label-btn:hover { background: rgba(74,158,255,.2); border-color: rgba(74,158,255,.4); color: #4a9eff; }
  #edit-btn:disabled, #label-btn:disabled { opacity: 0.3; cursor: wait; }
  #thumbnails { display: flex; gap: 6px; width: 100%; max-width: 500px; padding: 4px 12px; flex-shrink: 0; overflow-x: auto; scrollbar-width: thin; }
  #thumbnails::-webkit-scrollbar { height: 4px; }
  #thumbnails::-webkit-scrollbar-thumb { background: rgba(255,255,255,.15); border-radius: 2px; }
  .thumb-item { flex-shrink: 0; width: 64px; height: 48px; border-radius: 6px; overflow: hidden; cursor: pointer; border: 2px solid transparent; transition: all .15s; position: relative; background: rgba(255,255,255,.05); }
  .thumb-item:hover { border-color: rgba(74,158,255,.4); }
  .thumb-item.active { border-color: #4a9eff; box-shadow: 0 0 8px rgba(74,158,255,.3); }
  .thumb-item img { width: 100%; height: 100%; object-fit: cover; }
  .thumb-badge { position: absolute; top: 2px; right: 2px; width: 10px; height: 10px; border-radius: 50%; background: #4ade80; border: 1px solid rgba(0,0,0,.4); display: none; }
  .thumb-badge.has-label { display: block; }
  #timed-labels { width: 100%; max-width: 500px; padding: 2px 12px; flex-shrink: 0; display: flex; flex-direction: column; gap: 2px; max-height: 80px; overflow-y: auto; }
  .timed-label { display: flex; align-items: center; gap: 6px; padding: 3px 6px; border-radius: 4px; background: rgba(255,255,255,.04); font-size: 11px; color: rgba(255,255,255,.6); }
  .timed-label .tl-time { flex-shrink: 0; font-family: monospace; font-size: 10px; color: rgba(74,158,255,.7); min-width: 32px; }
  .timed-label .tl-text { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .timed-label .tl-del { width: 16px; height: 16px; border: none; background: rgba(255,60,60,.15); color: rgba(255,60,60,.5); border-radius: 3px; cursor: pointer; font-size: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; padding: 0; line-height: 1; }
  .timed-label .tl-del:hover { background: rgba(255,60,60,.3); color: #fff; }
  #saved-toast { position: fixed; bottom: 70px; left: 50%; transform: translateX(-50%); background: rgba(74,222,128,.9); color: #fff; padding: 8px 16px; border-radius: 8px; font-size: 12px; font-weight: 500; opacity: 0; transition: opacity .3s; pointer-events: none; z-index: 200; backdrop-filter: blur(8px); }
  #saved-toast.show { opacity: 1; }
  #scene-thumbnails { display: flex; gap: 6px; width: 100%; max-width: 500px; padding: 4px 12px; flex-shrink: 0; overflow-x: auto; scrollbar-width: thin; }
  #scene-thumbnails::-webkit-scrollbar { height: 4px; }
  #scene-thumbnails::-webkit-scrollbar-thumb { background: rgba(255,255,255,.15); border-radius: 2px; }
  .scene-pill { flex-shrink: 0; padding: 4px 12px; border-radius: 12px; cursor: pointer; border: 1px solid transparent; transition: all .15s; background: rgba(255,255,255,.06); color: rgba(255,255,255,.45); font-size: 11px; white-space: nowrap; }
  .scene-pill:hover { border-color: rgba(74,158,255,.4); color: rgba(255,255,255,.7); }
  .scene-pill.active { background: rgba(74,158,255,.2); border-color: #4a9eff; color: #4a9eff; }

  .subtitle-overlay>*{width:100%}

  /* ── Edit message panel ───────────────────────────────────────────── */
  #edit-message-overlay {
    position: absolute;
    left: 8px;
    right: 8px;
    top: 8px;
    z-index: 30;
    pointer-events: none;
  }
  #edit-message-panel {
    width: 100%;
    max-width: 100%;
    flex-shrink: 0;
    background: rgba(12,12,12,.78);
    border: 1px solid rgba(255,255,255,.08);
    border-radius: 10px;
    margin: 0;
    overflow: hidden;
    backdrop-filter: blur(8px);
    pointer-events: auto;
  }
  #edit-message-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px;
    font-size: 11px;
    color: rgba(255,255,255,.5);
    border-bottom: 1px solid rgba(255,255,255,.06);
  }
  #edit-message-minimize {
    width: 20px;
    height: 20px;
    padding: 0;
    background: rgba(255,255,255,.06);
    color: rgba(255,255,255,.4);
    border: 1px solid rgba(255,255,255,.1);
    border-radius: 4px;
    cursor: pointer;
    font-size: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all .15s;
  }
  #edit-message-minimize:hover {
    background: rgba(74,158,255,.2);
    border-color: rgba(74,158,255,.4);
    color: #4a9eff;
  }
  #edit-message-list {
    max-height: 150px;
    overflow-y: auto;
    padding: 6px 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    scrollbar-width: thin;
  }
  #edit-message-list::-webkit-scrollbar { width: 4px; }
  #edit-message-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,.15); border-radius: 2px; }
  .edit-message-empty {
    font-size: 11px;
    color: rgba(255,255,255,.25);
    padding: 8px 0;
    text-align: center;
  }
  .edit-message-entry {
    font-size: 11px;
    line-height: 1.5;
    padding: 4px 6px;
    border-radius: 6px;
    background: rgba(255,255,255,.03);
  }
  .edit-message-entry.error {
    background: rgba(255,60,60,.08);
  }
  .edit-role {
    font-weight: 600;
    color: rgba(255,255,255,.5);
    margin-right: 4px;
  }
  .edit-message-request {
    color: rgba(255,255,255,.6);
  }
  .edit-message-thinking {
    color: rgba(74,158,255,.7);
  }
  .edit-dots span {
    animation: editDotPulse 1.4s infinite;
    opacity: 0;
  }
  .edit-dots span:nth-child(1) { animation-delay: 0s; }
  .edit-dots span:nth-child(2) { animation-delay: 0.2s; }
  .edit-dots span:nth-child(3) { animation-delay: 0.4s; }
  @keyframes editDotPulse {
    0%   { opacity: 0; }
    50%  { opacity: 1; }
    100% { opacity: 0; }
  }
  .edit-message-response {
    color: rgba(74,222,128,.8);
    white-space: pre-wrap;
    word-break: break-word;
  }
  .edit-message-error {
    color: rgba(255,100,100,.8);
  }
  #edit-message-bar {
    display: block;
    width: auto;
    padding: 4px 12px;
    margin: 4px 12px;
    border-radius: 14px;
    border: 1px solid rgba(255,255,255,.1);
    background: rgba(74,158,255,.12);
    color: rgba(74,158,255,.8);
    font-size: 11px;
    cursor: pointer;
    transition: all .15s;
    flex-shrink: 0;
    white-space: nowrap;
  }
  #edit-message-bar:hover {
    background: rgba(74,158,255,.2);
    border-color: rgba(74,158,255,.4);
  }
</style>
</head>
<body>
<script>
  window.VARIANT = "${label}";
  window.MODE = "${mode}";
</script>
<div id="root"></div>
<script src="/player.js" type="module"></script>
</body>
</html>`;
}

// ─── HTTP Server ──────────────────────────────────────────────────────────
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const rawPath = url.pathname;

  // Extract variant label from URL path.
  // API paths (starting with /api/) are not variant-routed — they use ?variant= query param.
  // Everything else gets variant routing from the first path segment.
  const isApiPath = rawPath.startsWith("/api/");
  let path, variantLabel;

  if (isApiPath) {
    path = rawPath;
    variantLabel = url.searchParams.get("variant") || "default";
  } else {
    const parsed = parseVariantFromPath(rawPath);
    variantLabel = parsed.variant;
    path = parsed.subpath;
  }

  try {
    // API: Get or save labels (label mode)
    if (path === "/api/labels") {
      const labelsPath = join(dirname(VIDEO_JSON), "labels.json");
      if (req.method === "GET") {
        // Return the stream tree — descriptions on children are the labels
        try {
          const data = readFileSync(labelsPath, "utf-8");
          const parsed = JSON.parse(data);
          if (parsed.type || parsed.root) {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(data);
            return;
          }
        } catch { /* labels.json missing or invalid — fall through */ }
        // Fall back to compiled root for the default variant
        try {
          const root = await loadCompiledRoot("default");
          const tree = resolveAssetPaths(root);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(tree));
        } catch {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ type: "root", children: [] }));
        }
        return;
      }
      if (req.method === "POST") {
        let body = "";
        req.on("data", c => body += c);
        req.on("end", () => {
          try {
            const data = JSON.parse(body);

            // Granular label update: { sceneIndex, description, time, overall, removeTimed }
            if (typeof data.sceneIndex === "number") {
              // Load the compiled root to apply labels to the live tree
              loadCompiledRoot("default").then((root) => {
                const child = root?.children?.[data.sceneIndex];
                const media = child?.children?.[0];
                if (media) {
                  media.userHints = media.userHints || { overall: "", timed: {} };
                  if (data.removeTimed) {
                    delete media.userHints.timed[data.removeTimed];
                  } else if (typeof data.description === "string") {
                    if (data.overall) {
                      media.userHints.overall = data.description;
                    } else {
                      const timeMs = Math.round((data.time || 0) * 1000);
                      media.userHints.timed["at_" + timeMs] = data.description;
                    }
                  }
                  media.description = media.userHints.overall || Object.values(media.userHints.timed)[0] || undefined;
                }
                // Save the full tree to labels.json
                writeFileSync(labelsPath, JSON.stringify(root, null, 2), "utf-8");
              }).catch(() => {
                // If no compiled root, save the update as minimal labels.json
                writeFileSync(labelsPath, body, "utf-8");
              });
            } else {
              // Full labels.json body — save directly
              writeFileSync(labelsPath, body, "utf-8");
            }
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ saved: true, path: labelsPath }));
          } catch (e) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: e.message }));
          }
        });
        return;
      }
    }

    // API: Shutdown — kill the server, return control to terminal
    if (path === "/api/shutdown") {
      handleShutdown(req, res, "Close requested from browser — shutting down");
      return;
    }

    // API: Feedback from user
    if (path === "/api/feedback" && req.method === "POST") {
      let body = "";
      req.on("data", c => body += c);
      req.on("end", () => {
        try {
          const { text } = JSON.parse(body);
          const line = `[${new Date().toISOString()}] ${text}`;
          console.log(`\n  💬 USER FEEDBACK: ${text}\n`);
          try { writeFileSync(join(dirname(VIDEO_JSON), "feedback.txt"), line + "\n", { flag: "a" }); } catch {}
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ received: true }));
        } catch (e) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    // API: Edit — send prompt to the persistent rpc agent (startAgentProcess)
    if (path === "/api/edit" && req.method === "POST") {
      let body = "";
      req.on("data", c => body += c);
      req.on("end", async () => {
        try {
          const { text, currentTime, activeScene } = JSON.parse(body);
          if (!text) { res.writeHead(400); res.end(JSON.stringify({ error: "empty text" })); return; }

          editHistory.push(text);

          // Build user prompt with context (system prompt is fixed at agent startup)
          const timeStr = currentTime !== undefined ? `Current playback time: ${Number(currentTime).toFixed(1)}s` : "";
          const sceneStr = activeScene ? `Active scene: ${activeScene}` : "";
          const contextBlock = [timeStr, sceneStr].filter(Boolean).join("\n");
          const historyStr = editHistory.length > 1
            ? "Previous edits (in order):\n" + editHistory.slice(0, -1).map((e, i) => `${i+1}. ${e}`).join("\n") + "\n"
            : "";
          const userPrompt = `${contextBlock}
${historyStr}
Edit request: ${text}`;

          console.log(`  🤖 edit: ${text}  (${currentTime !== undefined ? currentTime.toFixed(1) + "s" : ""} ${activeScene || ""})`);

          // Push start event to SSE clients for real-time UI feedback
          ssePush({ type: "edit:start", request: text });

          // Send to the persistent rpc agent (one cold start; conversation kept in memory)
          const result = await sendToAgent(userPrompt);

          if (result.ok) {
            // Parse JSON summary from the agent's final assistant text
            let summary = "";
            let fileChanged = false;
            const raw = (result.output || "").trim();
            const jsonMatch = raw.match(/\{[\s\S]*"summary"[\s\S]*\}/);
            if (jsonMatch) {
              try {
                const parsed = JSON.parse(jsonMatch[0]);
                summary = parsed.summary || raw.substring(0, 120);
                fileChanged = parsed.fileChanged === true;
              } catch { summary = raw.substring(0, 120); }
            } else {
              summary = raw.substring(0, 120) || "done";
            }
            console.log(`  ✅ ${fileChanged ? "edited" : "no change"}: ${summary}`);
            console.log(`  📤 response summary="${summary}" fileChanged=${fileChanged}`);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ done: true, summary, fileChanged, output: "" }));
          } else {
            const msg = result.error || "failed";
            console.error(`  ❌ edit ${msg}: ${(result.output || "").trim().substring(0, 100)}`);
            ssePush({ type: "edit:error", error: msg });
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: msg, output: (result.output || "").trim().substring(0, 200) }));
          }
        } catch (e) {
          ssePush({ type: "edit:error", error: e.message });
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    // API: SSE stream for reload notifications + server-liveness monitor
    // When the browser tab closes, this connection drops → server shuts down
    // Grace period: wait 3s for reconnection (page reload), then exit
    if (path === "/api/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      });
      // Flush headers to client so EventSource.onopen fires
      res.write(":ok\n\n");
      sseClients.add(res);
      if (shutdownTimer) {
        clearTimeout(shutdownTimer);
        shutdownTimer = null;
      }
      req.on("close", () => {
        sseClients.delete(res);
        if (sseClients.size === 0) {
          shutdownTimer = setTimeout(() => {
            console.error("\n  🚪 Browser tab closed — shutting down\n");
            process.exit(0);
          }, 3000);
        }
      });
      return;
    }

    // API: Get video.json data for a specific variant
    if (path === "/api/video-data") {
      try {
        const root = await loadCompiledRoot(variantLabel);
        const rootOut = resolveAssetPaths(root);
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        });
        res.end(JSON.stringify(rootOut));
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }

    // API: Get scenes with media info for a specific variant
    if (path === "/api/scenes") {
      const { scenes, totalDuration } = getScenes(variantLabel);
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(scenes));
      return;
    }

    // API: Get current video info for a specific variant
    if (path === "/api/video-info") {
      const { scenes, totalDuration } = getScenes(variantLabel);
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify({
        scenes,
        totalDuration,
        variant: variantLabel,
        variants: VARIANT_CONFIGS.map(c => c.label),
        mode: { label: MODE_LABEL, edit: MODE_EDIT },
      }));
      return;
    }

    // Serve the main HTML page (variant-aware)
    if (path === "/" || path === "/index.html") {
      // If the resolved variant isn't compiled, fall back to the first
      // available variant. This handles the common case where the user
      // passes only --variant zh (no "default" variant exists) and opens
      // the root URL — the player will fetch the zh variant data instead
      // of failing on a non-existent "default" variant.
      let htmlVariant = variantLabel;
      if (!compiledRootCache.has(variantLabel) && VARIANT_CONFIGS.length > 0) {
        htmlVariant = VARIANT_CONFIGS[0].label;
      }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(getHtml(htmlVariant));
      return;
    }

    // Serve static files
    const assetPath = resolveAsset(path, variantLabel);
    if (assetPath && serveFile(req, res, assetPath)) return;

    res.writeHead(404);
    res.end("Not found");
  } catch (err) {
    try {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Server error: " + err.message);
    } catch {
      // Response already sent
    }
  }
});

server.listen(PORT, async () => {
  try {
    await initScenesPromise;
  } catch {
    // Pipeline failed — still announce ready so the player can show an error state
  }

  // Start persistent agent process for edit mode (after initial compilation)
  if (MODE_EDIT) {
    startAgentProcess();
  }

  const mode = MODE_LABEL ? " --label" : MODE_EDIT ? " --edit" : "";
  console.log(`\n🎬 Player ready at http://localhost:${PORT}${mode}`);
  if (VARIANT_CONFIGS.length > 1) {
    for (const config of VARIANT_CONFIGS) {
      const url = config.label === "default" ? `http://localhost:${PORT}` : `http://localhost:${PORT}/${config.label}`;
      console.log(`   ${config.label}: ${url}`);
    }
  }
  console.log(`   Watching: ${VIDEO_JSON.split("/").pop()}`);
  console.log("");
});
