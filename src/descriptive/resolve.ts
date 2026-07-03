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
import { existsSync, mkdirSync } from "node:fs";
import { join, dirname, resolve as resolvePath } from "node:path";
import { generateTTS } from "../render/tts";
import { walkDown } from "../utils";
import type { DescriptiveNode, DescriptiveRoot } from "./compiler";

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
  /** CLI template (default: edge-tts) */
  ttsCli?: string;
  /** TTS voice (default: en-US-GuyNeural) */
  voice?: string;
  /** TTS rate (e.g. "+20%") */
  rate?: string;
  /** Reference audio path for voice cloning */
  refAudio?: string;
  /** Extra TTS options as key-value pairs */
  ttsOptions?: Record<string, string>;
  /** STT model (default: tiny) */
  sttModel?: string;
  /** STT language (default: en) */
  sttLanguage?: string;
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

  // First pass: collect all scenes that have script
  const allScenes: Array<{ node: any; id: string }> = [];
  walkDown(clone as any, (node) => {
    if (node.type !== "scene") return;
    if (!node.script || typeof node.script !== "string") return;
    const existing = (node.children ?? []) as DescriptiveNode[];
    if (existing.some((c) => c.type === "audio")) return;
    const id = node.id ?? node.name ?? `scene-${allScenes.length}`;
    allScenes.push({ node, id });
  });

  // Second pass: filter out parent scenes where a descendant also has script
  // (innermost wins — prevents overlapping narration)
  function hasDescendantWithScript(node: any): boolean {
    for (const child of node.children ?? []) {
      if (child.type === "scene" && child.script) return true;
      if (hasDescendantWithScript(child)) return true;
    }
    return false;
  }

  const toProcess = allScenes.filter(({ node }) => !hasDescendantWithScript(node));

  for (const { node, id } of toProcess) {
    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, "_");
    const audioPath = join(options.outputDir, `${safeId}.wav`);

    // Resolve TTS config: scene-level overrides root-level overrides CLI defaults
    const sceneTts = node.tts ?? {};
    const rootTts = clone.tts ?? {};
    const ttsCli = sceneTts.cli ?? rootTts.cli ?? options.ttsCli;
    const ttsVoice = sceneTts.voice ?? rootTts.voice ?? options.voice;
    const ttsRate = sceneTts.rate ?? rootTts.rate ?? options.rate;
    const ttsRefAudio = sceneTts.refAudio ?? rootTts.refAudio ?? options.refAudio;
    const ttsOpts = { ...(rootTts.options ?? {}), ...(sceneTts.options ?? {}), ...(options.ttsOptions ?? {}) };

    const generated = generateTTS(node.script, audioPath, {
      cli: ttsCli,
      voice: ttsVoice,
      rate: ttsRate,
      refAudio: ttsRefAudio,
      options: Object.keys(ttsOpts).length > 0 ? ttsOpts : undefined,
    });
    if (!generated) continue;

    if (!node.children) node.children = [];
    node.children.push({ type: "audio", src: generated, volume: 1 });
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
  options: { outputDir: string; whisperBin?: string; sttModel?: string; sttLanguage?: string },
): Promise<DescriptiveRoot> {
  const clone: DescriptiveRoot = JSON.parse(JSON.stringify(root));
  const whisperBin = options.whisperBin ?? DEFAULT_WHISPER;
  if (!existsSync(whisperBin)) return clone;

  // Resolve STT config: root-level stt overrides CLI defaults
  const rootStt = clone.stt ?? {};
  const sttModel = rootStt.model ?? options.sttModel;
  const sttLanguage = rootStt.language ?? options.sttLanguage;

  mkdirSync(options.outputDir, { recursive: true });

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
    const vttPath = transcribeToVTT(audioSrc, options.outputDir, whisperBin, sttModel, sttLanguage);
    if (!vttPath) continue;
    const vttText = (await import("node:fs")).readFileSync(vttPath, "utf-8");
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
    (await import("node:fs")).writeFileSync(mergedPath, mergedLines.join("\n"), "utf-8");
    clone.subtitle = { src: mergedPath };
  }

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
}

/**
 * Run all pre-pass resolvers in the correct order:
 * 1. Media duration probing
 * 2. Script → TTS (audio only) — uses root.tts / scene.tts / CLI options
 * 3. Post-compile: STT → VTT (subtitle) — uses root.stt / CLI options
 */
export async function resolveAll(
  root: DescriptiveRoot,
  options: ResolveAllOptions = {},
): Promise<DescriptiveRoot> {
  let result = root;

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
