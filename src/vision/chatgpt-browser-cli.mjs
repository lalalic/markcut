#!/usr/bin/env node
import { execFileSync, execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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
  const count = Math.max(1, Math.min(maxFrames, Math.ceil(duration / 5)));
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

function waitForResult(outputPath, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(outputPath)) {
      const text = readFileSync(outputPath, "utf8").trim();
      if (text) return text;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  throw new Error(`Timed out waiting for Browser ChatGPT result: ${outputPath}`);
}

export function runVision({ mode, inputs, prompt, timeoutMs, maxFrames }, env = process.env) {
  const launcher = env.MARKCUT_CHATGPT_BROWSER_WORKER_AGENT_CLI || env.MARKCUT_CHATGPT_BROWSER_WORKER_CLI;
  if (!launcher) {
    throw new Error("MARKCUT_CHATGPT_BROWSER_WORKER_AGENT_CLI is required; it must launch the Neo browser-worker agent runtime");
  }
  const workDir = mkdtempSync(join(tmpdir(), "markcut-chatgpt-vision-"));
  const outputPath = join(workDir, "result.txt");
  try {
    const media = prepareMedia(mode, inputs, workDir, maxFrames);
    const jobId = `markcut-vision-${randomUUID()}`;
    const taskId = `browser-vision-${randomUUID()}`;
    const fullPrompt = `${prompt}\n\nMedia context:\n${media.context}\n\nAnalyze only the attached media. Preserve chronology for video. Write only the final answer to the declared file output.\n\nExecution event contract:\n- Job: ${jobId}\n- Task: ${taskId}\n- Publish exactly one worker-owned task.started before analysis.\n- Publish exactly one worker-owned task.completed only after the output file is durable; publish task.failed instead if execution cannot complete.\n- task.process.* events are carrier lifecycle only and never substitute for task lifecycle.\n\nOutput:\nfile\n${outputPath}`;
    const promptPath = join(workDir, "prompt.txt");
    writeFileSync(promptPath, fullPrompt, "utf8");
    const childEnv = {
      ...env,
      MARKCUT_CHATGPT_PROMPT_FILE: promptPath,
      MARKCUT_CHATGPT_MEDIA_FILES_JSON: JSON.stringify(media.files),
      MARKCUT_CHATGPT_OUTPUT_FILE: outputPath,
      MARKCUT_CHATGPT_TAB_CLOSE_POLICY: "after-terminal",
      NEO_JOB_ID: jobId,
      NEO_TASK_ID: taskId,
    };
    execSync(launcher, { env: childEnv, stdio: ["ignore", "pipe", "pipe"], timeout: timeoutMs });
    return waitForResult(outputPath, timeoutMs);
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
