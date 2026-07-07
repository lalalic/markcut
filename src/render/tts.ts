/**
 * CLI-based TTS integration.
 *
 * All configuration (voice, rate, model) is embedded directly in the CLI string
 * by the agent. The pipeline only substitutes {input} and {output}.
 *
 *   Default: edge-tts --voice "en-US-GuyNeural" --text "{input}" --write-media "{output}"
 *
 *   Custom: pi --model agnes-2.0-flash --print "narrate: {input}" --output "{output}"
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const DEFAULT_CLI = 'edge-tts --voice "en-US-GuyNeural" --text "{input}" --write-media "{output}"';

/**
 * Generate a media file from text using CLI template substitution.
 * Only {input} and {output} are built-in variables — all other parameters
 * are embedded directly in the CLI command by the agent.
 * Returns the output file path, or empty string on failure.
 */
export function generateTTS(
  text: string,
  outputPath: string,
  cli?: string,
): string {
  mkdirSync(dirname(outputPath), { recursive: true });

  const cmd = (cli ?? DEFAULT_CLI)
    .replace(/\{input\}/g, text.replace(/"/g, '\\"'))
    .replace(/\{output\}/g, outputPath);

  try {
    execSync(cmd, { stdio: "pipe" });
  } catch (e: any) {
    const hint = cli?.includes("edge-tts")
      ? "The voice may not support this language. Try setting root.tts to a different voice (e.g. 'zh-CN-XiaoxiaoNeural' for Chinese)."
      : "Check that the TTS CLI is installed and the template is correct. Set root.tts to configure.";
    console.warn(`  ⚠ TTS failed: ${e.message}. ${hint}`);
    return "";
  }

  if (existsSync(outputPath)) {
    const label = outputPath.split("/").pop()?.replace(/\.\w+$/, "") ?? "";
    console.log(`  ✓ TTS: ${label}`);
    return outputPath;
  }

  // Check for non-wav output (edge-tts creates .mp3)
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