/**
 * Async pre-pass resolvers for the descriptive compiler.
 *
 * - resolveMediaDurations: probe actual video/audio duration via ffprobe
 * - resolveScripts: TTS each `script` to audio, STT to VTT, attach as children
 * - resolveIncludes: recursively resolve included descriptive markdown files
 *
 * These run BEFORE compileDescriptiveRoot() so the synchronous compiler
 * has complete duration and renderable children.
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, resolve as resolvePath, relative } from "node:path";
import {
  generateTTS,
  generateSTT,
  generateTTI,
  generateTTV,
  DEFAULT_TTS_CLI,
  DEFAULT_STT_CLI,
  DEFAULT_TTI_CLI,
  DEFAULT_TTV_CLI,
} from "../render/cli-tools";
import { walkDown } from "../utils";
import type { DescriptiveNode, DescriptiveRoot } from "./compiler";
import { compileDescriptiveRoot, parseImportsBlock, extractDependencySpecs } from "./compiler";
import { parseMarkdownDescriptive } from "./markdown";

// ── Content-hash cache for expensive operations (TTS, STT) ────────────────
// Skips regeneration when input hasn't changed. Cache key is a hash of all
// inputs that affect the output (script + cli template).

interface CacheEntry {
  hash: string;
  output: string;
}

function computeCacheKey(parts: Record<string, unknown>): string {
  const json = JSON.stringify(parts);
  return createHash("sha1").update(json).digest("hex").slice(0, 12);
}

function readCacheManifest(outputDir: string): Record<string, CacheEntry> {
  const manifestPath = join(outputDir, ".cache.json");
  try {
    return JSON.parse(readFileSync(manifestPath, "utf-8"));
  } catch {
    return {};
  }
}

function writeCacheManifest(outputDir: string, manifest: Record<string, CacheEntry>): void {
  const manifestPath = join(outputDir, ".cache.json");
  try {
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
  } catch {
    // best-effort
  }
}

/**
 * Returns cached output path if inputs unchanged AND output file still exists.
 * Otherwise returns null (caller should regenerate).
 */
function checkCache(
  manifest: Record<string, CacheEntry>,
  key: string,
  cacheKey: string,
): string | null {
  const entry = manifest[key];
  if (entry?.hash === cacheKey && entry.output && existsSync(entry.output)) {
    return entry.output;
  }
  return null;
}

function updateCache(
  manifest: Record<string, CacheEntry>,
  key: string,
  cacheKey: string,
  output: string,
): void {
  manifest[key] = { hash: cacheKey, output };
}

// ── Media Duration ─────────────────────────────────────────────────────────

export interface ResolveMediaOptions {
  /** Base directory for resolving relative src paths (default: cwd) */
  baseDir?: string;
  /** Skip nodes whose src matches this regex */
  skip?: RegExp;
}

/**
 * Probe actual media duration via ffprobe.
 * Returns duration in seconds, or null if probe fails.
 */
function probeDuration(src: string, baseDir?: string): number | null {
  const absPath = resolveSrc(src, baseDir);
  try {
    const out = execSync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${absPath}"`,
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout: 10_000 },
    ).trim();
    const d = parseFloat(out);
    return Number.isFinite(d) && d > 0 ? d : null;
  } catch {
    return null;
  }
}

function resolveSrc(src: string, baseDir?: string): string {
  if (/^(https?:|file:|\/)/.test(src)) return src;
  return resolvePath(baseDir ?? process.cwd(), src);
}

/**
 * Walk the descriptive tree and fill `duration` on video/audio nodes
 * that lack it, by probing actual media files.
 *
 * For video/audio without startFrom/endAt, also sets startFrom=0 and endAt=duration.
 */
