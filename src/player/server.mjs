#!/usr/bin/env node
/**
 * Custom player server for markcut.
 *
 * Modes:
 *   --label   – playback with label input overlay; labels map to media timestamps
 *   --edit    – auto-reload when the JSON file changes (agent edits file, player refreshes)
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


const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
const PORT = parseInt(process.argv.find(a => a.startsWith("--port="))?.split("=")[1] || process.argv[process.argv.indexOf("--port") + 1] || "3001", 10);

// Find video input path (.json or .md)
const inputArg = process.argv.find(a => (a.endsWith(".json") || a.endsWith(".md")) && !a.startsWith("--"));
const VIDEO_JSON = inputArg ? resolve(inputArg) : join(ROOT, "video.json");
const IS_MARKDOWN = VIDEO_JSON.endsWith(".md");
const MODE_LABEL = process.argv.includes("--label");
const MODE_EDIT = process.argv.includes("--edit");

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

// ─── Label store for label mode ───────────────────────────────────────────
let labels = [];

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
        if (node.src.startsWith("generated/") || node.src.startsWith(BASENAME + "/")) {
          node.src = "/" + node.src;
        }
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
      baseDir: dirname(VIDEO_JSON),
      scriptOutputDir: TTS_OUTPUT_DIR,
      mediaOutputDir: MEDIA_OUTPUT_DIR,
      includeOutputDir: INCLUDE_CACHE_DIR,
      subtitleOutputDir: subtitleDir,
      variants: config.chain.length > 0 ? config.chain : undefined,
    });
    compiled = compileDescriptiveRoot(resolved);
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
        baseDir: dirname(VIDEO_JSON),
        scriptOutputDir: TTS_OUTPUT_DIR,
        mediaOutputDir: MEDIA_OUTPUT_DIR,
        includeOutputDir: INCLUDE_CACHE_DIR,
        subtitleOutputDir: subtitleDir,
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

// ─── Watch file for changes (--edit mode) ───────────────────────────────
if (MODE_EDIT) {
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

      for (const client of sseClients) {
        client.write("data: " + JSON.stringify({ type: "reload" }) + "\n\n");
      }
    } catch (e) {
      console.error("  ⚠️  Failed to re-process after change:", e.message);
    } finally {
      pipelineRunning = false;
    }
  });
}
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
  #header-status, #edit-status { font-size: 11px; color: rgba(255,255,255,.4); flex: 1; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #scene-info { font-size: 11px; color: rgba(255,255,255,.4); flex: 1; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #header-actions { display: flex; gap: 6px; align-items: center; flex-shrink: 0; }
  #close-btn { width: 22px; height: 22px; border-radius: 50%; border: 1px solid rgba(255,255,255,.15); background: rgba(0,0,0,.3); color: rgba(255,255,255,.4); font-size: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all .15s; }
  #close-btn:hover { background: rgba(255,60,60,.4); border-color: rgba(255,60,60,.5); color: #fff; }
  #variant-bar { display: flex; gap: 4px; align-items: center; width: 100%; max-width: 500px; padding: 6px 12px; flex-shrink: 0; overflow-x: auto; }
  .variant-link { font-size: 11px; padding: 3px 10px; border-radius: 12px; background: rgba(255,255,255,.06); color: rgba(255,255,255,.4); text-decoration: none; white-space: nowrap; transition: all .15s; }
  .variant-link:hover { background: rgba(255,255,255,.12); color: rgba(255,255,255,.7); }
  .variant-link.active { background: rgba(74,158,255,.2); color: #4a9eff; }
  #player-frame { flex: 1; width: 100%; max-width: 480px; min-height: 0; border-radius: 16px; overflow: hidden; border: 1px solid rgba(255,255,255,.08); background: #000; box-shadow: 0 4px 40px rgba(0,0,0,.6); margin: 0 12px; }
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
  .sthumb-item { flex-shrink: 0; width: 72px; cursor: pointer; border-radius: 6px; overflow: hidden; border: 2px solid transparent; transition: all .15s; background: rgba(255,255,255,.05); display: flex; flex-direction: column; }
  .sthumb-item:hover { border-color: rgba(74,158,255,.4); }
  .sthumb-item.active { border-color: #4a9eff; box-shadow: 0 0 8px rgba(74,158,255,.3); }
  .sthumb-media { width: 100%; height: 48px; overflow: hidden; position: relative; }
  .sthumb-media img, .sthumb-media video { width: 100%; height: 100%; object-fit: cover; }
  .sthumb-fallback { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,.08); color: rgba(255,255,255,.3); font-size: 16px; font-weight: 600; }
  .sthumb-name { font-size: 9px; color: rgba(255,255,255,.45); text-align: center; padding: 2px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
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

    // API: Edit — call pi one-shot to edit the JSON, player auto-reloads
    if (path === "/api/edit" && req.method === "POST") {
      let body = "";
      req.on("data", c => body += c);
      req.on("end", () => {
        try {
          const { text } = JSON.parse(body);
          if (!text) { res.writeHead(400); res.end(JSON.stringify({ error: "empty text" })); return; }

          editHistory.push(text);

          // Build tree structure description from current JSON (recursive, any depth)
          let treeInfo = "";
          try {
            const raw = readFileSync(VIDEO_JSON, "utf-8");
            const parsed = JSON.parse(raw);
            const root = parsed.root || parsed;

            function describeNode(node, depth) {
              const indent = "  ".repeat(depth);
              const id = node.id || "";
              const name = node.name || "";
              const label = name || id;
              const type = node.type || "unknown";
              const dur = node.durationInSeconds !== undefined ? `, ${node.durationInSeconds}s` : "";

              let line = `${indent}${type} "${label}"`;

              if (type === "root") {
                line += ` (${node.width}x${node.height}, ${node.fps}fps${node.isSeries ? ", series" : ""}${node.transition ? `, transition:${node.transition}` : ""}${node.theme ? `, theme:${node.theme}` : ""})`;
              } else if (type === "folder") {
                line += ` (${node.isSeries ? "series" : "parallel"}${node.transition ? `, transition:${node.transition}` : ""}${dur})`;
              } else if (type === "component") {
                const props = node.props ? JSON.stringify(Object.fromEntries(Object.entries(node.props).filter(([k]) => !k.startsWith("_")))) : "{}";
                line += ` ${node.componentName}(${props.slice(0, 100)})${dur}`;
              } else if (type === "subtitle") {
                const txt = (node.src || "").slice(0, 60);
                line += ` "${txt}"${dur}`;
              } else if (type === "video" || type === "audio" || type === "image") {
                const src = (node.src || "").slice(0, 50);
                line += ` "${src}"${dur}`;
              } else if (type === "effect") {
                line += ` animation:${node.animation || "custom"}${dur}`;
              } else if (type === "rhythm") {
                line += ` src:"${(node.src || "").slice(0, 40)}"${dur}`;
              } else if (type === "map") {
                line += ` waypoints:${(node.waypoints || []).length}${dur}`;
              } else if (type === "include") {
                line += ` src:"${(node.src || "").slice(0, 50)}"${dur}`;
              }

              // Add timing info for leaf spans (start/end live on the base node)
              if (typeof node.start === "number" || typeof node.end === "number") {
                const sStart = node.start ?? 0;
                const sEnd = node.end ?? sStart;
                line += ` [${sStart}→${sEnd}s`;
                if (node.isBackground) line += ", bg";
                if (node.volume !== undefined) line += `, vol:${node.volume}`;
                if (node.loop) line += `, loop:${node.loop}`;
                line += `]`;
              } else if (node.isBackground) {
                line += ` [bg]`;
              }

              // Add notable fields
              const extras = [];
              if (node.componentName) extras.push(node.componentName);
              if (node.fit) extras.push(`fit:${node.fit}`);
              if (node.fontSize) extras.push(`fontSize:${node.fontSize}`);
              if (node.volume !== undefined && type !== "root") extras.push(`vol:${node.volume}`);
              if (node.playbackRate) extras.push(`rate:${node.playbackRate}`);
              if (node.style) extras.push(`style:"${node.style.slice(0, 40)}"`);
              if (node.transitionTime !== undefined) extras.push(`transTime:${node.transitionTime}`);
              if (node.visible === false) extras.push("hidden");
              if (extras.length > 0) line += ` {${extras.join(", ")}}`;

              return line;
            }

            function walkTree(node, depth = 0) {
              const lines = [describeNode(node, depth)];
              if (node.children && node.children.length > 0) {
                const shown = node.children.filter(c => c.visible !== false || c.visible === undefined);
                for (const child of shown) {
                  lines.push(...walkTree(child, depth + 1));
                }
              }
              return lines;
            }

            treeInfo = walkTree(root).join("\n");
          } catch {}

          const historyStr = editHistory.length > 1
            ? "\nPrevious edits on this file (in order):\n" + editHistory.slice(0, -1).map((e, i) => `${i+1}. ${e}`).join("\n") + "\n"
            : "";

          const prompt = `You are editing ${VIDEO_JSON.split("/").pop()}, a Remotion stream tree JSON.

The stream tree (indentation shows nesting; timing in seconds):
${treeInfo || "(could not read tree)"}
${historyStr}
Edit request: ${text}

--- Knowledge ---
You can edit ANY field on ANY node in the JSON. Common fields across all types:
  - id, name, type, style (inline CSS string), visible (boolean)

Stream types:
  root: {width, height, fps, isSeries, transition, transitionTime, theme, stylesheet, children}
  folder: {isSeries (parallel if false), transition, transitionTime, children}
  video: {src, volume, playbackRate, width, height, actions}
  audio: {src, volume, foreground (ducks parent video), actions}
  image: {src, fit (contain/cover/fill), actions}
  subtitle: {src (text or VTT), cues[], fontSize, fontStyle, style, actions}
  component: {componentName, props:{}, src (remote URL), actions}
  effect: {animation (builtin name or "custom"), animationTimingFunction, animationIterationCount, customKeyframes, children, actions}
  rhythm: {src (audio), volume, spots[] (beat timestamps), children, actions}
  map: {waypoints[{lat,lng,label?,media?}], routeColor, routeWeight, markerSrc, zoom, actions}
  include: src (video JSON file path/URL), volume, actions — embeds an external video composition referenced by src. Falls back to inline children (legacy).

Actions (on leaf types): [{start, end, style?, volume?, effectId?, loop?}] — start/end in seconds, relative to parent container

Composition rules:
  - isSeries=true → children play sequentially (one after another), with optional transition between them
  - isSeries=false → children play in parallel, max duration wins (default)
  - isBackground=true → node loops for the full duration of its parent, excluded from duration calc
  - transition can be: "fade"|"slide"|"wipe"|"flip"|"clockWipe"

Subtitle styling: style field supports CSS (e.g. "color:#fff;font-size:48px"). fontSize field for quick sizing. Supports HTML in src for rich text. For word-highlight karaoke: set className:"karaoke" on cue, or provide words[{text,start,end}] array.

Themes: set root.theme = "cinematic"|"minimal"|"neon"|"corporate" or an inline theme JSON object. Default is "cinematic".
Global stylesheet: root.stylesheet = "CSS string" — selectors use .type and .name class names on each node.

IMPORTANT: Read the full existing JSON file before editing. Only edit the JSON file. You can change, add, or remove any field on any node. Output ONLY a one-line summary of what specific change you made. Do not add explanations.`;

          console.log(`  🤖 pi edit: ${text}`);
          const child = spawn("pi", ["-p", prompt], {
            cwd: ROOT,
            stdio: ["ignore", "pipe", "pipe"],
          });

          let output = "";
          child.stdout.on("data", d => output += d);
          child.stderr.on("data", d => output += d);

          child.on("exit", (code) => {
            if (code === 0) {
              console.log(`  ✅ pi edit complete`);
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ done: true, output: output.trim() }));
            } else {
              console.error(`  ❌ pi edit failed (exit ${code}): ${output.trim()}`);
              res.writeHead(500, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: `pi exited with code ${code}`, output: output.trim() }));
            }
          });
        } catch (e) {
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
        if (MODE_EDIT && sseClients.size === 0) {
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
        res.writeHead(200, { "Content-Type": "application/json" });
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
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(scenes));
      return;
    }

    // API: Get current video info for a specific variant
    if (path === "/api/video-info") {
      const { scenes, totalDuration } = getScenes(variantLabel);
      res.writeHead(200, { "Content-Type": "application/json" });
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
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(getHtml(variantLabel));
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

  const mode = MODE_LABEL ? " --label" : MODE_EDIT ? " --edit" : "";
  console.log(`\n🎬 Player ready at http://localhost:${PORT}${mode}`);
  if (VARIANT_CONFIGS.length > 1) {
    for (const config of VARIANT_CONFIGS) {
      const url = config.label === "default" ? `http://localhost:${PORT}` : `http://localhost:${PORT}/${config.label}`;
      console.log(`   ${config.label}: ${url}`);
    }
  }
  if (MODE_EDIT) console.log(`   Watching: ${VIDEO_JSON.split("/").pop()}`);
  console.log("");
});
