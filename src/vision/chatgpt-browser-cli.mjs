#!/usr/bin/env node
import { execFileSync, execSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join, resolve } from "node:path";

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tiff", ".heic", ".avif"]);
const VIDEO_EXTS = new Set([".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v", ".wmv"]);

function shellQuote(value) { return `'${String(value).replace(/'/g, `'\\''`)}'`; }

export function parseArgs(argv) {
  const out = { mode: "auto", inputs: [], prompt: "", timeoutMs: Number(process.env.MARKCUT_CHATGPT_VISION_TIMEOUT_MS) || 600_000, maxFrames: 8 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--mode") out.mode = argv[++i] || "auto";
    else if (arg === "--prompt") out.prompt = argv[++i] || "";
    else if (arg === "--input") {
      while (argv[i + 1] && !argv[i + 1].startsWith("--")) out.inputs.push(argv[++i]);
    } else if (arg === "--timeout-ms") out.timeoutMs = Number(argv[++i]);
    else if (arg === "--max-frames") out.maxFrames = Number(argv[++i]);
    else if (!arg.startsWith("--")) out.inputs.push(arg);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!out.prompt) throw new Error("--prompt is required");
  if (out.inputs.length === 0) throw new Error("--input is required");
  if (!Number.isFinite(out.timeoutMs) || out.timeoutMs <= 0) throw new Error("--timeout-ms must be > 0");
  if (!Number.isFinite(out.maxFrames) || out.maxFrames < 1 || out.maxFrames > 16) throw new Error("--max-frames must be 1..16");
  out.inputs = out.inputs.map((p) => resolve(p.replace(/^@/, "")));
  for (const input of out.inputs) if (!existsSync(input)) throw new Error(`Input not found: ${input}`);
  if (out.mode === "auto") out.mode = out.inputs.some((p) => VIDEO_EXTS.has(extname(p).toLowerCase())) ? "video" : "image";
  if (!['image', 'video'].includes(out.mode)) throw new Error("--mode must be image, video, or auto");
  return out;
}

function ffprobeDuration(videoPath) {
  const raw = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", videoPath], { encoding: "utf8" }).trim();
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Unable to read video duration: ${videoPath}`);
  return value;
}

export function prepareMedia(mode, inputs, workDir, maxFrames = 8) {
  if (mode === "image") return { files: inputs, context: inputs.map((p) => `Image: ${basename(p)}`).join("\n") };
  if (inputs.length !== 1) throw new Error("video mode accepts exactly one input video");
  const videoPath = inputs[0];
  if (!VIDEO_EXTS.has(extname(videoPath).toLowerCase())) throw new Error(`Unsupported video input: ${videoPath}`);
  const duration = ffprobeDuration(videoPath);
  // Preserve chronology even for short clips. A one-frame fallback cannot
  // distinguish ordering, so request at least two samples whenever maxFrames
  // permits it; longer videos still scale at roughly one sample per 5 seconds.
  const count = Math.max(1, Math.min(maxFrames, Math.max(2, Math.ceil(duration / 5))));
  const framesDir = join(workDir, "frames");
  mkdirSync(framesDir, { recursive: true });
  const pattern = join(framesDir, "frame-%03d.jpg");
  const fps = count / duration;
  execFileSync("ffmpeg", ["-y", "-i", videoPath, "-vf", `fps=${fps},scale='min(640,iw)':-2`, "-frames:v", String(count), "-q:v", "3", pattern], { stdio: "ignore" });
  const frames = readdirSync(framesDir).filter((f) => f.endsWith(".jpg")).sort().map((f) => join(framesDir, f));
  if (frames.length === 0) throw new Error("No representative frames extracted from video");
  const cols = Math.min(4, frames.length);
  const contact = join(workDir, "contact-sheet.jpg");
  if (frames.length === 1) {
    execFileSync("ffmpeg", ["-y", "-i", frames[0], "-vf", "scale=320:-2", "-frames:v", "1", contact], { stdio: "ignore" });
  } else {
    execSync(`ffmpeg -y ${frames.map((p) => `-i ${shellQuote(p)}`).join(" ")} -filter_complex ${shellQuote(`xstack=inputs=${frames.length}:layout=${frames.map((_, i) => `${i % cols}*w0_${Math.floor(i / cols)}*h0`).join('|')},scale=${cols * 320}:-2`)} -frames:v 1 ${shellQuote(contact)}`, { stdio: "ignore" });
  }
  const timing = frames.map((p, i) => `${basename(p)} ≈ ${(i * duration / frames.length).toFixed(1)}s`).join(", ");
  return { files: [contact], context: `Video: ${basename(videoPath)}\nDuration: ${duration.toFixed(2)}s\nRepresentative frames are chronological, left-to-right then top-to-bottom.\nTiming: ${timing}` };
}