export async function resolveMediaDurations(
  root: DescriptiveRoot,
  options: ResolveMediaOptions = {},
): Promise<DescriptiveRoot> {
  const clone: DescriptiveRoot = JSON.parse(JSON.stringify(root));
  const baseDir = options.baseDir;

  walkDown(clone as any, (node) => {
    const n = node as DescriptiveNode;
    if (n.type !== "video" && n.type !== "audio") return;
    if (typeof n.duration === "number" && n.duration > 0) return;
    if (typeof n.endAt === "number") return; // trim already specified
    if (!n.src) return;
    if (options.skip?.test(n.src)) return;

    const probed = probeDuration(n.src, baseDir);
    if (probed != null) {
      n.duration = probed;
      if (n.startFrom == null) (n as any).startFrom = 0;
      if (n.endAt == null) (n as any).endAt = probed;
    }
  });

  return clone;
}

// ── Script → TTS → STT ─────────────────────────────────────────────────────

export interface ResolveScriptOptions {
  /** Output directory for generated audio files */
  outputDir: string;
  /** CLI template override (default: edge-tts) */
  ttsCli?: string;
}

/**
 * Walk the descriptive tree and for each audio node with a `script` field:
 * 1. Generate TTS audio from script text → set as `src`
 * 2. Remove the `script` field from the node
 *
 * At this point in the pipeline, the parser has already converted all
 * container-level `script` attributes into audio children. This function
 * only needs to find those audio nodes and generate TTS for them.
 *
 * Subtitles are handled separately as a post-compile step that merges
 * per-clip VTTs (with absolute timing) into root.subtitle.src.
 */
export async function resolveScripts(
  root: DescriptiveRoot,
  options: ResolveScriptOptions,
): Promise<DescriptiveRoot> {
  const clone: DescriptiveRoot = JSON.parse(JSON.stringify(root));
  mkdirSync(options.outputDir, { recursive: true });
  const cache = readCacheManifest(options.outputDir);
  let cacheDirty = false;

  // Collect all audio nodes that have script text but no src yet
  // Also store their parent scene for per-scene tts resolution
  const allScriptNodes: Array<{ node: any; id: string; parent: any }> = [];
  walkDown(clone as any, (node, parent) => {
    if (node.type !== "audio") return;
    if (!node.script || typeof node.script !== "string") return;
    if (node.src) return; // already has real source
    const id = node.id ?? `audio-${allScriptNodes.length}`;
    allScriptNodes.push({ node, id, parent });
  });

  if (allScriptNodes.length > 0) {
    console.log(`  🔊 TTS: generating ${allScriptNodes.length} script${allScriptNodes.length > 1 ? "s" : ""}...`);
  }

  for (const { node, id, parent } of allScriptNodes) {
    // Resolve TTS config: parent scene tts > root tts > options ttsCli > default
    const ttsCli = parent?.tts ?? clone.tts ?? options.ttsCli ?? DEFAULT_TTS_CLI;

    // Content-addressed filename: hash of script + CLI, so identical scripts
    // across different source files share the same audio file.
    const cacheKey = computeCacheKey({ script: node.script, cli: ttsCli });
    const audioPath = join(options.outputDir, `${cacheKey}.mp3`);

    // Check cache — skip TTS if script + config unchanged AND audio file exists
    const cached = checkCache(cache, `tts:${cacheKey}`, cacheKey);
    let generated: string;
    if (cached) {
      generated = cached;
      console.log(`  ✓ TTS: ${cacheKey} (cached)`);
    } else {
      generated = generateTTS(node.script, audioPath, ttsCli);
      if (generated) {
        updateCache(cache, `tts:${cacheKey}`, cacheKey, generated);
        cacheDirty = true;
      } else {
        console.warn(`  ⚠ TTS produced no audio for ${cacheKey}. Audio will have no source. Check root.tts config.`);
      }
    }
    if (!generated) continue;

    // Set resolved src and remove script marker
    node.src = generated;
    delete node.script;
  }

  if (cacheDirty) writeCacheManifest(options.outputDir, cache);
  if (allScriptNodes.length > 0) {
    const unique = new Set(allScriptNodes.filter(s => s.node.src).map(s => s.node.src)).size;
    console.log(`  ✅ TTS: ${unique} unique audio file${unique > 1 ? "s" : ""} (${allScriptNodes.length} node${allScriptNodes.length > 1 ? "s" : ""})`);
  }
  return clone;
}

