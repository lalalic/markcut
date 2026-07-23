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
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, renameSync } from "node:fs";
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
import { compileDescriptiveRoot, parseImportsBlock, extractDependencySpecs, resolveTemplateVars, resolveVariantOverrides } from "./compiler";
import { parseMarkdownDescriptive, parseMarkdownVariants } from "./markdown";

// ── Content-hash cache for expensive operations (TTS, STT) ────────────────
// Output files are named by content hash — the filesystem IS the cache.
// If a file named `<hash>.<ext>` exists, it's guaranteed to match its inputs.
// No manifest file needed.

function computeCacheKey(parts: Record<string, unknown>): string {
  const json = JSON.stringify(parts);
  return createHash("sha1").update(json).digest("hex").slice(0, 12);
}

// ── Media Duration ─────────────────────────────────────────────────────────

/** First N words of a string, safe for log labels. */
function firstWords(text: string, n: number): string {
  if (!text) return "";
  return text.split(/\s+/).slice(0, n).join(" ").replace(/[^a-zA-Z0-9\u4e00-\u9fff\s-]/g, "").slice(0, 60) || text.slice(0, 60);
}

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
 * Common display resolutions for best-match fallback, ordered by popularity.
 * Used when a pattern-based src (e.g. photo_${width}x${height}.jpg) doesn't
 * have an exact file match — the resolver tries nearby resolutions and picks
 * the one with the closest aspect ratio.
 */
const COMMON_RESOLUTIONS: Array<{ width: number; height: number }> = [
  { width: 1920, height: 1080 },  // 16:9
  { width: 1080, height: 1920 },  // 9:16
  { width: 1080, height: 1080 },  // 1:1
  { width: 3840, height: 2160 },  // 4K 16:9
  { width: 2560, height: 1440 },  // 2K 16:9
  { width: 1280, height: 720 },   // HD 16:9
  { width: 640, height: 480 },    // 4:3
];

/**
 * Resolve a potentially pattern-based media src to the best matching file.
 *
 * If `src` doesn't contain pattern placeholders, returns `resolveSrc(src, baseDir)`.
 *
 * If `src` contains placeholders (resolved via `width`/`height`), it:
 * 1. Generates the exact-dimension path
 * 2. If the exact file doesn't exist, tries COMMON_RESOLUTIONS sorted by
 *    closest aspect-ratio match
 * 3. Falls back to the exact-dimension path if nothing matches
 *
 * This allows authors to write:
 *   image src:photo_${width}x${height}.jpg
 * And have the resolver pick photo_1920x1080.jpg for landscape or
 * photo_1080x1920.jpg for portrait, with fallback to nearby resolutions.
 */
export function resolveMediaSrc(
  src: string,
  targetWidth: number,
  targetHeight: number,
  baseDir?: string,
): string {
  // If no pattern, direct resolve
  if (!src.includes("${")) {
    return resolveSrc(src, baseDir);
  }

  // Build template context from targets
  const ctx = { width: targetWidth, height: targetHeight, fps: 30, variant: "video" };

  // Exact match: resolve placeholders to exact target dimensions
  const exactPath = resolveTemplateVars(src, ctx);
  const exactAbs = resolveSrc(exactPath, baseDir);
  if (existsSync(exactAbs)) {
    return exactAbs;
  }

  // Best-match fallback: try common resolutions sorted by closest aspect ratio
  const targetRatio = targetWidth / targetHeight;
  const scored = COMMON_RESOLUTIONS.map((r) => {
    const ratio = r.width / r.height;
    const score = Math.abs(ratio - targetRatio);
    return { ...r, score };
  }).sort((a, b) => a.score - b.score);

  for (const res of scored) {
    const candidate = resolveTemplateVars(src, { width: res.width, height: res.height, fps: 30, variant: "video" });
    const candidateAbs = resolveSrc(candidate, baseDir);
    if (existsSync(candidateAbs)) {
      console.log(`  📐 Media src matched: ${candidate} (${res.width}x${res.height}) for target ${targetWidth}x${targetHeight}`);
      return candidateAbs;
    }
  }

  // No fallback matched — return the exact path (will 404 gracefully)
  console.warn(`  ⚠ No matching media file for "${src}" at ${targetWidth}x${targetHeight}`);
  return exactAbs;
}

