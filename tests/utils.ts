/**
 * Test utilities for the Remotion Engine integration tests.
 *
 * Provides helper functions for rendering stream trees, extracting frames,
 * and running STT (speech-to-text) on rendered video output.
 */
import { execSync, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { DEFAULT_STT_CLI } from "../src/config.mjs";

// Load .env from project root so env vars (GOOGLE_MAPS_API_KEY, etc.) are available
config({ path: resolve(fileURLToPath(import.meta.url), "../../.env") });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export const ROOT = resolve(__dirname, "..");
export const OUT_DIR = resolve(__dirname, "out");
export const FIXTURES_DIR = resolve(__dirname, "fixtures");

// Ensure output directory exists
mkdirSync(OUT_DIR, { recursive: true });

// ── Configuration ──────────────────────────────────────────────────────────

/** Default render timeout (5 min) */
export const RENDER_TIMEOUT = 300_000;

/** Default STT timeout (2 min) */
export const STT_TIMEOUT = 120_000;

// ── Render Helpers ─────────────────────────────────────────────────────────

export interface RenderOptions {
  /** Composition ID (default: "Root") */
  composition?: string;
  /** Output filename (relative to tests/out/) */
  outputName?: string;
  /** Timeout in ms */
  timeout?: number;
  /** Whether to show verbose output */
  verbose?: boolean;
}

/**
 * Render a stream tree JSON fixture to an MP4 video.
 *
 * @param fixturePath - Path to the JSON fixture file (absolute or relative to ROOT)
 * @param options - Render options
 * @returns The absolute path to the rendered MP4 file
 */
export function renderFixture(
  fixturePath: string,
  options: RenderOptions = {},
): string {
  const {
    composition = "Root",
    outputName = `${basename(fixturePath).replace(/\.json$/, "")}.mp4`,
    timeout = RENDER_TIMEOUT,
    verbose = false,
  } = options;

  const absFixturePath = fixturePath.startsWith("/")
    ? fixturePath
    : resolve(ROOT, fixturePath);

  if (!existsSync(absFixturePath)) {
    throw new Error(`Fixture not found: ${absFixturePath}`);
  }

  const raw = JSON.parse(readFileSync(absFixturePath, "utf-8"));
  const streamTree = raw.root ?? raw;

  const tmpProps = resolve(OUT_DIR, `_props-${outputName}.json`);
  writeFileSync(tmpProps, JSON.stringify({ root: streamTree }));

  const outPath = resolve(OUT_DIR, outputName);
  mkdirSync(dirname(outPath), { recursive: true });

  const cmd = `npx remotion render ${composition} "${outPath}" --props="${tmpProps}" --config=remotion.config.ts --log=error`;

  if (verbose) {
    console.log(`\n▶ Rendering: ${cmd}`);
  }

  try {
    execSync(cmd, {
      cwd: ROOT,
      stdio: verbose ? "inherit" : "pipe",
      timeout,
      env: { ...process.env, CI: "true" },
    });
  } catch (err: any) {
    const stderr = err.stderr?.toString() || "";
    const stdout = err.stdout?.toString() || "";
    if (verbose) {
      console.error("RENDER ERROR:", stderr);
    }
    // Check if the error is just "still processing" or a real error
    if (!existsSync(outPath)) {
      throw new Error(
        `Render failed for ${fixturePath}: ${err.message}\n${stderr.slice(0, 500)}`,
      );
    }
  }

  if (!existsSync(outPath)) {
    throw new Error(`Output file not created: ${outPath}`);
  }

  // Clean up temp props
  try { rmSync(tmpProps); } catch {}

  return outPath;
}

/**
 * Render a scene-based video.json fixture to an MP4 video.
 * Uses the Main16x9 composition.
 */
export function renderScenes(
  fixturePath: string,
  options: RenderOptions = {},
): string {
  const {
    composition = "Main16x9",
    outputName = `scenes-${basename(fixturePath).replace(/\.json$/, "")}.mp4`,
    timeout = RENDER_TIMEOUT,
    verbose = false,
  } = options;

  const absFixturePath = fixturePath.startsWith("/")
    ? fixturePath
    : resolve(ROOT, fixturePath);

  if (!existsSync(absFixturePath)) {
    throw new Error(`Fixture not found: ${absFixturePath}`);
  }

  const props = readFileSync(absFixturePath, "utf-8");

  const tmpProps = resolve(OUT_DIR, `_props-${outputName}.json`);
  writeFileSync(tmpProps, props);

  const outPath = resolve(OUT_DIR, outputName);
  mkdirSync(dirname(outPath), { recursive: true });

  const cmd = `npx remotion render ${composition} "${outPath}" --props="${tmpProps}" --config=remotion.config.ts --log=error`;

  if (verbose) {
    console.log(`\n▶ Rendering scenes: ${cmd}`);
  }

  try {
    execSync(cmd, {
      cwd: ROOT,
      stdio: verbose ? "inherit" : "pipe",
      timeout,
      env: { ...process.env, CI: "true" },
    });
  } catch (err: any) {
    const stderr = err.stderr?.toString() || "";
    if (!existsSync(outPath)) {
      throw new Error(
        `Scene render failed for ${fixturePath}: ${err.message}\n${stderr.slice(0, 500)}`,
      );
    }
  }

  if (!existsSync(outPath)) {
    throw new Error(`Output file not created: ${outPath}`);
  }

  try { rmSync(tmpProps); } catch {}

  return outPath;
}

// ── Video Analysis ─────────────────────────────────────────────────────────

export interface VideoInfo {
  path: string;
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
  fileSizeBytes: number;
}

/**
 * Get video metadata using ffprobe.
 */
export function getVideoInfo(videoPath: string): VideoInfo {
  if (!existsSync(videoPath)) {
    throw new Error(`Video not found: ${videoPath}`);
  }

  const ffprobe = `ffprobe -v quiet -print_format json -show_format -show_streams "${videoPath}"`;
  const output = execSync(ffprobe, { encoding: "utf-8" });
  const data = JSON.parse(output);

  const videoStream = data.streams?.find((s: any) => s.codec_type === "video");
  const audioStream = data.streams?.find((s: any) => s.codec_type === "audio");

  const durationSec = parseFloat(data.format?.duration || "0");
  const frameRate = videoStream?.avg_frame_rate || videoStream?.r_frame_rate || "30/1";
  const [num, den] = frameRate.split("/").map(Number);

  return {
    path: videoPath,
    durationSec,
    width: videoStream?.width || 0,
    height: videoStream?.height || 0,
    fps: den ? Math.round(num / den) : 30,
    hasAudio: !!audioStream,
    fileSizeBytes: parseInt(data.format?.size || "0", 10),
  };
}

/**
 * Extract a specific frame from a video as PNG.
 * @param videoPath - Path to the video
 * @param timeSeconds - Time offset in seconds
 * @param outputPath - Where to save the PNG
 * @returns The output path
 */
export function extractFrame(
  videoPath: string,
  timeSeconds: number,
  outputPath: string,
): string {
  mkdirSync(dirname(outputPath), { recursive: true });
  const cmd = `ffmpeg -y -ss ${timeSeconds} -i "${videoPath}" -vframes 1 -f image2 "${outputPath}" 2>/dev/null`;
  execSync(cmd, { stdio: "pipe" });
  if (!existsSync(outputPath)) {
    throw new Error(`Frame extraction failed at ${timeSeconds}s for ${videoPath}`);
  }
  return outputPath;
}

/**
 * Extract audio from a video as WAV.
 * @param videoPath - Path to the video
 * @param outputPath - Where to save the WAV
 * @returns The output path
 */
export function extractAudio(
  videoPath: string,
  outputPath: string,
): string {
  mkdirSync(dirname(outputPath), { recursive: true });
  const cmd = `ffmpeg -y -i "${videoPath}" -vn -acodec pcm_s16le -ar 16000 -ac 1 "${outputPath}" 2>/dev/null`;
  execSync(cmd, { stdio: "pipe" });
  if (!existsSync(outputPath)) {
    throw new Error(`Audio extraction failed for ${videoPath}`);
  }
  return outputPath;
}

/**
 * Run STT on an audio file using the configured STT CLI (DEFAULT_STT_CLI).
 * @returns The transcribed text
 */
export function transcribeAudio(audioPath: string, sttCli?: string): string {
  const cli = sttCli || DEFAULT_STT_CLI;
  if (!cli) return "[stt not configured]";

  const outputDir = dirname(audioPath);
  const cmd = cli.replace(/\{input\}/g, audioPath).replace(/\{output\}/g, outputDir);
  try {
    execSync(cmd, { stdio: "pipe", timeout: STT_TIMEOUT, cwd: dirname(audioPath) });
    // Whisper STT outputs a .vtt file next to the audio file
    const baseName = audioPath.replace(/\.\w+$/, "");
    const vttPath = baseName + ".vtt";
    if (existsSync(vttPath)) {
      const vtt = readFileSync(vttPath, "utf-8").trim();
      try { rmSync(vttPath); } catch {}
      // Extract plain text from VTT (strip timestamps and headers)
      return vtt
        .replace(/^WEBVTT.*\n?/m, "")
        .replace(/\d{2}:\d{2}:\d{2}\.\d{3}.*/g, "")
        .replace(/-->.*/g, "")
        .replace(/\n{2,}/g, "\n")
        .trim();
    }
    return "";
  } catch (err: any) {
    console.warn(`STT failed for ${audioPath}: ${err.message}`);
    return `[stt error: ${err.message}]`;
  }
}

/**
 * Get the pixel data of a specific frame (first row center pixel) to verify
 * the video is not blank/black.
 */
export function getFramePixelInfo(
  framePath: string,
  x = -1,
  y = -1,
): { r: number; g: number; b: number } | null {
  if (!existsSync(framePath)) return null;

  // Use ffmpeg to get pixel info
  const fx = x >= 0 ? x : 320; // center-ish for 640 width
  const fy = y >= 0 ? y : 240; // center-ish for 480 height
  const cmd = `ffmpeg -y -i "${framePath}" -vf "crop=1:1:${fx}:${fy}" -vframes 1 -f rawvideo -pix_fmt rgb24 pipe: 2>/dev/null`;

  try {
    const output = execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] });
    if (output.length >= 3) {
      return { r: output[0], g: output[1], b: output[2] };
    }
  } catch {}
  return null;
}

