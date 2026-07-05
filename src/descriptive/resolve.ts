/**
 * Async pre-pass resolvers for the descriptive compiler.
 *
 * - resolveMediaDurations: probe actual video/audio duration via ffprobe
 * - resolveScripts: TTS each `script` to audio, STT to VTT, attach as children
 *
 * These run BEFORE compileDescriptiveRoot() so the synchronous compiler
 * has complete duration and renderable children.
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, resolve as resolvePath } from "node:path";
import { generateTTS } from "../render/tts";
import { walkDown } from "../utils";
import type { DescriptiveNode, DescriptiveRoot } from "./compiler";

// ── Content-hash cache for expensive operations (TTS, STT) ────────────────
// Skips regeneration when input hasn't changed. Cache key is a hash of all
// inputs that affect the output (script text + voice + rate + refAudio + cli).

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

const DEFAULT_WHISPER = "/Users/lir/Library/Python/3.9/bin/whisper";

/**
 * Transcribe a WAV file to VTT using whisper CLI.
 * Returns the VTT file path, or null on failure.
 */
function transcribeToVTT(
  audioPath: string,
  outputDir: string,
  whisperBin: string,
  model?: string,
  language?: string,
): string | null {
  try {
    const modelFlag = model ? `--model ${model}` : "--model tiny";
    const langFlag = language ? `--language ${language}` : "--language en";
    execSync(
      `"${whisperBin}" "${audioPath}" --output_format vtt --output_dir "${outputDir}" ${modelFlag} ${langFlag}`,
      { stdio: ["pipe", "pipe", "pipe"], timeout: 120_000 },
    );
    const base = audioPath.replace(/\.wav$/, "").replace(/\.mp3$/, "");
    const name = base.split("/").pop()!;
    const vttPath = join(outputDir, `${name}.vtt`);
    return existsSync(vttPath) ? vttPath : null;
  } catch {
    return null;
  }
}