/**
 * Walk the descriptive tree and resolve pattern-based src fields using
 * best-match resolution. Should be called after resolveAllTemplateVars
 * so that `${width}`/`${height}` are replaced with actual values first.
 */
export async function resolveMediaSrcs(
  root: DescriptiveRoot,
  options: ResolveMediaOptions = {},
): Promise<DescriptiveRoot> {
  const clone: DescriptiveRoot = JSON.parse(JSON.stringify(root));
  const baseDir = options.baseDir;
  const targetWidth = clone.width ?? 1080;
  const targetHeight = clone.height ?? 1920;

  walkDown(clone as any, (node) => {
    const n = node as any;
    if (n.src && typeof n.src === "string" && n.src.includes("${")) {
      n.src = resolveMediaSrc(n.src, targetWidth, targetHeight, baseDir);
    }
    if (n.prompt && typeof n.prompt === "string" && n.prompt.includes("${")) {
      n.prompt = resolveTemplateVars(n.prompt, {
        width: targetWidth,
        height: targetHeight,
        fps: clone.fps ?? 30,
        variant: "video",
      });
    }
  });

  return clone;
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

// ── Dialogue expansion ──────────────────────────────────────────────────────

/**
 * Detect if a script contains multi-turn dialogue in `SpeakerName: text` format.
 *
 * A script is a "dialogue" if at least 2 lines match the pattern `Name: text`.
 * Single-line `SpeakerName: text` is NOT treated as dialogue — it's just a
 * regular script with a speaker annotation.
 *
 * Example dialogue:
 * ```
 * Ray: Hello everyone and welcome
 * Alice: Good day to you all
 * Ray: Let's get started
 * ```
 *
 * Each line becomes a separate audio node with:
 * - `script`: just the text (without the "SpeakerName: " prefix)
 * - `speaker`: the speaker name
 *
 * The dialogue lines are wrapped in a series container so they play sequentially
 * regardless of the parent scene's layout.
 */
export function parseDialogueLines(script: string): Array<{ speaker: string; text: string }> {
  const lines = script.split("\n").map(l => l.trim()).filter(Boolean);
  const dialoguePattern = /^([\w\u4e00-\u9fff][\w\s\u4e00-\u9fff]*?):\s*(.+)$/;

  const result: Array<{ speaker: string; text: string }> = [];
  for (const line of lines) {
    const match = line.match(dialoguePattern);
    if (!match) return []; // Any non-matching line invalidates the dialogue format
    result.push({ speaker: match[1]!.trim(), text: match[2]!.trim() });
  }

  // Require at least 2 lines to be considered a dialogue
  return result.length >= 2 ? result : [];
}

/**
 * Walk the descriptive tree and expand multi-turn dialogue-formatted scripts
 * into sequential per-line audio nodes.
 *
 * This runs BEFORE resolveScripts so each dialogue line gets its own TTS
 * generation with the correct per-speaker voice.
 */
export function resolveDialogue(root: DescriptiveRoot): DescriptiveRoot {
  const clone: DescriptiveRoot = JSON.parse(JSON.stringify(root));

  // Collect dialogue nodes for expansion (walking and modifying simultaneously is tricky)
  const expansions: Array<{
    parent: any;
    index: number;
    originalNode: any;
    lines: Array<{ speaker: string; text: string }>;
  }> = [];

  walkDown(clone as any, (node, parent) => {
    if (node.type !== "audio") return;
    if (!node.script || typeof node.script !== "string") return;
    if (node.src) return; // Already has a real source

    const lines = parseDialogueLines(node.script);
    if (lines.length < 2) return; // Not a dialogue

    if (!parent || !Array.isArray(parent.children)) return;
    const idx = parent.children.indexOf(node);
    if (idx === -1) return;

    expansions.push({ parent, index: idx, originalNode: node, lines });
  });

  if (expansions.length === 0) return root;

  // Apply expansions in reverse index order so splice indices stay valid
  expansions.sort((a, b) => b.index - a.index);

  for (const { parent, index, originalNode, lines } of expansions) {
    const dialogueNodes: any[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const { speaker, text } = line;
      const lineNode: any = {
        ...originalNode,
        id: originalNode.id ? `${originalNode.id}-line-${i}` : undefined,
        script: text,
        speaker,
        start: 0,
        duration: undefined, // Will be set by TTS duration probing
      };
      delete lineNode.src;
      dialogueNodes.push(lineNode);
    }

    // Wrap dialogue lines in a series container for sequential playback
    const seriesContainer: any = {
      type: "series",
      id: `${originalNode.id ?? "dialogue"}-series`,
      children: dialogueNodes,
    };

    // Replace the original node with the series container
    parent.children.splice(index, 1, seriesContainer);
  }

  const expanded = expansions.length > 0 ? clone : root;
  const count = expansions.reduce((sum, e) => sum + e.lines.length, 0);
  console.log(`  💬 dialogue: expanded ${expansions.length} script${expansions.length > 1 ? "s" : ""} into ${count} lines`);
  return expanded;
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

  // Collect all audio nodes that have script text but no src yet
  const allScriptNodes: Array<{ node: any; id: string }> = [];
  walkDown(clone as any, (node) => {
    if (node.type !== "audio") return;
    if (!node.script || typeof node.script !== "string") return;
    if (node.src) return; // already has real source
    const id = node.id ?? `audio-${allScriptNodes.length}`;
    allScriptNodes.push({ node, id });
  });

  const totalScripts = allScriptNodes.length;
  let scriptsDone = 0;
  let cacheHits = 0;
  const ttsStart = Date.now();

  if (totalScripts > 0) {
    console.log(`  🔊 TTS: generating ${totalScripts} script${totalScripts > 1 ? "s" : ""}...`);
  }

  for (const { node, id } of allScriptNodes) {
    scriptsDone++;
    // TTS CLI from root config only
    let ttsCli = clone.tts ?? options.ttsCli ?? DEFAULT_TTS_CLI;

    // Per-speaker voice appends extra CLI flags from root voices config
    if (node.speaker && clone.voices) {
      const speakerVoice = clone.voices[node.speaker];
      if (speakerVoice) {
        ttsCli = `${ttsCli} ${speakerVoice}`;
      }
    }

    // Content-addressed filename: hash of script + CLI, so identical scripts
    // across different source files share the same audio file.
    const cacheKey = computeCacheKey({ script: node.script, cli: ttsCli });
    const audioPath = join(options.outputDir, `${cacheKey}.mp3`);

    // Content-addressed cache: file is named by hash — if it exists, it's valid
    let generated: string;
    const speakerLabel = node.speaker ? `${node.speaker}: ` : "";
    const label = `${speakerLabel}${firstWords(node.script, 8)}`;
    if (existsSync(audioPath)) {
      generated = audioPath;
      cacheHits++;
      console.log(`  ✓ TTS: ${label} (cached)`);
    } else {
      console.log(`  🔊 TTS (${scriptsDone}/${totalScripts}): ${label}...`);
      generated = generateTTS(node.script, audioPath, ttsCli);
      if (generated) {
        console.log(`  ✓ TTS (${scriptsDone}/${totalScripts}): ${label}`);
      } else {
        console.warn(`  ⚠ TTS produced no audio for "${label}". Audio will have no source. Check root.tts config.`);
      }
    }
    if (!generated) continue;

    // Set resolved src (normalize to absolute for reliable probing later)
    node.src = resolvePath(generated);
    delete node.script;
  }

  if (totalScripts > 0) {
    const ttsElapsed = Math.round((Date.now() - ttsStart) / 1000);
    const unique = new Set(allScriptNodes.filter(s => s.node.src).map(s => s.node.src)).size;
    console.log(`  ✅ TTS: ${unique} unique audio${unique > 1 ? "s" : ""} (${scriptsDone} nodes) in ${ttsElapsed}s (${cacheHits} cached)`);
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
    /** Separate output directory for the merged subtitles.vtt.
     *  When set, per-clip VTTs stay in outputDir (shared cache) while
     *  the merged VTT goes here (e.g., per-variant). Defaults to outputDir. */
    mergedOutputDir?: string;
  },
): Promise<DescriptiveRoot> {
  const clone: DescriptiveRoot = JSON.parse(JSON.stringify(root));
  const sttCli = clone.stt ?? options.sttCli ?? DEFAULT_STT_CLI;
  if (!sttCli) return clone;

  mkdirSync(options.outputDir, { recursive: true });

  // Collect { audioSrc, absoluteOffset } from the compiled tree
  const clips: Array<{ audioSrc: string; offset: number; speaker?: string }> = [];

  /**
   * Walk an array of sibling nodes, tracking cumulative offset for series layouts.
   *
   * In the compiled stream tree, container nodes (Folder/Scene) don't carry leaf
   * timing (start/end) — their position on the timeline is implicit in the
   * `<Series>`/`<TransitionSeries>` renderer which plays each child sequentially
   * based on `durationInSeconds`. This function replicates that logic to compute
   * absolute audio offsets.
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
      // Skip background children — they are rendered outside the series as
      // parallel overlays (see FolderLeaf), so they don't advance the offset.
      if (node.isBackground) continue;

      // In a series, each child starts after all previous siblings' durations.
      // In parallel, all children share the parent offset.
      const nodeStart = parentIsSeries ? seriesOffset : parentOffset;
      // Leaf nodes carry a start offset relative to the container start
      // (e.g., parallel layout with staggered start) directly on the base field.
      const actionStart = node.start ?? 0;
      const effectiveOffset = nodeStart + actionStart;

      if (node.type === "audio" && node.src) {
        clips.push({ audioSrc: node.src, offset: effectiveOffset, speaker: node.speaker });
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

  // Walk the compiled tree (with base timing) for correct absolute offsets;
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

  for (const { audioSrc, offset, speaker } of clips) {
    // Content-addressed STT cache: hash of (audio content + CLI) → hash-named VTT
    const audioHash = existsSync(audioSrc)
      ? createHash("sha1").update(readFileSync(audioSrc)).digest("hex").slice(0, 12)
      : audioSrc;
    const sttCacheKey = computeCacheKey({ audioHash, cli: sttCli });
    const clipName = audioSrc.split("/").pop()!;
    const expectedVtt = join(options.outputDir, `${sttCacheKey}.vtt`);

    let vttPath: string | null = null;
    if (existsSync(expectedVtt)) {
      vttPath = expectedVtt;
    } else {
      try {
        await generateSTT(audioSrc, options.outputDir, sttCli);
        // Whisper names VTT after input audio file; rename to hash-based name
        const base = audioSrc.replace(/\.wav$/, "").replace(/\.mp3$/, "");
        const name = base.split("/").pop()!;
        const whisperVtt = join(options.outputDir, `${name}.vtt`);
        if (existsSync(whisperVtt)) {
          renameSync(whisperVtt, expectedVtt);
          vttPath = expectedVtt;
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
      let text = lines.slice(lines.indexOf(tline) + 1).join("\n").trim();
      // Prepend speaker prefix for dialogue cues
      if (speaker) {
        text = `${speaker}: ${text}`;
      }
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
    const mergedDir = options.mergedOutputDir ?? options.outputDir;
    mkdirSync(mergedDir, { recursive: true });
    const mergedPath = join(mergedDir, "subtitles.vtt");
    writeFileSync(mergedPath, mergedLines.join("\n"), "utf-8");
    clone.subtitle = { ...(clone.subtitle ?? {}), src: mergedPath };
    console.log(`  ✅ STT: subtitles ready (${cueIndex - 1} cues)`);
  }

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
  /** Global seed for reproducible TTI/TTV generation. Applied when the CLI
   *  template contains {seed}. All generated media share this seed for
   *  visual consistency across scenes. */
  seed?: number;
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
    if (node.src && node.src !== "auto") return;
    const id = node.id ?? `${node.type}-${genNodes.length}`;
    genNodes.push({ node, id, type: node.type as "image" | "video", prompt: node.prompt });
  });

  const total = genNodes.length;
  let done = 0;
  let cacheHits = 0;
  const startTime = Date.now();

  function progressLine() {
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = done / Math.max(elapsed, 0.1);
    const remaining = total - done;
    const eta = rate > 0 ? Math.round(remaining / rate) : "?";
    const etaStr = eta === "?" ? "" : `, ~${eta}s remaining`;
    return `  ${done}/${total} generated (${cacheHits} cached)${etaStr}`;
  }

  if (total > 0) {
    console.log(`  🎨 Generating ${total} media item${total > 1 ? "s" : ""}...`);
  }

  for (const { node, id, type, prompt } of genNodes) {
    done++;
    const ext = type === "image" ? "png" : "mp4";

    const cli = type === "image"
      ? (clone.tti ?? options.ttiCli ?? DEFAULT_TTI_CLI)
      : (clone.ttv ?? options.ttvCli ?? DEFAULT_TTV_CLI);

    // Use the shared seed (from root, options, or content-derived default).
    const seed = options.seed;
    const cacheKey = computeCacheKey({ prompt, cli, type, seed });
    const outputPath = join(options.outputDir, `${cacheKey}.${ext}`);

    const label = type === "image" ? "TTI" : "TTV";
    const labelText = firstWords(prompt, 8);

    // Content-addressed cache: file is named by hash — if it exists, it's valid
    if (existsSync(outputPath)) {
      node.src = resolvePath(outputPath);
      cacheHits++;
      if (done % 5 === 0 || done === total) console.log(progressLine());
      continue;
    }

    try {
      console.log(`  🔊 ${label} (${done}/${total}): ${labelText}...`);
      const ttiCmd = clone.tti ?? options.ttiCli ?? DEFAULT_TTI_CLI;
      const result = type === "image"
        ? generateTTI(prompt, outputPath, cli, seed)
        : generateTTV(prompt, outputPath, cli, ttiCmd, seed);
      if (result) {
        node.src = outputPath;
        console.log(`  ✓ ${label} (${done}/${total}): ${labelText}`);
        if (done % 3 === 0 || done === total) console.log(progressLine());
      } else {
        const hint = cli.includes("echo")
          ? `No ${label} tool installed. The default CLI just echoes a message — set root.${type === "image" ? "tti" : "ttv"} to a real generation command.`
          : `The command ran but produced no output file. Check the CLI template or run the script manually to debug.`;
        console.error(`  ⚠ ${label}: "${labelText}" produced no output. ${hint}`);
      }
    } catch (err: any) {
      const hint = (err as any)?.stderr?.toString()?.includes("not found")
        ? `${label} tool not found. Install the required CLI or configure root.${type === "image" ? "tti" : "ttv"}.`
        : `Command failed. Try running the CLI template directly to debug: ${cli}`;
      console.error(`  ✗ ${label}: "${labelText}" failed — ${err.message}. ${hint}`);
    }
  }

  if (total > 0) {
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const mediaType = genNodes[0]?.type === "video" ? "TTV" : "TTI";
    console.log(`  ✅ ${mediaType} complete: ${done} items in ${elapsed}s (${cacheHits} cached)`);
  }
  return clone;
}

