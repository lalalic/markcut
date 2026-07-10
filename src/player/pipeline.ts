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
import { compileDescriptiveRoot, parseImportsBlock, extractDependencySpecs } from "../descriptive/compiler";
import { resolveAll, resolveIncludes } from "../descriptive/resolve";
import { parseMarkdownDescriptive } from "../descriptive/markdown";
import type { DescriptiveRoot } from "../descriptive/compiler";
import type { Root } from "../schema/index";

export interface ResolveAndCompileOptions {
  /** Base directory for resolving relative media src paths */
  baseDir?: string;
  /** Output directory for generated TTS audio / STT VTT files */
  scriptOutputDir?: string;
  /** Output directory for generated TTI/TTV media files */
  mediaOutputDir?: string;
  /** Output directory for pre-compiled include JSON files */
  includeOutputDir?: string;
  /** TTS CLI template override (default: edge-tts). Overrides root.tts. */
  ttsCli?: string;
  /** STT CLI template override (default: whisper). Overrides root.stt. */
  sttCli?: string;
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
  // 1. Async resolve: durations, TTS, STT, includes
  const resolved = await resolveAll(data, {
    baseDir: options.baseDir,
    scriptOutputDir: options.scriptOutputDir,
    mediaOutputDir: options.mediaOutputDir,
    includeOutputDir: options.includeOutputDir,
    ttsCli: options.ttsCli,
    sttCli: options.sttCli,
  });

  // 2. Sync compile: descriptive → stream tree
  const compiled = compileDescriptiveRoot(resolved);

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
  const descriptive = parseMarkdownDescriptive(markdown);
  return resolveAndCompile(descriptive, options);
}

export { compileDescriptiveRoot, resolveAll, resolveIncludes, parseMarkdownDescriptive, parseImportsBlock, extractDependencySpecs };
export type { DescriptiveRoot, Root };