/**
 * Post-compile: walk the compiled stream tree, find all audio nodes whose
 * source was TTS-generated (relative path inside outputDir), run STT on each,
 * and merge the resulting per-clip VTTs into a single root.subtitle VTT with
 * absolute timestamps derived from the audio node's action start time.
 *
 * Sets root.subtitle.src on the returned root.
 */
export async function resolveSubtitles(
  root: DescriptiveRoot,
  options: {
    outputDir: string;
    sttCli?: string;
    /** Compiled stream tree with action start times, used for correct offset calculation. */
    compiled?: { children?: any[] };
  },
): Promise<DescriptiveRoot> {
  const clone: DescriptiveRoot = JSON.parse(JSON.stringify(root));
  const sttCli = clone.stt ?? options.sttCli ?? DEFAULT_STT_CLI;
  if (!sttCli) return clone;

  mkdirSync(options.outputDir, { recursive: true });
  const cache = readCacheManifest(options.outputDir);
  let cacheDirty = false;

  // Collect { audioSrc, absoluteOffset } from the compiled tree
  const clips: Array<{ audioSrc: string; offset: number }> = [];

  /**
   * Walk an array of sibling nodes, tracking cumulative offset for series layouts.
   *
   * In the compiled stream tree, container nodes (Folder/Scene) don't carry `actions`
   * — their position on the timeline is implicit in the `<Series>`/`<TransitionSeries>`
   * renderer which plays each child sequentially based on `durationInSeconds`.
   * This function replicates that logic to compute absolute audio offsets.
   */
  function walkSiblings(
    nodes: any[],
    parentOffset: number,
    parentIsSeries: boolean,
    parentTransition?: string,
    parentTransitionTime?: number,
  ): void {
    let seriesOffset = parentOffset;
    for (const node of nodes) {
      // In a series, each child starts after all previous siblings' durations.
      // In parallel, all children share the parent offset.
      const nodeStart = parentIsSeries ? seriesOffset : parentOffset;
      // Leaf nodes (video/audio/image/component) carry an action start offset
      // relative to the container start (e.g., parallel layout with staggered start).
      const actionStart = node.actions?.[0]?.start ?? 0;
      const effectiveOffset = nodeStart + actionStart;

      if (node.type === "audio" && node.src) {
        clips.push({ audioSrc: node.src, offset: effectiveOffset });
      }

      // Recurse into children — determine their layout from the node type
      if (node.children && node.children.length > 0) {
        let childIsSeries = false;
        let childTransition = undefined as string | undefined;
        let childTransitionTime = 0.5;

        if (node.type === "folder") {
          childIsSeries = node.isSeries ?? false;
          childTransition = node.transition;
          childTransitionTime = node.transitionTime ?? 0.5;
        } else if (node.type === "scene") {
          // A parallel scene has direct leaf children.
          // A series/transitionSeries scene wraps its children in a single Folder child.
          if (
            node.children.length === 1 &&
            node.children[0].type === "folder" &&
            node.children[0].isSeries
          ) {
            childIsSeries = true;
            childTransition = node.children[0].transition;
            childTransitionTime = node.children[0].transitionTime ?? 0.5;
          }
        }

        walkSiblings(node.children, effectiveOffset, childIsSeries, childTransition, childTransitionTime);
      }

      // In a series, advance the offset by this node's duration
      // so the next sibling starts after this one finishes.
      if (parentIsSeries && node.durationInSeconds) {
        const overlap = parentTransition ? (parentTransitionTime ?? 0.5) : 0;
        seriesOffset += node.durationInSeconds - overlap;
      }
    }
  }

  // Walk the compiled tree (with actions) for correct absolute offsets;
  // fall back to the descriptive tree if no compiled tree provided.
  const treeToWalk = options.compiled ?? (clone as any);
  walkSiblings(
    (treeToWalk as any).children ?? [],
    0,
    (treeToWalk as any).isSeries ?? false,
    (treeToWalk as any).transition,
    (treeToWalk as any).transitionTime,
  );

  // Run STT and collect VTT cues with absolute timestamps
  const mergedLines: string[] = ["WEBVTT", ""];
  let cueIndex = 1;

  let sttFailedCount = 0;

  for (const { audioSrc, offset } of clips) {
    // Cache key: audio hash + STT CLI string
    const audioHash = existsSync(audioSrc)
      ? createHash("sha1").update(readFileSync(audioSrc)).digest("hex").slice(0, 12)
      : audioSrc;
    const sttCacheKey = computeCacheKey({ audioHash, cli: sttCli });
    const sttKey = `stt:${audioSrc.split("/").pop()}`;
    const clipName = audioSrc.split("/").pop()!;

    let vttPath: string | null = null;
    // Cache per-clip STT by audio hash + CLI (individual VTT files are stable)
    const cachedVtt = checkCache(cache, sttKey, sttCacheKey);
    if (cachedVtt) {
      vttPath = cachedVtt;
    } else {
      try {
        await generateSTT(audioSrc, options.outputDir, sttCli);
        // Find generated VTT file
        const base = audioSrc.replace(/\.wav$/, "").replace(/\.mp3$/, "");
        const name = base.split("/").pop()!;
        const candidate = join(options.outputDir, `${name}.vtt`);
        if (existsSync(candidate)) {
          vttPath = candidate;
          updateCache(cache, sttKey, sttCacheKey, vttPath);
          cacheDirty = true;
        }
      } catch {
        console.warn(`  ⚠ STT failed for ${clipName}. Install whisper (pip install openai-whisper) or set root.stt.`);
        sttFailedCount++;
      }
    }

    if (!vttPath || !existsSync(vttPath)) continue;
    const vttText = readFileSync(vttPath, "utf-8");
    const blocks = vttText.replace(/\r\n/g, "\n").split(/\n\n+/);
    for (const block of blocks) {
      const lines = block.split("\n").filter(Boolean);
      const tline = lines.find((l) => l.includes("-->"));
      if (!tline) continue;
      const [a, z] = tline.split("-->").map((s) => s.trim());
      if (!a || !z) continue;
      const toSec = (ts: string) => {
        const parts = ts.split(":").map(Number);
        if (parts.length === 3) return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
        return parts[0]! * 60 + parts[1]!;
      };
      const formatSec = (s: number) => {
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = (s % 60).toFixed(3).padStart(6, "0");
        return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${sec}`;
      };
      const text = lines.slice(lines.indexOf(tline) + 1).join("\n").trim();
      mergedLines.push(String(cueIndex++));
      mergedLines.push(`${formatSec(toSec(a) + offset)} --> ${formatSec(toSec(z) + offset)}`);
      mergedLines.push(text, "");
    }
  }

  if (clips.length > 0) {
    const transcribed = clips.length - sttFailedCount;
    if (transcribed > 0 || sttFailedCount > 0) {
      console.log(`  📝 STT: ${transcribed} transcribed${sttFailedCount > 0 ? `, ${sttFailedCount} failed` : ""}`);
    }
  }

  if (cueIndex > 1) {
    const mergedPath = join(options.outputDir, "subtitles.vtt");
    writeFileSync(mergedPath, mergedLines.join("\n"), "utf-8");
    clone.subtitle = { ...(clone.subtitle ?? {}), src: mergedPath };
    console.log(`  ✅ STT: subtitles ready (${cueIndex - 1} cues)`);
  }

  if (cacheDirty) writeCacheManifest(options.outputDir, cache);
  return clone;
}

// ── Image & Video Generation (TTI / TTV) ──────────────────────────────────

export interface ResolveGeneratedMediaOptions {
  /** Output directory for generated media files */
  outputDir: string;
  /** Default TTI CLI template (overrides root.tti) */
  ttiCli?: string;
  /** Default TTV CLI template (overrides root.ttv) */
  ttvCli?: string;
}

/**
 * Walk the descriptive tree, find image/video nodes with `prompt` but no `src`,
 * run the configured TTI/TTV CLI to generate media, and set `src` to the output.
 *
 * Images: prompt → generate .png via TTI CLI
 * Videos: prompt → generate .mp4 via TTV CLI
 *
 * Both support content-hash caching (same prompt + same config → reuse).
 */
export async function resolveGeneratedMedia(
  root: DescriptiveRoot,
  options: ResolveGeneratedMediaOptions,
): Promise<DescriptiveRoot> {
  const clone: DescriptiveRoot = JSON.parse(JSON.stringify(root));
  mkdirSync(options.outputDir, { recursive: true });
  const cache = readCacheManifest(options.outputDir);
  let cacheDirty = false;

  // Collect all image/video nodes that have prompt but no src
  const genNodes: Array<{
    node: any;
    id: string;
    type: "image" | "video";
    prompt: string;
  }> = [];

  walkDown(clone as any, (node) => {
    if ((node.type !== "image" && node.type !== "video")) return;
    if (!node.prompt || typeof node.prompt !== "string") return;
    // Skip if src is already set (prompt is just metadata)
    if (node.src) return;
    const id = node.id ?? `${node.type}-${genNodes.length}`;
    genNodes.push({ node, id, type: node.type as "image" | "video", prompt: node.prompt });
  });

  for (const { node, id, type, prompt } of genNodes) {
    const ext = type === "image" ? "png" : "mp4";

    // Resolve TTI/TTV config: root-level config overrides CLI defaults
    const cli = type === "image"
      ? (clone.tti ?? options.ttiCli ?? DEFAULT_TTI_CLI)
      : (clone.ttv ?? options.ttvCli ?? DEFAULT_TTV_CLI);

    // Content-addressed filename: hash of prompt + CLI + type, so identical
    // prompts across different source files share the same generated media.
    const cacheKey = computeCacheKey({ prompt, cli, type });
    const outputPath = join(options.outputDir, `${cacheKey}.${ext}`);

    const cached = checkCache(cache, `gen:${cacheKey}`, cacheKey);
    const label = type === "image" ? "TTI" : "TTV";

    if (cached) {
      node.src = cached;
      console.log(`  ✓ ${label}: ${cacheKey} (cached)`);
      continue;
    }

    try {
      console.log(`  🔊 ${label}: ${cacheKey}...`);
      const ttiCmd = clone.tti ?? options.ttiCli ?? DEFAULT_TTI_CLI;
      const result = type === "image"
        ? generateTTI(prompt, outputPath, cli)
        : generateTTV(prompt, outputPath, cli, ttiCmd);
      if (result) {
        node.src = outputPath;
        updateCache(cache, `gen:${cacheKey}`, cacheKey, outputPath);
        cacheDirty = true;
        console.log(`  ✓ ${label}: ${cacheKey}`);
      } else {
        const hint = cli.includes("echo")
          ? `No ${label} tool installed. The default CLI just echoes a message — set root.${type === "image" ? "tti" : "ttv"} to a real generation command.`
          : `The command ran but produced no output file. Check the CLI template or run the script manually to debug.`;
        console.error(`  ⚠ ${label}: ${cacheKey} produced no output. ${hint}`);
      }
    } catch (err: any) {
      const hint = (err as any)?.stderr?.toString()?.includes("not found")
        ? `${label} tool not found. Install the required CLI or configure root.${type === "image" ? "tti" : "ttv"}.`
        : `Command failed. Try running the CLI template directly to debug: ${cli}`;
      console.error(`  ✗ ${label}: ${cacheKey} failed — ${err.message}. ${hint}`);
    }
  }

  if (cacheDirty) writeCacheManifest(options.outputDir, cache);
  return clone;
}

// ── Combined Pipeline ──────────────────────────────────────────────────────

export interface ResolveAllOptions extends ResolveMediaOptions {
  /** If set, enables script → TTS resolution */
  scriptOutputDir?: string;
  /** TTS CLI template override (default: edge-tts). Overrides root.tts. */
  ttsCli?: string;
  /** STT CLI template override (default: whisper). Overrides root.stt. */
  sttCli?: string;
  /** If set, enables TTI/TTV media generation from prompts */
  mediaOutputDir?: string;
  /** TTI CLI template override (default: pi agent). Overrides root.tti. */
  ttiCli?: string;
  /** TTV CLI template override (default: pi agent). Overrides root.ttv. */
  ttvCli?: string;
  /** If set, resolve includes. Directory where pre-compiled include JSON files are stored. */
  includeOutputDir?: string;
}

/**
 * Recursively resolve include nodes in the descriptive tree.
 *
 * For each `include` node with a `.md` src:
 *   1. Read and parse the referenced markdown file
 *   2. Recursively resolve it (media durations, TTS, STT, nested includes)
 *   3. Compile it to a stream tree Root
 *   4. Write the compiled Root to `includeOutputDir/<hash>.json`
 *   5. Write a companion `.meta.json` file with import entries for the server
 *   6. Update the include node's `src` to the compiled JSON path
 *   7. Stamp `durationInSeconds` with the sub-video's real duration
 *
 * After this step, the descriptive tree is fully resolved: all includes point
 * to pre-compiled JSON files with accurate durations. The server can then
 * bundle per-subvideo component imports using the companion meta files.
 */
export async function resolveIncludes(
  root: DescriptiveRoot,
  options: ResolveAllOptions = {},
): Promise<DescriptiveRoot> {
  const clone: DescriptiveRoot = JSON.parse(JSON.stringify(root));
  const baseDir = options.baseDir ?? process.cwd();
  const outputDir = options.includeOutputDir ?? join(baseDir, ".markcut", "generated", "includes");
  mkdirSync(outputDir, { recursive: true });

  // Extract imports block from raw markdown source (reusable helper)
  function extractImportEntriesFromRaw(raw: string): {
    entries: Array<{ name: string; from?: string; exports?: string }> | null;
    extraSpecs: string[];
    rawSource: string | null;
  } {
    const match = raw.match(/^(```|~~~)\s*js imports\s*\n([\s\S]*?)^\1\s*$/m);
    if (!match) return { entries: null, extraSpecs: [], rawSource: null };
    const src = match[2]!;
    const entries = parseImportsBlock(src);
    const extraSpecs = extractDependencySpecs(src);
    return { entries, extraSpecs, rawSource: src };
  }

  async function resolveOneInclude(
    includeNode: DescriptiveNode,
    parentBaseDir: string,
  ): Promise<void> {
    const n = includeNode as any;
    if (n.type !== "include") return;
    const src = n.src;
    if (!src || !src.endsWith(".md")) return;

    // Resolve the path
    const absPath = src.startsWith("/") ? src : resolvePath(parentBaseDir, src);
    if (!existsSync(absPath)) {
      console.warn(`  ⚠ Include "${src}" not found at ${absPath}`);
      return;
    }

    // Read and parse
    const raw = readFileSync(absPath, "utf-8");
    const subRoot = parseMarkdownDescriptive(raw);

    // Extract import info from the included file (for the server to bundle later)
    const { entries: importEntries, extraSpecs, rawSource } = extractImportEntriesFromRaw(raw);

    // Recursively resolve the sub-root (this handles nested includes too)
    // Use the same output dir so all compiled includes are co-located
    const resolved = await resolveAll(subRoot, {
      ...options,
      includeOutputDir: outputDir,
      baseDir: dirname(absPath),
    });

    // Compile to stream tree
    const compiled = compileDescriptiveRoot(resolved);

    // Determine duration
    const dur = compiled.durationInSeconds ?? compiled.children?.reduce(
      (max: number, c: any) => Math.max(max, c.durationInSeconds ?? 0), 0
    ) ?? 3;

    // Create a stable filename from the absolute path
    const hash = createHash("sha1").update(absPath).digest("hex").slice(0, 12);
    const compiledPath = join(outputDir, `${hash}.json`);
    const metaPath = join(outputDir, `${hash}.meta.json`);

    // Write companion meta file if there are imports
    if (importEntries && importEntries.length > 0) {
      const sourceName = absPath.split("/").pop().replace(/\.[^.]+$/, "");
      const meta = { importEntries, extraSpecs, rawSource, sourceName };
      writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf-8");
    }

    // Write compiled JSON (without imports field — the server will set it after bundling)
    const compiledJson = {
      root: {
        ...compiled,
        // Include a stub field so the server knows this needs bundling
        ...(importEntries && importEntries.length > 0 ? { _pendingImports: true } : {}),
      },
    };
    writeFileSync(compiledPath, JSON.stringify(compiledJson, null, 2), "utf-8");

    // Update the include node
    n.src = compiledPath;
    n.durationInSeconds = dur;
    n.duration = dur;
    // Remove children if any (the sub-video is now an external reference)
    delete n.children;

    console.log(`  🔗 Include resolved: ${src} → ${relative(process.cwd(), compiledPath)} (${dur.toFixed(1)}s)`);
  }

  // Walk the tree and resolve includes. We do a multi-pass approach:
  // first collect all includes, then resolve them (to avoid mutation during iteration).
  const includes: Array<{ node: DescriptiveNode; baseDir: string }> = [];
  walkDown(clone as any, (node, parent) => {
    if ((node as any).type === "include" && (node as any).src?.endsWith(".md")) {
      includes.push({ node: node as DescriptiveNode, baseDir: baseDir });
    }
  });

  for (const inc of includes) {
    await resolveOneInclude(inc.node, inc.baseDir);
  }

  return clone;
}

