/**
 * Flexible TTS integration via CLI template + variable substitution.
 *
 * Define a CLI command template with {var} placeholders:
 *
 *   default (edge-tts):
 *     edge-tts --voice "{voice}" --text "{text}" --write-media "{output}"
 *
 *   mlx-audio with voice cloning:
 *     mlx-audio tts --model "{voice}" --text "{text}" --ref-audio "{refAudio}" --output "{output}"
 *
 *   Any custom engine:
 *     {cli} --text "{text}" --output "{output}"
 *
 * Built-in variables:  {text} {output} {voice} {rate} {refAudio}
 * Extra variables come from TtsConfig.options.
 *
 * Special cli value "copy" copies refAudio to output (no generation).
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname } from "node:path";

export interface TTSOptions {
  /** CLI command template with {var} placeholders */
  cli?: string;
  /** Voice name or model path */
  voice?: string;
  /** Speech rate percentage string e.g. "+20%", "-10%" */
  rate?: string;
  /** Reference audio path for voice cloning */
  refAudio?: string;
  /** Extra variables for CLI template substitution */
  options?: Record<string, string>;
}

const DEFAULT_CLI = 'edge-tts --voice "{voice}" --text "{text}" --write-media "{output}"';

/**
 * Generate a WAV file from text using CLI template substitution.
 * Returns the output file path, or empty string on failure.
 */
export function generateTTS(
  text: string,
  outputPath: string,
  options: TTSOptions = {},
): string {
  mkdirSync(dirname(outputPath), { recursive: true });

  const cli = options.cli ?? DEFAULT_CLI;

  // Special: "copy" mode — just copy refAudio to output
  if (cli === "copy") {
    if (!options.refAudio) {
      console.warn("copy TTS mode requires refAudio path. Skipping.");
      return "";
    }
    if (!existsSync(options.refAudio)) {
      console.warn(`refAudio not found: ${options.refAudio}. Skipping.`);
      return "";
    }
    try {
      copyFileSync(options.refAudio, outputPath);
      return outputPath;
    } catch (e: any) {
      console.warn(`copy TTS failed: ${e.message}. Skipping.`);
      return "";
    }
  }

  // Build variable map
  const vars: Record<string, string> = {
    text,
    output: outputPath,
    voice: options.voice ?? "en-US-GuyNeural",
    rate: options.rate ?? "",
    refAudio: options.refAudio ?? "",
    ...(options.options ?? {}),
  };

  // Substitute {var} placeholders
  let cmd = cli;
  for (const [key, val] of Object.entries(vars)) {
    if (!val) continue;
    cmd = cmd.replaceAll(`{${key}}`, val);
  }

  // Execute
  try {
    execSync(cmd, { stdio: "pipe" });
  } catch (e: any) {
    console.warn(`TTS failed: ${e.message}.\nCommand: ${cmd}\nSkipping voiceover.`);
    return "";
  }

  // If output isn't WAV, try converting with ffmpeg
  if (existsSync(outputPath)) return outputPath;
  // Check if a non-wav file was generated (e.g., edge-tts creates .mp3)
  const mp3Path = outputPath.replace(/\.wav$/, ".mp3");
  if (existsSync(mp3Path)) {
    try {
      execSync(`ffmpeg -y -i "${mp3Path}" "${outputPath}" 2>/dev/null`, { stdio: "pipe" });
      execSync(`rm "${mp3Path}"`, { stdio: "pipe" });
      return outputPath;
    } catch { return mp3Path; }
  }

  return "";
}

/**
 * List available edge-tts voices (convenience helper).
 */
export function listVoices(): string[] {
  try {
    const output = execSync("edge-tts --list-voices 2>/dev/null", { encoding: "utf-8" });
    return output
      .split("\n")
      .filter((l) => l.startsWith("Name:"))
      .map((l) => l.replace("Name: ", "").trim());
  } catch {
    return [];
  }
}