/**
 * Walk the descriptive tree and for each scene node with a `script` field:
 * 1. Generate TTS audio from script text → attach as audio child
 *
 * Only `scene` nodes carry narration. When scenes nest, the **innermost**
 * scene's script wins — if a parent scene has `script` but any descendant
 * scene also has `script`, only the descendant is processed (the parent's
 * narration is skipped). This prevents overlapping narration.
 *
 * Leaf nodes (image/video/etc.) with `script` are ignored — they have no
 * `children` in the compiled stream tree.
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

  // First pass: collect all nodes (scenes + containers) that have script
  const allScriptNodes: Array<{ node: any; id: string }> = [];
  walkDown(clone as any, (node) => {
    if (node.type !== "scene" && node.type !== "series" && node.type !== "parallel" && node.type !== "transitionSeries") return;
    if (!node.script || typeof node.script !== "string") return;
    const existing = (node.children ?? []) as DescriptiveNode[];
    if (existing.some((c) => c.type === "audio")) return;
    const id = node.id ?? node.name ?? `node-${allScriptNodes.length}`;
    allScriptNodes.push({ node, id });
  });

  // Second pass: filter out parent nodes where a descendant also has script
  // (innermost wins — prevents overlapping narration)
  function hasDescendantWithScript(node: any): boolean {
    for (const child of node.children ?? []) {
      if ((child.type === "scene" || child.type === "series" || child.type === "parallel" || child.type === "transitionSeries") && child.script) return true;
      if (hasDescendantWithScript(child)) return true;
    }
    return false;
  }

  const toProcess = allScriptNodes.filter(({ node }) => !hasDescendantWithScript(node));

  for (const { node, id } of toProcess) {
    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, "_");
    const audioPath = join(options.outputDir, `${safeId}.wav`);

    // Resolve TTS config: scene-level overrides root-level overrides CLI defaults
    const ttsCli = node.tts?.cli ?? clone.tts?.cli ?? options.ttsCli;

    // Cache key: script + CLI string
    const cacheKey = computeCacheKey({ script: node.script, cli: ttsCli });

    // Check cache — skip TTS if script + config unchanged AND audio file exists
    const cached = checkCache(cache, `tts:${safeId}`, cacheKey);
    let generated: string;
    if (cached) {
      generated = cached;
    } else {
      generated = generateTTS(node.script, audioPath, ttsCli);
      if (generated) {
        updateCache(cache, `tts:${safeId}`, cacheKey, generated);
        cacheDirty = true;
      }
    }
    if (!generated) continue;

    if (!node.children) node.children = [];
    node.children.push({ type: "audio", src: generated, volume: 1 });
  }

  if (cacheDirty) writeCacheManifest(options.outputDir, cache);
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
  options: { outputDir: string; sttCli?: string },
): Promise<DescriptiveRoot> {
  const clone: DescriptiveRoot = JSON.parse(JSON.stringify(root));
  const sttCli = clone.stt?.cli ?? options.sttCli ?? `whisper "{input}" --output_format vtt --output_dir "{outputDir}"`;
  if (!sttCli) return clone;

  mkdirSync(options.outputDir, { recursive: true });
  const cache = readCacheManifest(options.outputDir);
  let cacheDirty = false;

  // Collect { audioSrc, absoluteOffset } from the compiled tree
  const clips: Array<{ audioSrc: string; offset: number }> = [];
  function walkCompiled(node: any, parentOffset: number): void {
    const start = node.actions?.[0]?.start ?? 0;
    const offset = parentOffset + start;
    if (node.type === "audio" && node.src) {
      clips.push({ audioSrc: node.src, offset });
    }
    for (const child of node.children ?? []) {
      walkCompiled(child, offset);
    }
  }
  for (const child of (clone as any).children ?? []) walkCompiled(child, 0);

  // Run STT and collect VTT cues with absolute timestamps
  const mergedLines: string[] = ["WEBVTT", ""];
  let cueIndex = 1;

  for (const { audioSrc, offset } of clips) {
    // Cache key: audio hash + STT CLI string
    const audioHash = existsSync(audioSrc)
      ? createHash("sha1").update(readFileSync(audioSrc)).digest("hex").slice(0, 12)
      : audioSrc;
    const sttCacheKey = computeCacheKey({ audioHash, cli: sttCli });
    const sttKey = `stt:${audioSrc.split("/").pop()}`;

    let vttPath: string | null = null;
    const cachedVtt = checkCache(cache, sttKey, sttCacheKey);
    if (cachedVtt) {
      vttPath = cachedVtt;
    } else {
      // Run STT CLI with {input} and {outputDir} substitution
      const cmd = sttCli
        .replace(/\{input\}/g, audioSrc)
        .replace(/\{outputDir\}/g, options.outputDir);
      try {
        execSync(cmd, { stdio: ["pipe", "pipe", "pipe"], timeout: 120_000 });
      } catch { /* STT failed, skip */ }
      // Find generated VTT file
      const base = audioSrc.replace(/\.wav$/, "").replace(/\.mp3$/, "");
      const name = base.split("/").pop()!;
      const candidate = join(options.outputDir, `${name}.vtt`);
      if (existsSync(candidate)) {
        vttPath = candidate;
        updateCache(cache, sttKey, sttCacheKey, vttPath);
        cacheDirty = true;
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

  if (cueIndex > 1) {
    const mergedPath = join(options.outputDir, "subtitles.vtt");
    writeFileSync(mergedPath, mergedLines.join("\n"), "utf-8");
    clone.subtitle = { src: mergedPath };
  }

  if (cacheDirty) writeCacheManifest(options.outputDir, cache);
  return clone;
}

// ── Image & Video Generation (TTI / TTV) ──────────────────────────────────

export interface ResolveGeneratedMediaOptions {
  /** Output directory for generated media files */
  outputDir: string;
  /** Default TTI CLI template (overrides root.tti.cli) */
  ttiCli?: string;
  /** Default TTV CLI template (overrides root.ttv.cli) */
  ttvCli?: string;
}