/**
 * Verify a frame is not entirely black (has visual content).
 */
export function isFrameNonBlank(framePath: string): boolean {
  const pixel = getFramePixelInfo(framePath);
  if (!pixel) return false;
  return pixel.r > 10 || pixel.g > 10 || pixel.b > 10;
}

/**
 * Get the file size of a frame in bytes.
 * A non-blank frame will be significantly larger than a blank one.
 */
export function getFrameFileSize(framePath: string): number {
  if (!existsSync(framePath)) return 0;
  try {
    return statSync(framePath).size;
  } catch {
    return 0;
  }
}

// ── Duration Calculation Test Helpers ──────────────────────────────────────

/**
 * Get the expected duration of a stream tree fixture in seconds.
 */
export function getExpectedDuration(fixtureData: any): number {
  if (fixtureData.durationInSeconds) return fixtureData.durationInSeconds;

  // For root with series children, sum the durations
  if (fixtureData.type === "root" || fixtureData.type === "folder") {
    if (fixtureData.isSeries && Array.isArray(fixtureData.children)) {
      let total = 0;
      for (const child of fixtureData.children) {
        const dur = getExpectedDuration(child);
        total += dur;
      }
      // Subtract transition overlaps
      const transitionTime = fixtureData.transitionTime ?? 0.5;
      const transitions = fixtureData.children.length - 1;
      if (transitions > 0 && fixtureData.transition) {
        total -= transitions * transitionTime;
      }
      return Math.max(1, total);
    }
    if (Array.isArray(fixtureData.children)) {
      let maxDur = 0;
      for (const child of fixtureData.children) {
        const dur = getExpectedDuration(child);
        if (!child.isBackground) {
          maxDur = Math.max(maxDur, dur);
        }
      }
      return Math.max(1, maxDur);
    }
  }

  // Leaf duration from base timing fields (end is source of truth)
  const leafStart = fixtureData.start ?? 0;
  if (typeof fixtureData.end === "number") return fixtureData.end;
  if (typeof fixtureData.duration === "number") return leafStart + fixtureData.duration;

  return 1;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function basename(path: string): string {
  return path.split("/").pop() || path.split("\\").pop() || path;
}