/**
 * Run all pre-pass resolvers in the correct order:
 * 0. Resolve includes (pre-compile referenced .md files to JSON)
 * 1. Generated media (TTI/TTV) — resolve image/video prompts to actual files
 * 2. Media duration probing
 * 3. Script → TTS (audio only) — uses root.tts / scene.tts / CLI options
 * 4. Post-compile: STT → VTT (subtitle) — uses root.stt / CLI options
 *
 * Step 0 runs first so that sub-video durations are known before duration
 * probing of the parent tree.
 */
export async function resolveAll(
  root: DescriptiveRoot,
  options: ResolveAllOptions = {},
): Promise<DescriptiveRoot> {
  let result = root;

  // Step 0: Resolve includes (pre-compile referenced .md files to JSON with accurate durations)
  // This must run first so sub-video durations inform the parent tree's layout.
  result = await resolveIncludes(result, options);

  // Step 1: Generate images/videos from prompts before probing durations
  if (options.mediaOutputDir) {
    result = await resolveGeneratedMedia(result, {
      outputDir: options.mediaOutputDir,
      ttiCli: options.ttiCli,
      ttvCli: options.ttvCli,
    });
  }

  // Step 2: Media duration probing
  result = await resolveMediaDurations(result, {
    baseDir: options.baseDir,
    skip: options.skip,
  });

  // Step 3: Script → TTS
  if (options.scriptOutputDir) {
    result = await resolveScripts(result, {
      outputDir: options.scriptOutputDir,
      ttsCli: options.ttsCli,
    });

    // Re-probe for newly generated TTS audio durations
    result = await resolveMediaDurations(result, {
      baseDir: options.baseDir,
      skip: options.skip,
    });

    // Post-compile subtitle generation (uses root.stt, options.sttCli, or default whisper CLI)
    const compiled = compileDescriptiveRoot(result);
    result = await resolveSubtitles(result, {
      outputDir: options.scriptOutputDir,
      sttCli: options.sttCli,
      compiled,
    });
  }

  return result;
}