const DEFAULT_TTI_CLI = 'pi --model agnes-2.0-flash --print "generate image: {prompt}" --output "{output}"';
const DEFAULT_TTV_CLI = 'pi --model agnes-2.0-flash --print "generate video: {prompt}" --output "{output}"';

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
    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, "_");
    const ext = type === "image" ? "png" : "mp4";
    const outputPath = join(options.outputDir, `${safeId}.${ext}`);

    // Resolve TTI/TTV config: root-level config overrides CLI defaults
    const rootTti = clone.tti ?? {};
    const rootTtv = clone.ttv ?? {};
    const cli = type === "image"
      ? (rootTti.cli ?? options.ttiCli ?? DEFAULT_TTI_CLI)
      : (rootTtv.cli ?? options.ttvCli ?? DEFAULT_TTV_CLI);

    // Cache key: prompt + CLI template (encodes all model/style params)
    const cacheKey = computeCacheKey({ prompt, cli, type });

    const cached = checkCache(cache, `gen:${safeId}`, cacheKey);
    if (cached) {
      node.src = cached;
      continue;
    }

    // Build the CLI command — substitute {prompt}, {output}
    const cmd = cli
      .replace(/\{prompt\}/g, prompt.replace(/"/g, '\\"'))
      .replace(/\{output\}/g, outputPath);

    try {
      console.log(`  Generating ${type}: ${safeId}...`);
      execSync(cmd, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 300_000, // 5 min
      });
      if (existsSync(outputPath)) {
        node.src = outputPath;
        updateCache(cache, `gen:${safeId}`, cacheKey, outputPath);
        cacheDirty = true;
      } else {
        console.error(`  ⚠ ${type} generation produced no output: ${safeId}`);
      }
    } catch (err: any) {
      console.error(`  ✗ ${type} generation failed for ${safeId}: ${err.message}`);
      // Keep prompt but leave src empty — compilation will warn about it
    }
  }

  if (cacheDirty) writeCacheManifest(options.outputDir, cache);
  return clone;
}

// ── Combined Pipeline ──────────────────────────────────────────────────────

export interface ResolveAllOptions extends ResolveMediaOptions {
  /** If set, enables script → TTS resolution */
  scriptOutputDir?: string;
  /** Whisper binary path; enables post-compile STT subtitle generation */
  whisperBin?: string;
  /** CLI template (default: edge-tts) */
  ttsCli?: string;
  /** TTS voice override (default: en-US-GuyNeural) */
  voice?: string;
  /** TTS rate override (e.g. "+20%") */
  rate?: string;
  /** Reference audio path for voice cloning */
  refAudio?: string;
  /** Extra TTS options as key-value pairs */
  ttsOptions?: Record<string, string>;
  /** STT model override (default: tiny) */
  sttModel?: string;
  /** STT language override (default: en) */
  sttLanguage?: string;
  /** If set, enables TTI/TTV media generation from prompts */
  mediaOutputDir?: string;
  /** TTI CLI template override */
  ttiCli?: string;
  /** TTV CLI template override */
  ttvCli?: string;
}

/**
 * Run all pre-pass resolvers in the correct order:
 * 1. Generated media (TTI/TTV) — resolve image/video prompts to actual files
 * 2. Media duration probing
 * 3. Script → TTS (audio only) — uses root.tts / scene.tts / CLI options
 * 4. Post-compile: STT → VTT (subtitle) — uses root.stt / CLI options
 */
export async function resolveAll(
  root: DescriptiveRoot,
  options: ResolveAllOptions = {},
): Promise<DescriptiveRoot> {
  let result = root;

  // Step 0: Generate images/videos from prompts before probing durations
  if (options.mediaOutputDir) {
    result = await resolveGeneratedMedia(result, {
      outputDir: options.mediaOutputDir,
      ttiCli: options.ttiCli,
      ttvCli: options.ttvCli,
    });
  }

  result = await resolveMediaDurations(result, {
    baseDir: options.baseDir,
    skip: options.skip,
  });

  if (options.scriptOutputDir) {
    result = await resolveScripts(result, {
      outputDir: options.scriptOutputDir,
      ttsCli: options.ttsCli,
      voice: options.voice,
      rate: options.rate,
      refAudio: options.refAudio,
      ttsOptions: options.ttsOptions,
    });

    // Re-probe for newly generated TTS audio durations
    result = await resolveMediaDurations(result, {
      baseDir: options.baseDir,
      skip: options.skip,
    });

    // Post-compile subtitle generation
    if (options.whisperBin) {
      // compile first to get absolute timings, then resolveSubtitles
      const { compileDescriptiveRoot } = await import("./compiler");
      const compiled = compileDescriptiveRoot(result, { mode: "draft" });
      result = await resolveSubtitles(result, {
        outputDir: options.scriptOutputDir,
        whisperBin: options.whisperBin,
        sttModel: options.sttModel,
        sttLanguage: options.sttLanguage,
      });
    }
  }

  return result;
}
