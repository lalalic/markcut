/**
 * Standalone pipeline bundle entry point.
 *
 * Bundled with esbuild into `src/player/pipeline.mjs` so plain-JS contexts
 * (like the player server) can run the full descriptive resolve + compile
 * pipeline without a TypeScript loader.
 *
 * Exports:
 *   - isDescriptiveRoot(data): boolean — heuristic format detection
 *   - resolveAndCompile(data, options): Promise<Root> — full pipeline
 *   - compileDescriptiveRoot(root): Root — pure compile (no I/O)
 *   - resolveAll(root, options): Promise<DescriptiveRoot>
 *
 * Build:
 *   bash scripts/build-pipeline.sh
 */
import { compileDescriptiveRoot } from "../descriptive/compiler";
import { resolveAll } from "../descriptive/resolve";
import { parseMarkdownDescriptive } from "../descriptive/markdown";
import type { DescriptiveRoot } from "../descriptive/compiler";
import type { Root } from "../schema/index";

export interface ResolveAndCompileOptions {
  /** Base directory for resolving relative media src paths */
  baseDir?: string;
  /** Output directory for generated TTS audio / STT VTT files */
  scriptOutputDir?: string;
  /** Whisper binary path; enables STT subtitle generation */
  whisperBin?: string;
  /** TTS CLI template (default: edge-tts) */
  ttsCli?: string;
  /** TTS voice */
  voice?: string;
  /** TTS rate (e.g. "+20%") */
  rate?: string;
  /** Reference audio path for voice cloning */
  refAudio?: string;
  /** Extra TTS template variables */
  ttsOptions?: Record<string, string>;
  /** STT model (default: tiny) */
  sttModel?: string;
  /** STT language (default: en) */
  sttLanguage?: string;
  /** Compile mode: "strict" (throws on missing duration) or "draft" (uses defaults) */
  mode?: "strict" | "draft";
}

/**
 * Heuristic: detect whether a parsed JSON object is a descriptive root
 * (vs. a pre-compiled stream tree Root).
 *
 * Signals:
 *   - has `layout` field (descriptive-only, stripped by compiler)
 *   - has `tts` or `stt` config (descriptive-only)
 *   - any direct child has `type: "scene"` with `layout`
 *   - any direct child has `type` of `series`/`parallel`/`transitionSeries`
 */
export function isDescriptiveRoot(data: any): boolean {
  if (!data || typeof data !== "object") return false;
  if (data.layout || data.tts || data.stt) return true;

  const children = data.children ?? [];
  if (!Array.isArray(children)) return false;

  // Descriptive containers as direct children
  if (children.some((c: any) =>
    c?.type === "series" || c?.type === "parallel" || c?.type === "transitionSeries"
  )) return true;

  // Scenes with descriptive layout
  if (children.some((c: any) =>
    c?.type === "scene" && (c.layout || c.tts)
  )) return true;

  return false;
}

/**
 * Run the full pipeline: resolve (TTS/STT/durations) + compile → Root.
 *
 * Pure data in, compiled Root out. Side effects: writes TTS audio files
 * and VTT files to `options.scriptOutputDir` when scripts/scripts exist.
 */
export async function resolveAndCompile(
  data: DescriptiveRoot,
  options: ResolveAndCompileOptions = {},
): Promise<Root> {
  // 1. Async resolve: durations, TTS, STT
  const resolved = await resolveAll(data, {
    baseDir: options.baseDir,
    scriptOutputDir: options.scriptOutputDir,
    whisperBin: options.whisperBin,
    ttsCli: options.ttsCli,
    voice: options.voice,
    rate: options.rate,
    refAudio: options.refAudio,
    ttsOptions: options.ttsOptions,
    sttModel: options.sttModel,
    sttLanguage: options.sttLanguage,
  });

  // 2. Sync compile: descriptive → stream tree
  const compiled = compileDescriptiveRoot(resolved, {
    mode: options.mode ?? "draft",
  });

  return compiled;
}

/**
 * Parse a descriptive markdown document into a DescriptiveRoot,
 * then run the full resolve + compile pipeline.
 *
 * Convenience wrapper for markdown inputs.
 */
export async function resolveAndCompileMarkdown(
  markdown: string,
  options: ResolveAndCompileOptions = {},
): Promise<Root> {
  const descriptive = parseMarkdownDescriptive(markdown, { mode: "compatible" });
  return resolveAndCompile(descriptive, options);
}

export { compileDescriptiveRoot, resolveAll, parseMarkdownDescriptive };
export type { DescriptiveRoot, Root };