function runInference(launcher, prompt, files, timeoutMs, env) {
  const expectJson = /\bjson\b/i.test(prompt);
  const attemptSeconds = Math.max(30, Math.floor(timeoutMs / 1000 / 3));
  const parts = [launcher, "--prompt", shellQuote(prompt), "--result-timeout", String(attemptSeconds), "--attempts", "3"];
  if (expectJson) parts.push("--expect-json");
  for (const file of files) parts.push("--file", shellQuote(file));
  return execSync(parts.join(" "), { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: timeoutMs }).trim();
}

function mediaPrompt(prompt, context) {
  return `${prompt}\n\nMedia context:\n${context}\n\nAnalyze only the attached media. Preserve chronology for video.`;
}

export function runVision({ mode, inputs, prompt, timeoutMs, maxFrames }, env = process.env) {
  const launcher = env.MARKCUT_CHATGPT_BROWSER_INFER_CLI || "chatgpt-browser-infer";
  const workDir = mkdtempSync(join(tmpdir(), "markcut-chatgpt-vision-"));
  const deadline = Date.now() + timeoutMs;
  const remaining = () => {
    const value = deadline - Date.now();
    if (value <= 0) throw new Error("ChatGPT browser vision overall timeout expired");
    return value;
  };
  try {
    if (mode === "image") {
      const media = prepareMedia("image", inputs, workDir, maxFrames);
      return runInference(launcher, mediaPrompt(prompt, media.context), media.files, remaining(), env);
    }
    if (inputs.length !== 1) throw new Error("video mode accepts exactly one input video");
    const videoPath = inputs[0];
    let directError = null;
    if (env.MARKCUT_CHATGPT_DIRECT_VIDEO === "1") {
      const directContext = `Video: ${basename(videoPath)}\nAnalyze the video directly and preserve chronology.`;
      try {
        // Direct MP4 analysis is experimental because the web client may accept
        // the upload without exposing usable temporal media to the model. Never
        // let it consume the entire caller budget needed for frame fallback.
        const directBudget = Math.max(1, Math.min(remaining(), Math.floor(timeoutMs / 2)));
        return runInference(launcher, mediaPrompt(prompt, directContext), [videoPath], directBudget, env);
      } catch (error) {
        directError = error;
      }
    }
    const fallback = prepareMedia("video", inputs, workDir, maxFrames);
    try {
      const fallbackContext = directError
        ? `${fallback.context}\nDirect video upload failed; using deterministic frame analysis.`
        : `${fallback.context}\nUsing deterministic frame analysis.`;
      return runInference(launcher, mediaPrompt(prompt, fallbackContext), fallback.files, remaining(), env);
    } catch (fallbackError) {
      const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      if (!directError) throw new Error(`ChatGPT video frame inference failed: ${fallbackMessage}`);
      const directMessage = directError instanceof Error ? directError.message : String(directError);
      throw new Error(`ChatGPT video inference failed directly and via frame fallback. direct=${directMessage}; fallback=${fallbackMessage}`);
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

export function main(argv = process.argv.slice(2), env = process.env) {
  try {
    const result = runVision(parseArgs(argv), env);
    process.stdout.write(`${result}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`markcut chatgpt vision: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (process.argv[1] && process.argv[1].endsWith("chatgpt-browser-cli.mjs")) process.exitCode = main();
