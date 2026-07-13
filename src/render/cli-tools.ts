/**
 * 4 CLI wrappers for generation tasks: TTS, STT, TTI, TTV.
 *
 * Each function is a simple one-shot command wrapper — substitute {input}/{output}
 * in the template, run the CLI, return the output path (or empty string on failure).
 *
 * This module exists so tests can mock each function individually instead of
 * mocking low-level execSync/exec, which is brittle and slow.
 */
import { execSync, exec } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

// ── Default CLI templates ─────────────────────────────────────────────────
// All can be overridden via MARKCUT_* environment variables.

export const DEFAULT_TTS_CLI =
  process.env.MARKCUT_TTS_CLI ||
  'uvx edge-tts --voice "en-US-GuyNeural" --text "{input}" --write-media "{output}"';

export const DEFAULT_STT_CLI =
  process.env.MARKCUT_STT_CLI ||
  'uvx --from openai-whisper whisper "{input}" --output_format vtt --output_dir "{output}"';

export const DEFAULT_TTI_CLI =
  process.env.MARKCUT_TTI_CLI ||
  'uvx --from mflux mflux-generate-flux2 --model flux2-klein-4b --steps 5 --prompt "{input}" --output "{output}"';

export const DEFAULT_TTV_CLI = process.env.MARKCUT_TTV_CLI || '';

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Smart placeholder substitution with quote-aware escaping.
 *
 * Detects whether {input}/{output} is wrapped in single or double quotes
 * in the template and applies the correct escaping strategy:
 *
 *   - Double-quoted: escape `"` → `\"` and keep `'` literal
 *   - Single-quoted: escape `'` → `'\''`  (end quote, escaped quote, resume)
 *   - Unquoted: escape both `'` and `"`
 *
 * Examples:
 *   template: --text "{input}"     input: it's "great"
 *     →       --text "it's \"great\""
 *
 *   template: --text '{input}'     input: it's "great"
 *     →       --text 'it'\''s "great"'
 */
function substituteCli(template: string, input: string, output: string): string {
  // Escape the output value (file paths rarely have quotes, but be safe)
  const safeOutput = output;

  // For input, detect quote context and escape accordingly
  let safeInput: string;
  // Look for {input} preceded by a quote character (ignoring whitespace)
  const inputMatch = template.match(/(['"])\{input\}/);
  if (inputMatch) {
    const quote = inputMatch[1]!;
    if (quote === '"') {
      // Double-quoted: escape double quotes
      safeInput = input.replace(/"/g, '\\"');
    } else {
      // Single-quoted: escape single quotes using '\'' sequence
      safeInput = input.replace(/'/g, "'\\''");
    }
  } else {
    // Unquoted: escape both
    safeInput = input.replace(/"/g, '\\"').replace(/'/g, "'\\''");
  }

  return template
    .replace(/\{input\}/g, safeInput)
    .replace(/\{output\}/g, safeOutput);
}

// ── Exported functions ────────────────────────────────────────────────────

/**
 * Generate TTS audio from text.
 * @returns output path on success, empty string on failure.
 */
export function generateTTS(text: string, outputPath: string, cli?: string): string {
  mkdirSync(dirname(outputPath), { recursive: true });
  const cmd = substituteCli(cli ?? DEFAULT_TTS_CLI, text, outputPath);
  try {
    execSync(cmd, { stdio: "pipe" });
  } catch (e: any) {
    console.warn(`  ⚠ TTS failed: ${e.message}`);
    return "";
  }
  return existsSync(outputPath) ? outputPath : "";
}

/**
 * Run STT on an audio file to generate VTT subtitles.
 * Completes when the CLI exits (VTT will be in outputDir).
 */
export async function generateSTT(audioPath: string, outputDir: string, cli?: string): Promise<void> {
  const cmd = substituteCli(cli ?? DEFAULT_STT_CLI, audioPath, outputDir);
  try {
    execSync(cmd, { stdio: "pipe" });
  } catch (e: any) {
    console.warn(`  ⚠ STT failed: ${e.message}`);
  }
}

/**
 * Generate an image from a text prompt.
 * @returns output path on success, empty string on failure.
 */
export function generateTTI(prompt: string, outputPath: string, cli?: string): string {
  mkdirSync(dirname(outputPath), { recursive: true });
  const cmd = substituteCli(cli ?? DEFAULT_TTI_CLI, prompt, outputPath);
  try {
    execSync(cmd, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 300_000,
      env: { ...process.env, TTI_CMD: cli ?? DEFAULT_TTI_CLI },
    });
  } catch (e: any) {
    console.error(`  ✗ TTI failed: ${e.message}`);
    return "";
  }
  return existsSync(outputPath) ? outputPath : "";
}

/**
 * Generate a video from a text prompt.
 *
 * When a custom `cli` template is provided, it's used as-is (template substitution
 * + execSync). When no CLI is given (default), the function calls `generateTTI`
 * to create an image from the prompt, then uses ffmpeg to produce a 3-second MP4.
 *
 * @param ttiCmd Optional TTI CLI template for the image step (defaults to DEFAULT_TTI_CLI).
 * @returns output path on success, empty string on failure.
 */
export function generateTTV(
  prompt: string,
  outputPath: string,
  cli?: string,
  ttiCmd?: string,
): string {
  mkdirSync(dirname(outputPath), { recursive: true });

  if (!cli) {
    // Default: use generateTTI to create an image, then ffmpeg to make a 3s MP4
    const pngPath = outputPath.replace(/\.mp4$/, ".png");
    const imageResult = generateTTI(prompt, pngPath, ttiCmd);
    if (!imageResult || !existsSync(imageResult)) {
      console.error(`  ✗ TTV: TTI step produced no image for "${prompt.slice(0, 50)}..."`);
      return "";
    }
    try {
      execSync(
        `ffmpeg -y -loop 1 -i "${pngPath}" -c:v libx264 -t 3 -pix_fmt yuv420p "${outputPath}"`,
        { stdio: ["pipe", "pipe", "pipe"], timeout: 60_000 },
      );
    } catch (e: any) {
      console.error(`  ✗ TTV: ffmpeg failed: ${e.message}`);
      return "";
    }
    // Clean up intermediate PNG
    try { execSync(`rm "${pngPath}"`, { stdio: "pipe" }); } catch { /* best-effort */ }
    return existsSync(outputPath) ? outputPath : "";
  }

  // Custom CLI mode: substitute template and run
  const cmd = substituteCli(cli, prompt, outputPath);
  try {
    execSync(cmd, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 300_000,
      env: { ...process.env, TTI_CMD: ttiCmd ?? DEFAULT_TTI_CLI },
    });
  } catch (e: any) {
    console.error(`  ✗ TTV failed: ${e.message}`);
    return "";
  }
  return existsSync(outputPath) ? outputPath : "";
}