// ── Storyboard Mode ─────────────────────────────────────────────────────────

/**
 * Walk the descriptive tree and replace time-consuming nodes with built-in
 * component placeholders so the user can preview the story structure fast:
 *
 * - `image`/`video` with `prompt` but no `src` → `<StoryboardSlot>` (TTI/TTV placeholder)
 * - `audio` with `script` but no `src`     → `<StoryboardCaption>` (caption-style text)
 *
 * Also prepends a `<StoryboardInfo>` card showing root metadata (title,
 * dimensions, fps, variants) at the very first frame.
 *
 * Called early in `resolveAll` (after template-variable resolution). Since the
 * nodes are now component type, subsequent steps (resolveGeneratedMedia,
 * resolveMediaDurations, etc.) simply skip them — no special-case logic needed.
 *
 * Only runs when `options.storyboard === true`.
 */
export function applyStoryboardOverrides(
  root: DescriptiveRoot,
  options?: { variants?: string[] },
): DescriptiveRoot {
  const clone: DescriptiveRoot = JSON.parse(JSON.stringify(root));
  let count = 0;

  const walk = (nodes: any[]) => {
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (
        (n.type === "image" || n.type === "video") &&
        typeof n.prompt === "string" &&
        (!n.src || n.src === "auto")
      ) {
        // ── Image/Video prompt → StoryboardSlot ───────────────────────
        count++;
        const kind = n.type === "video" ? "video" : "image";
        nodes[i] = {
          id: n.id,
          type: "component",
          jsx: `<StoryboardSlot kind="${kind}" prompt={prompt} />`,
          prompt: n.prompt,
          duration: n.duration,
          start: n.start,
          end: n.end,
          style: n.style,
          visible: n.visible,
          isBackground: n.isBackground,
          on: n.on,
          instruction: n.instruction,
        };
      } else if (
        n.type === "audio" &&
        typeof n.script === "string" &&
        (!n.src)
      ) {
        // ── Audio script → StoryboardCaption ──────────────────────────
        count++;
        // Default to 5s so the caption is readable; use node duration if set.
        const dur = (typeof n.duration === "number" && n.duration > 0) ? n.duration : 5;
        nodes[i] = {
          id: n.id,
          type: "component",
          jsx: `<StoryboardCaption script={script}${n.speaker ? " speaker={speaker}" : ""} />`,
          script: n.script,
          speaker: n.speaker,
          duration: dur,
          start: n.start,
          end: n.end,
          style: n.style,
          visible: n.visible,
          isBackground: n.isBackground,
          on: n.on,
          instruction: n.instruction,
        };
      } else if (Array.isArray(n.children)) {
        walk(n.children);
      }
    }
  };

  walk(clone.children);

  // Prepend a StoryboardInfo card with root metadata at the first frame.
  // This lets the user see project context immediately.
  const rootNode = clone as any;
  // All binding values must be strings (the compiler's component case only
  // collects string fields). Non-string values are stringified.

  // Build a formatted config summary of all root-level frontmatter fields.
  const configLines: string[] = [];
  if (rootNode.name ?? rootNode.title) configLines.push(`title: ${rootNode.name ?? rootNode.title}`);
  if (clone.width) configLines.push(`width: ${clone.width}`);
  if (clone.height) configLines.push(`height: ${clone.height}`);
  if (clone.fps) configLines.push(`fps: ${clone.fps}`);
  if (clone.layout) configLines.push(`layout: ${clone.layout}`);
  if (clone.transition) {
    const t = clone.transitionTime ? `${clone.transition}(${clone.transitionTime})` : clone.transition;
    configLines.push(`transition: ${t}`);
  }
  if (clone.tts) configLines.push(`tts: ${clone.tts}`);
  if (clone.stt) configLines.push(`stt: ${clone.stt}`);
  if (clone.tti) configLines.push(`tti: ${clone.tti}`);
  if (clone.ttv) configLines.push(`ttv: ${clone.ttv}`);
  if (clone.seed != null) configLines.push(`seed: ${clone.seed}`);
  if (clone.stylesheet) configLines.push(`stylesheet: yes`);
  if (clone.importsBlock) configLines.push(`imports: yes`);
  if (clone.voices) configLines.push(`voices: ${Object.keys(clone.voices).join(", ")}`);
  if (clone.metadata) configLines.push(`metadata: ${clone.metadata}`);

  const configStr = configLines.join("  ·  ");
  const variantStr = (options?.variants ?? []).join(", ");
  // Frontmatter is the raw YAML block from the markdown source (if any).
  const frontmatter = (rootNode as any).rawFrontmatter ?? "";
  const infoComponent: any = {
    type: "component",
    jsx: `<StoryboardInfo config={config} variants={variants} frontmatter={frontmatter} />`,
    config: configStr,
    variants: variantStr,
    frontmatter,
    duration: 4,
    start: 0,
    end: 4,
    visible: true,
  };
  const infoScene: any = {
    type: "scene",
    id: "storyboard-info",
    name: "Overview",
    title: "Storyboard Info",
    instruction: "Project metadata and variant overview",
    duration: 4,
    children: [infoComponent],
  };
  clone.children = [infoScene, ...clone.children];
  count++;

  if (count > 0) {
    console.log(`  🎬 Storyboard: ${count} placeholder${count > 1 ? "s" : ""} (TTI/TTV/TTS preview)`);
  }
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
  /** Global seed for reproducible TTI/TTV generation. Inherited by includes. */
  seed?: number;
  /** If set, resolve includes. Directory where pre-compiled include JSON files are stored. */
  includeOutputDir?: string;
  /** Separate output dir for the merged subtitles.vtt.
   *  Per-clip VTTs stay in scriptOutputDir (shared cache) while the merged
   *  VTT goes here (e.g., per-variant). Defaults to scriptOutputDir. */
  subtitleOutputDir?: string;
  /** Variant chain to apply to included sub-videos (e.g. ["zh", "tiktok"]).
   *  When set, include nodes parse their target .md files with variant awareness
   *  and apply variant overrides (zh-src → src, bare `zh` key → primary content). */
  variants?: string[];
  /** Path to the source file (.md or .json). When set and root.seed is missing,
   *  a deterministic seed is auto-generated and written back to the source file,
   *  making it stable across restarts for cache consistency. */
  sourcePath?: string;
  /** Storyboard mode: skip TTI/TTV generation. The compiler will convert
   *  prompt image/video nodes to component placeholders instead. */
  storyboard?: boolean;
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
    let subRoot = parseMarkdownDescriptive(raw);

    // Apply variant overrides to the sub-video if a variant chain is active
    const variantChain = options.variants;
    if (variantChain && variantChain.length > 0) {
      const parsed = parseMarkdownVariants(raw);
      subRoot = parsed.base;
      // Merge root config from the first variant's section
      const variantRoot = parsed.variants.get(variantChain[0]!);
      if (variantRoot) {
        const { children: _, ...configOverrides } = variantRoot;
        subRoot = { ...subRoot, ...configOverrides };
      }
      subRoot = resolveVariantOverrides(subRoot, variantChain);
    }

    // Extract import info from the included file (for the server to bundle later)
    const { entries: importEntries, extraSpecs, rawSource } = extractImportEntriesFromRaw(raw);

    // Recursively resolve the sub-root (this handles nested includes too)
    // Use the same output dir so all compiled includes are co-located.
    // Pass the variant chain so nested includes also get variant overrides.
    const resolved = await resolveAll(subRoot, {
      ...options,
      includeOutputDir: outputDir,
      baseDir: dirname(absPath),
      variants: variantChain,
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
 * 1. Resolve template variables (${width}, ${height}, etc. in src/prompt)
 * 2. Best-match media src resolution (pattern-based src → closest existing file)
 * 3. Generated media (TTI/TTV) — resolve image/video prompts to actual files
 * 4. Media duration probing
 * 5. Script → TTS (audio only) — uses root.tts / scene.tts / CLI options
 * 6. Post-compile: STT → VTT (subtitle) — uses root.stt / CLI options
 *
 * Step 0 runs first so that sub-video durations are known before duration
 * probing of the parent tree.
 */
export async function resolveAll(
  root: DescriptiveRoot,
  options: ResolveAllOptions = {},
): Promise<DescriptiveRoot> {
  let result = root;

  // ── Auto-seed: persist a deterministic seed into the source file ───────────
  // When no seed is set by the user (root.seed) or caller (options.seed),
  // generate one from the content hash and write it back to the source file.
  // This makes the seed visible and stable across restarts — the cache key
  // never changes unless the content or the user intentionally edits the seed.
  if (result.seed == null && options.seed == null && options.sourcePath) {
    const autoSeed = parseInt(computeCacheKey(result as any).slice(0, 8), 16);
    result = { ...result, seed: autoSeed };
    try {
      const raw = readFileSync(options.sourcePath, "utf-8");
      if (options.sourcePath.endsWith(".md")) {
        // Insert seed: <N> right after the `# video` line, before any config.
        const lines = raw.split("\n");
        const videoIdx = lines.findIndex((l) => l.trim().startsWith("# video"));
        const insertAt = videoIdx >= 0 ? videoIdx + 1 : 1;
        lines.splice(insertAt, 0, `seed:${autoSeed}`);
        writeFileSync(options.sourcePath, lines.join("\n"), "utf-8");
      } else if (options.sourcePath.endsWith(".json")) {
        const parsed = JSON.parse(raw);
        const target = parsed.root || parsed;
        target.seed = autoSeed;
        writeFileSync(options.sourcePath, JSON.stringify(parsed, null, 2), "utf-8");
      }
      console.log(`  🌱 Auto-seed: ${autoSeed} → ${options.sourcePath}`);
    } catch (e: any) {
      console.warn(`  ⚠ Could not write seed to source file: ${e.message}`);
    }
  }
  const contentSeed = result.seed ?? options.seed ?? 0;
  result = { ...result, seed: contentSeed };

  // Step 0: Resolve includes (pre-compile referenced .md files to JSON with accurate durations)
  result = await resolveIncludes(result, options);

  // Step 1: Resolve template variables (${width}, ${height}, ${fps}, ${variant}) in all string fields.
  // Uses root's current width/height/fps. This happens before media resolution
  // so that pattern-based src/prompt values are resolved with actual dimensions.
  const { resolveAllTemplateVars } = await import("./compiler");
  result = resolveAllTemplateVars(result, {
    width: result.width ?? 1080,
    height: result.height ?? 1920,
    fps: result.fps ?? 30,
    variant: options.variants?.[0] ?? "video",
  });

  // Step 2: Storyboard mode — replace time-consuming nodes with built-in
  // component placeholders for fast structural preview. Converts image/video
  // prompts and audio scripts into StoryboardSlot / StoryboardCaption cards.
  // Also prepends a StoryboardInfo overlay with root metadata.
  if (options.storyboard) {
    result = applyStoryboardOverrides(result, { variants: options.variants });
  }

  // Step 3: Best-match media src resolution — for pattern-based src values
  // (e.g. photo_${width}x${height}.jpg), find the closest existing file.
  result = await resolveMediaSrcs(result, { baseDir: options.baseDir });

  // Step 4: Generate images/videos from prompts before probing durations.
  if (options.mediaOutputDir) {
    result = await resolveGeneratedMedia(result, {
      outputDir: options.mediaOutputDir,
      ttiCli: options.ttiCli,
      ttvCli: options.ttvCli,
      seed: contentSeed,
    });
  }

  // Step 4: Media duration probing
  result = await resolveMediaDurations(result, {
    baseDir: options.baseDir,
    skip: options.skip,
  });

  // Step 4.5: Expand multi-turn dialogue (SpeakerName: text format)
  // Must run before TTS so each dialogue line gets its own audio node
  result = resolveDialogue(result);

  // Step 5: Script → TTS
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
      mergedOutputDir: options.subtitleOutputDir,
    });
  }

  return result;
}
