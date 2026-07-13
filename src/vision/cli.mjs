#!/usr/bin/env node
/**
 * `markcut vision <folder>` — Vision understanding CLI.
 *
 * Two modes:
 *
 *   1. **Metadata** (default): Extract media metadata (dimensions, created,
 *      GPS, duration) into metadata.json. No AI, no normalization.
 *
 *   2. **Label + full pipeline** (`--label`):
 *      a) Extract metadata into metadata.json (if not already done)
 *      b) Build a preview video JSON from metadata (root.children ordered
 *         by created time), open label preview server, let the user
 *         annotate each scene, save user hints into metadata.json, wait close
 *      c) Normalize media to token-efficient sizes
 *      d) Image perception: ITT with userHint injected into prompts
 *      e) Video perception: VTT (overall description) + STT → VTT subtitles
 *         → segment (by userHint boundaries + VTT cues, or by vision)
 *         → run agent CLI on each segment clip
 *      f) Save complete metadata.json with metadata + userHint + perception
 *
 * Options:
 *   --label            Run full pipeline: preview → label → normalize → percept → segments
 *   --agent <tmpl>     Custom text LLM CLI for detect-scenes ({prompt})
 *   --itt <tmpl>       Custom ITT CLI template with {input}, {prompt}
 *   --vtt <tmpl>       Custom VTT CLI template with {input}, {prompt}
 *   --stt <tmpl>       Custom STT CLI template with {input}, {output}
 *   --prompts-file <path> Path to prompts markdown file (default: vision_prompts.md)
 *   --vtt-sample-interval <n> Sample one video frame every N seconds (default: 5)
 *   --context "text"   Background context about people/places (injected into prompts)
 *   --pick <files>     Comma-separated filenames to process
 *   --skip-stt         Skip speech-to-text for videos
 *   --dry-run          Show what would be processed without running AI
 *   --show-prompts     Print the prompts file and exit
 *   --show-clis        Print the default ITT/VTT/STT CLI templates
 *   --help             Show this help
 *
 * Prompt overrides:
 *   --<prompt-name> "text"  Override any prompt template from vision_prompts.md
 */

import { execSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, renameSync, rmSync,
} from "node:fs";
import { join, resolve, dirname, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  IMAGE_EXTS, VIDEO_EXTS,
  MAX_IMAGE_DIMENSION, MAX_VIDEO_DURATION, MAX_VIDEO_DIMENSION,
  DEFAULT_ITT, DEFAULT_VTT_SAMPLE_INTERVAL, DEFAULT_VTT, DEFAULT_STT, DEFAULT_AGENT,
} from "../config.mjs";

// ── Paths ─────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Constants ─────────────────────────────────────────────────────────────

const PROMPTS_FILE = join(__dirname, "vision_prompts.md");

// ── Helpers ───────────────────────────────────────────────────────────────

function emitInfo(msg) { console.error(msg); }
function emitSuccess(msg) { console.error(`✅ ${msg}`); }
function emitWarn(msg) { console.error(`⚠️  ${msg}`); }
function emitError(msg) { console.error(`❌ ${msg}`); }

function run(cmd, opts = {}) {
  return execSync(cmd, {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 300_000,
    ...opts,
  });
}

function fileFingerprint(filePath) {
  try {
    const s = statSync(filePath);
    return `${s.mtimeMs}:${s.size}`;
  } catch { return "0:0"; }
}

function perceptionCacheKey(filePath, actualCmd, type) {
  const parts = { file: fileFingerprint(filePath), type, cmd: actualCmd };
  return createHash("sha1").update(JSON.stringify(parts)).digest("hex").slice(0, 16);
}

function loadMetadata(folder) {
  const path = join(folder, "metadata.json");
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8"));
    const cacheMap = {};
    for (const [key, entry] of Object.entries(raw)) {
      if (entry._cache && entry.perception?.desc) {
        cacheMap[entry._cache] = entry.perception || {};
      }
    }
    return { results: raw, cacheMap };
  } catch {
    return { results: {}, cacheMap: {} };
  }
}

function shQuote(s) {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

function loadPrompts(filePath) {
  const prompts = new Map();
  if (!existsSync(filePath)) {
    emitWarn(`Prompts file not found: ${filePath}`);
    return prompts;
  }
  const content = readFileSync(filePath, "utf-8");
  const sectionRe = /^##\s+(\S[\w-]*)\s*\n[\s\S]*?^~~~md\n([\s\S]*?)~~~\s*$/gm;
  let match;
  while ((match = sectionRe.exec(content)) !== null) {
    const name = match[1].trim();
    const template = match[2].trim();
    if (name && template) prompts.set(name, template);
  }
  return prompts;
}

function substituteTemplate(tmpl, vars) {
  let result = tmpl;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, "g"), String(value));
  }
  return result;
}

function getPrompt(prompts, name) {
  const p = prompts.get(name);
  if (!p) throw new Error(`Missing prompt: "${name}" — check vision_prompts.md`);
  return p;
}

// ── Media Scanning ────────────────────────────────────────────────────────

function scanMedia(folder) {
  const images = [];
  const videos = [];
  const all = readdirSync(folder).sort();
  for (const name of all) {
    const full = join(folder, name);
    const stat = statSync(full);
    if (!stat.isFile()) continue;
    const ext = extname(name).toLowerCase();
    if (IMAGE_EXTS.has(ext)) images.push(full);
    else if (VIDEO_EXTS.has(ext)) videos.push(full);
  }
  return { images, videos };
}

// ── Metadata Extraction ───────────────────────────────────────────────────

function extractMetadata(filePath) {
  let width = 0, height = 0, created = null, duration = null;
  let location = null;

  // Try exiftool first
  try {
    const cmd = `exiftool -json ${shQuote(filePath)} 2>/dev/null`;
    const out = run(cmd, { timeout: 30_000 });
    const items = JSON.parse(out);
    if (items && items.length > 0) {
      const tag = items[0];
      width = parseInt(tag.ImageWidth || tag.ExifImageWidth || tag.Width || 0, 10);
      height = parseInt(tag.ImageHeight || tag.ExifImageHeight || tag.Height || 0, 10);
      const dateStr = tag.CreateDate || tag.DateTimeOriginal || tag.MediaCreateDate || "";
      if (dateStr) {
        const parts = dateStr.split(" ");
        const datePart = (parts[0] || "").replace(/:/g, "-");
        const timePart = parts[1] || "";
        created = datePart + (timePart ? "T" + timePart + "Z" : "Z");
      }
      if (tag.Duration) {
        const dur = parseFloat(tag.Duration);
        if (!isNaN(dur)) duration = dur;
      }
      let lat = null, lng = null;
      const iso = tag["QuickTime:ISO6709"] || tag["com.apple.quicktime.location.ISO6709"] || "";
      if (iso) {
        const gps = parseISO6709(iso);
        if (gps) { lat = gps.lat; lng = gps.lng; }
      }
      if (lat == null || lng == null) {
        lat = tryParseGPS(tag.GPSLatitude, tag.GPSLatitudeRef);
        lng = tryParseGPS(tag.GPSLongitude, tag.GPSLongitudeRef);
      }
      if (lat == null || lng == null) {
        lat = parseFloat(tag.GPSLatitude || "");
        lng = parseFloat(tag.GPSLongitude || "");
        if (!isNaN(lat) && (tag.GPSLatitudeRef === "S" || tag.GPSLatitudeRef === "South")) lat = -lat;
        if (!isNaN(lng) && (tag.GPSLongitudeRef === "W" || tag.GPSLongitudeRef === "West")) lng = -lng;
      }
      if (!isNaN(lat) && !isNaN(lng)) {
        location = { lat, lng, place: null };
      }
    }
  } catch { /* fall through */ }

  // Fallback: ffprobe
  if (!width || !height) {
    try {
      const probe = JSON.parse(run(
        `ffprobe -v quiet -print_format json -show_format -show_streams ${shQuote(filePath)}`,
      ));
      const streams = probe.streams || [];
      const format = probe.format || {};
      const videoStream = streams.find((s) => s.codec_type === "video") || {};
      width = width || videoStream.width || 0;
      height = height || videoStream.height || 0;
      duration = duration || (format.duration ? parseFloat(format.duration) : null);
      created = created || format.tags?.creation_time || videoStream.tags?.creation_time || null;
      if (!location && format.tags) {
        const iso = format.tags["com.apple.quicktime.location.ISO6709"] || "";
        if (iso) { const gps = parseISO6709(iso); if (gps) location = gps; }
      }
      if (!location && format.tags) {
        const glat = parseFloat(format.tags.GPSLatitude || format.tags["location.lat"] || format.tags.lat || "");
        const glng = parseFloat(format.tags.GPSLongitude || format.tags["location.lng"] || format.tags.lng || "");
        if (!isNaN(glat) && !isNaN(glng)) {
          let lat = glat, lng = glng;
          if (format.tags.GPSLatitudeRef === "S" || format.tags.GPSLatitudeRef === "South") lat = -lat;
          if (format.tags.GPSLongitudeRef === "W" || format.tags.GPSLongitudeRef === "West") lng = -lng;
          location = { lat, lng, place: null };
        }
      }
    } catch { emitWarn(`ffprobe also failed on: ${filePath}`); }
  }
  return { width, height, created, location, duration };
}

function parseISO6709(str) {
  const m = str.match(/^([+-]\d+\.?\d*)([+-]\d+\.?\d*)/);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  if (isNaN(lat) || isNaN(lng)) return null;
  return { lat, lng, place: null };
}

function tryParseGPS(val, ref) {
  if (!val) return null;
  const s = String(val).trim();
  let dec = NaN;
  let negative = false;
  const hemiMatch = s.match(/[NSnsEeWw]\s*$/);
  if (hemiMatch) {
    const h = hemiMatch[0].toUpperCase();
    if (h === "S" || h === "W") negative = true;
  }
  const direct = parseFloat(s);
  if (!isNaN(direct) && s.indexOf("deg") === -1) {
    dec = direct;
  } else {
    const dms = s.match(/([+-]?\d+(?:\.\d+)?)\s*deg\s*(\d+(?:\.\d+)?)\s*'\s*(\d+(?:\.\d+)?)/);
    if (dms) { dec = parseFloat(dms[1]) + parseFloat(dms[2]) / 60 + parseFloat(dms[3]) / 3600; }
  }
  if (!isNaN(dec)) {
    if (ref) {
      if (ref === "S" || ref === "South" || ref === "W" || ref === "West" || ref.startsWith("-")) dec = -dec;
    } else if (negative) { dec = -dec; }
    return dec;
  }
  return null;
}

// ── Media Normalization ───────────────────────────────────────────────────

function normalizeImage(srcPath, normDir, maxDim = MAX_IMAGE_DIMENSION) {
  const srcExt = extname(srcPath);
  const outName = `${basename(srcPath, srcExt)}_${maxDim}.jpg`;
  const outPath = join(normDir, outName);
  if (existsSync(outPath)) return outPath;
  const filter = `scale='min(${maxDim},iw)':'min(${maxDim},ih)':force_original_aspect_ratio=decrease`;
  const cmd = `ffmpeg -y -i ${shQuote(srcPath)} -vf ${shQuote(filter)} -q:v 3 -update 1 ${shQuote(outPath)}`;
  try { run(cmd); return outPath; }
  catch (e) { emitWarn(`Failed to normalize image ${basename(srcPath)}: ${e.message}`); return srcPath; }
}

function normalizeVideo(srcPath, normDir, duration, maxDim = MAX_VIDEO_DIMENSION, maxDur = MAX_VIDEO_DURATION, maxSamples = 60) {
  const srcExt = extname(srcPath); // Keep original case for basename stripping
  const ext = srcExt.toLowerCase() || ".mp4";
  const base = basename(srcPath, srcExt);
  const totalDur = duration || getVideoDuration(srcPath);

  if (totalDur <= maxDur) {
    const timeHint = `0to${Math.floor(totalDur)}`;
    const outName = `${base}_${timeHint}.mp4`;
    const outPath = join(normDir, outName);
    if (existsSync(outPath)) return { path: outPath, trimmedDuration: totalDur, timeHint };
    const filter = `scale='min(${maxDim},iw)':'min(${maxDim},ih)':force_original_aspect_ratio=decrease,pad='ceil(iw/2)*2':'ceil(ih/2)*2':-1:-1`;
    const cmd = `ffmpeg -y -i ${shQuote(srcPath)} -t ${totalDur} -vf ${shQuote(filter)} -c:v libx264 -preset fast -crf 28 -c:a aac -b:a 64k ${shQuote(outPath)}`;
    try { run(cmd, { timeout: 600_000 }); return { path: outPath, trimmedDuration: totalDur, timeHint }; }
    catch (e) { emitWarn(`Failed to normalize video ${basename(srcPath)}: ${e.message}`); return { path: srcPath, trimmedDuration: totalDur, timeHint }; }
  }

  const timeHint = `full`;
  const outName = `${base}_${timeHint}.mp4`;
  const outPath = join(normDir, outName);
  if (existsSync(outPath)) return { path: outPath, trimmedDuration: totalDur, timeHint };

  const frameCount = getVideoFrameCount(srcPath);
  const step = Math.max(1, Math.floor(frameCount / maxSamples));
  const actualSamples = Math.min(maxSamples, Math.ceil(frameCount / step));
  const filter = `select='not(mod(n,${step}))',setpts=N/TB,scale='min(${maxDim},iw)':'min(${maxDim},ih)':force_original_aspect_ratio=decrease,pad='ceil(iw/2)*2':'ceil(ih/2)*2':-1:-1`;
  const cmd = `ffmpeg -y -i ${shQuote(srcPath)} -vf ${shQuote(filter)} -c:v libx264 -preset fast -crf 28 -an -t ${actualSamples} -r 1 ${shQuote(outPath)}`;
  try {
    emitInfo(`  Sampling ${actualSamples} frames across ${totalDur.toFixed(1)}s video`);
    run(cmd, { timeout: 600_000 });
    return { path: outPath, trimmedDuration: totalDur, timeHint };
  } catch (e) { emitWarn(`Failed to normalize video ${basename(srcPath)}: ${e.message}`); return { path: srcPath, trimmedDuration: totalDur, timeHint }; }
}

function getVideoDuration(filePath) {
  try { return parseFloat(run(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 ${shQuote(filePath)}`).trim()) || 0; }
  catch { return 0; }
}

function getVideoFrameCount(filePath) {
  // Fast path: try nb_frames from container metadata (no decoding)
  try {
    const n = parseInt(run(`ffprobe -v error -select_streams v:0 -show_entries stream=nb_frames -of default=noprint_wrappers=1:nokey=1 ${shQuote(filePath)}`, { timeout: 15_000 }).trim(), 10);
    if (!isNaN(n) && n > 0) return n;
  } catch {}
  // Fallback: estimate from duration × fps (much faster than -count_frames)
  try {
    const dur = getVideoDuration(filePath);
    const fpsRaw = run(`ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of default=noprint_wrappers=1:nokey=1 ${shQuote(filePath)}`, { timeout: 15_000 }).trim();
    if (fpsRaw && dur > 0) {
      const parts = fpsRaw.split("/");
      const fps = parts.length === 2 ? parseInt(parts[0], 10) / parseInt(parts[1], 10) : parseFloat(fpsRaw);
      if (fps > 0) return Math.round(dur * fps);
    }
  } catch {}
  return 0;
}

/**
 * Detect visual scene changes using ffprobe's scene detection filter.
 * Returns an array of boundary timestamps in milliseconds.
 * Uses `select='gt(scene,THRESHOLD)'` to find shot boundaries.
 */
function detectSceneChanges(filePath, threshold = 0.3) {
  try {
    const cmd = `ffmpeg -i ${shQuote(filePath)} -vf "select='gt(scene,${threshold})',showinfo" -vsync vfr -f null - 2>&1`;
    const out = run(cmd, { timeout: 120_000 });
    const times = [];
    const re = /pts_time:(\d+\.?\d*)/g;
    let m;
    while ((m = re.exec(out)) !== null) {
      const t = parseFloat(m[1]);
      if (!isNaN(t) && t > 0) times.push(Math.round(t * 1000));
    }
    // Deduplicate within 500ms window
    const unique = [];
    for (const t of times.sort((a, b) => a - b)) {
      if (unique.length === 0 || t - unique[unique.length - 1] > 500) unique.push(t);
    }
    return unique;
  } catch { return []; }
}

// ── ITT / VTT / STT ───────────────────────────────────────────────────────

function runITT(inputPaths, promptText, ittCli) {
  const paths = Array.isArray(inputPaths) ? inputPaths : [inputPaths];
  const tmpl = ittCli || DEFAULT_ITT;
  const inputStr = paths.map(p => `${shQuote(p)}`).join(" ");
  const cmd = substituteTemplate(tmpl, { input: inputStr, prompt: promptText });
  try { return run(cmd).trim(); }
  catch (e) { emitWarn(`ITT failed for ${basename(paths[0])}: ${e.message}`); return ""; }
}

function extractVideoFrames(videoPath, intervalSeconds = DEFAULT_VTT_SAMPLE_INTERVAL) {
  const tmpDir = join(dirname(videoPath), ".pi-vtt");
  mkdirSync(tmpDir, { recursive: true });
  let duration = getVideoDuration(videoPath);
  // If duration is unavailable (e.g. segmented clip without moov metadata), try adding genpts
  if (duration <= 0) {
    try { run(`ffprobe -v error -fflags +genpts -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 ${shQuote(videoPath)}`, { timeout: 30_000 }); }
    catch {}
    duration = getVideoDuration(videoPath);
  }
  const n = Math.max(5, Math.min(10, Math.ceil((duration || 5) / intervalSeconds)));
  const baseName = basename(videoPath, extname(videoPath));
  const framePattern = join(tmpDir, `${baseName}_%03d.jpg`);
  const fps = n / Math.max(duration || 5, 1);
  try { run(`ffmpeg -y -fflags +genpts -i ${shQuote(videoPath)} -vf "fps=${fps},scale=360:-1" -q:v 3 ${shQuote(framePattern)}`, { timeout: 120_000 }); }
  catch (e) { try { rmSync(tmpDir, { recursive: true, force: true }); } catch {} throw new Error(`Frame extraction failed: ${e.message}`); }
  const frames = readdirSync(tmpDir).filter((f) => f.startsWith(baseName) && f.endsWith(".jpg")).sort().map((f) => join(tmpDir, f));
  if (frames.length === 0) { try { rmSync(tmpDir, { recursive: true, force: true }); } catch {} throw new Error("No frames extracted from video"); }
  return { frames, cleanup: () => { try { rmSync(tmpDir, { recursive: true, force: true }); } catch {} } };
}

function runVTT(videoPath, promptText, vttCli, ittCli, sampleInterval = DEFAULT_VTT_SAMPLE_INTERVAL) {
  if (vttCli) {
    const tryRun = () => { const cmd = substituteTemplate(vttCli, { input: shQuote(videoPath), prompt: promptText }); return run(cmd, { timeout: 600_000 }).trim(); };
    for (let attempt = 0; attempt < 2; attempt++) {
      try { return tryRun(); } catch (e) {
        const msg = e.message || "";
        if (attempt === 0 && msg.includes("Cannot open video") || msg.includes("moov atom not found")) {
          emitWarn(`  Corrupted video file, removing and retrying...`);
          try { rmSync(videoPath, { force: true }); } catch {} continue;
        }
        emitWarn(`VTT failed for ${basename(videoPath)}: ${msg}`); return "";
      }
    }
    return "";
  }
  let extracted;
  try { extracted = extractVideoFrames(videoPath, sampleInterval); }
  catch (e) { emitWarn(`  ${e.message}`); return ""; }
  const result = runITT(extracted.frames, promptText, ittCli);
  extracted.cleanup();
  return result;
}

/**
 * Run the agent CLI on a single video clip with a vision prompt.
 * The agent CLI template supports {input} (clip path) and {prompt}.
 * Defaults to the ITT CLI (frame-based image perception).
 */
function runAgent(clipPath, promptText, agentCli) {
  const tmpl = agentCli || DEFAULT_AGENT;
  // Always quote the prompt text to avoid shell injection from multi-line content
  const cmd = substituteTemplate(tmpl, { input: shQuote(clipPath), prompt: shQuote(promptText) });
  try { return run(cmd, { timeout: 300_000 }).trim(); }
  catch (e) { emitWarn(`Agent failed for ${basename(clipPath)}: ${e.message}`); return ""; }
}

function runSTT(videoPath, normDir, sttCli) {
  const base = basename(videoPath, extname(videoPath));
  const mediaDir = dirname(videoPath);
  const audioPath = join(normDir, `${base}_audio.mp3`);
  const vttPath = join(mediaDir, `${base}.vtt`);
  if (existsSync(vttPath)) return `${base}.vtt`;

  try { run(`ffmpeg -y -i ${shQuote(videoPath)} -vn -acodec libmp3lame -q:a 2 ${shQuote(audioPath)}`, { timeout: 300_000 }); }
  catch (e) { emitWarn(`Audio extraction failed for ${base}: ${e.message}`); return null; }

  const tmpl = sttCli || DEFAULT_STT;
  const cmd = substituteTemplate(tmpl, { input: audioPath, output: normDir });
  try { run(cmd, { timeout: 600_000 }); } catch (e) { emitWarn(`STT failed for ${base}: ${e.message}`); return null; }

  const whisperVtt = join(normDir, `${base}_audio.vtt`);
  if (existsSync(whisperVtt)) renameSync(whisperVtt, vttPath);
  return existsSync(vttPath) ? `${base}.vtt` : null;
}

function parseVTT(vttPath) {
  const cues = [];
  if (!existsSync(vttPath)) return cues;
  const content = readFileSync(vttPath, "utf-8");
  // Supports both HH:MM:SS.mmm and MM:SS.mmm formats
  const cueRe = /(\d{2}:)?\d{2}:\d{2}\.\d{3}\s*-->\s*(\d{2}:)?\d{2}:\d{2}\.\d{3}\s*\n([\s\S]*?)(?=\n\n|\n\d{2}:\d{2}|\s*$)/g;
  let match;
  while ((match = cueRe.exec(content)) !== null) {
    const raw = match[0];
    const parts = raw.split(/\s*-->\s*/);
    if (parts.length < 2) continue;
    const start = timeToSeconds(parts[0].trim());
    const end = timeToSeconds(parts[1].trim().split("\n")[0].trim());
    const text = parts[1].substring(parts[1].indexOf("\n") + 1).trim().replace(/\n/g, " ");
    if (text) cues.push({ start, end, text });
  }
  return cues;
}

function timeToSeconds(ts) {
  const parts = ts.trim().split(":");
  if (parts.length === 3) {
    return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
  }
  // MM:SS.mmm (no hours)
  return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
}

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${s.toFixed(3).padStart(6, "0")}`;
}

function queryLLM(promptText) {
  const tmpDir = join(__dirname, ".tmp");
  mkdirSync(tmpDir, { recursive: true });
  const dummyPng = join(tmpDir, "_.png");
  if (!existsSync(dummyPng)) {
    writeFileSync(dummyPng, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"));
  }
  const cmd = `uvx --from mlx-vlm mlx_vlm.generate --model mlx-community/Qwen2.5-VL-7B-Instruct-4bit --max-tokens 2048 --prompt ${shQuote(promptText)} --image ${shQuote(dummyPng)}`;
  try { return run(cmd, { timeout: 300_000 }).trim(); }
  catch (e) { emitWarn(`LLM query failed: ${e.message}`); return ""; }
}

// ── JSON parsing helpers ──────────────────────────────────────────────────

function looseJSONParse(text) {
  if (!text) return null;
  let s = text.trim();
  s = s.replace(/^(You are a helpful assistant[.\s]*)/i, "");
  s = s.replace(/<\|im_start\|>/g, "").replace(/<\|im_end\|>/g, "");
  s = s.replace(/<\|vision[^|]*\|>/g, "");
  s = s.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");
  const firstBrace = s.indexOf("{");
  const lastBrace = s.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;
  let content = s.slice(firstBrace, lastBrace + 1);
  try { return JSON.parse(content); } catch { /* continue */ }
  content = content.replace(/\d+\.\s*(\{)/g, (m, brace) => brace);
  const innerBrace = content.indexOf("{", 1);
  const innerBraceEnd = content.lastIndexOf("}");
  if (innerBrace > 0 && innerBraceEnd > innerBrace) {
    const inner = content.slice(innerBrace, innerBraceEnd + 1);
    try { return JSON.parse(inner); } catch { /* continue */ }
    content = inner;
  }
  let fixed = content.replace(/,(\s*[}\]])/g, '$1').replace(/'/g, '"').replace(/\btrue\b/gi, 'true').replace(/\bfalse\b/gi, 'false').replace(/\bnull\b/gi, 'null');
  try { return JSON.parse(fixed); } catch { /* continue */ }
  fixed = fixed.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":');
  try { return JSON.parse(fixed); } catch { /* continue */ }
  fixed = fixed.replace(/:\s*([a-zA-Z][a-zA-Z0-9_ \/-]+?)\s*([,\}\]])/g, (m, val, sep) => {
    const t = val.trim();
    if (t === "true" || t === "false" || t === "null") return `:${t}${sep}`;
    if (/^\d+(\.\d+)?$/.test(t)) return `:${t}${sep}`;
    if (t.startsWith('"') && t.endsWith('"')) return `:${t}${sep}`;
    return `:"${t}"${sep}`;
  });
  try { return JSON.parse(fixed); } catch { return null; }
}

function extractRawText(text) {
  if (!text) return "";
  const lines = text.split("\n");
  const respLines = [];
  let inResponse = false, seenAssistant = false;
  for (const line of lines) {
    const s = line.trim();
    if (s.startsWith("====")) { if (seenAssistant) break; continue; }
    if (s.startsWith("Files:") || s.startsWith("Prompt:")) continue;
    if (s.startsWith("Generation:") || s.startsWith("Peak memory:")) continue;
    if (s.includes("<|im_start|>assistant")) { seenAssistant = true; inResponse = true; continue; }
    if (inResponse) respLines.push(line);
  }
  let result = respLines.join("\n").trim();
  result = result.replace(/\n={3,}[\s\S]*$/, "").trim();
  result = result.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  return result;
}

function stripThinkBlocks(text) {
  return text ? text.replace(/^<think>[\s\S]*?<\/think>\s*/g, "") : text;
}

function normalizePerception(perception) {
  return { ...perception };
}

// ── Geocoding ─────────────────────────────────────────────────────────────

async function enrichLocation(location) {
  if (!location || location.lat == null || location.lng == null) return location;
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${location.lat}&lon=${location.lng}&format=json&zoom=14`, {
      headers: { "User-Agent": "markcut-vision/1.0" },
    });
    if (!res.ok) return location;
    const data = await res.json();
    return { ...location, place: data?.display_name || data?.name || null };
  } catch { return location; }
}

// ═════════════════════════════════════════════════════════════════════════
// Metadata extraction (default mode)
// ═════════════════════════════════════════════════════════════════════════

async function runMetadataMode(folder, pickSet, dryRun) {
  emitInfo(`\n🔍 Scanning for metadata: ${folder}`);
  const { images, videos } = scanMedia(folder);
  emitInfo(`  Found ${images.length} images, ${videos.length} videos`);

  if (images.length === 0 && videos.length === 0) {
    emitWarn("No media files found.");
    return;
  }

  const { results } = loadMetadata(folder);

  for (const filePath of [...images, ...videos]) {
    if (pickSet.size > 0 && !pickSet.has(basename(filePath))) continue;
    const base = basename(filePath, extname(filePath));
    const isVideo = VIDEO_EXTS.has(extname(filePath).toLowerCase());
    emitInfo(`\n${isVideo ? "🎬" : "📷"} ${base}`);

    if (dryRun) { if (!results[base]) results[base] = { _dryRun: true }; continue; }

    const meta = extractMetadata(filePath);
    const existing = results[base] || {};
    results[base] = {
      ...existing,
      width: meta.width || existing.width || 0,
      height: meta.height || existing.height || 0,
      created: meta.created || existing.created || null,
      location: meta.location || existing.location || null,
      ...(isVideo ? { duration: meta.duration || existing.duration || null } : {}),
    };
    writeFileSync(join(folder, "metadata.json"), JSON.stringify(results, null, 2), "utf-8");
    emitInfo(`  ${meta.width}x${meta.height}${meta.created ? `, ${meta.created}` : ""}${meta.duration ? `, ${meta.duration.toFixed(1)}s` : ""}`);
  }

  emitInfo(`\n📊 Metadata extracted: ${Object.keys(results).length} files → metadata.json`);
}

// ═════════════════════════════════════════════════════════════════════════
// Label preview + full pipeline (--label mode)
// ═════════════════════════════════════════════════════════════════════════

function buildPreviewTree(folder, metadata) {
  // Build a map of lowercase basename → actual filename for case-sensitive matching
  const allFiles = readdirSync(folder);
  const fileMap = new Map();
  for (const f of allFiles) {
    const st = statSync(join(folder, f));
    if (!st.isFile()) continue;
    const key = basename(f, extname(f)).toLowerCase();
    if (!fileMap.has(key)) fileMap.set(key, f);
  }

  const entries = [];
  for (const [baseName, data] of Object.entries(metadata)) {
    const actualName = fileMap.get(baseName.toLowerCase());
    if (!actualName) continue;
    const filePath = join(folder, actualName);
    const isVideo = VIDEO_EXTS.has(extname(actualName).toLowerCase());
    const existingHints = data.userHints ? { ...data.userHints } : (data.userHint ? { overall: data.userHint } : null);
    entries.push({
      name: baseName,
      created: data.created || "1970-01-01T00:00:00Z",
      relSrc: `${actualName}`,
      dur: isVideo ? (data.duration || 5) : 3,
      isVideo,
      userHints: existingHints,
    });
  }
  entries.sort((a, b) => a.created.localeCompare(b.created));

  return {
    id: "root", type: "root", width: 1080, height: 1920, fps: 30,
    isSeries: true, transition: "fade", transitionTime: 0.5,
    children: entries.map((e) => ({
      id: e.name, type: "folder", isSeries: false,
      children: [{
        id: `${e.name}-media`,
        type: e.isVideo ? "video" : "image",
        src: e.relSrc, fit: "cover",
        actions: [{ start: 0, end: e.dur }],
        // Preserve existing labels from metadata so re-labeling shows them
        userHints: e.userHints || undefined,
      }],
    })),
  };
}

function mergeLabelsIntoMetadata(folder, metadata) {
  const labelsPath = join(folder, "labels.json");
  if (!existsSync(labelsPath)) {
    emitWarn("No labels.json found — no hints to merge.");
    return metadata;
  }
  const labelsTree = JSON.parse(readFileSync(labelsPath, "utf-8"));
  const children = labelsTree.children || [];
  let mergeCount = 0;
  for (const child of children) {
    const media = child.children?.[0];
    if (!media) continue;
    const baseName = child.id;
    if (!metadata[baseName]) continue;
    // New format: media.userHints = { overall: "...", timed: { at_XXXX: "...", ... } }
    if (media.userHints) {
      const hints = media.userHints;
      const merged = {};
      if (hints.overall) merged.overall = hints.overall;
      if (hints.timed && typeof hints.timed === "object") {
        const timedMerged = {};
        for (const [key, val] of Object.entries(hints.timed)) {
          if (val) timedMerged[key] = val;
        }
        if (Object.keys(timedMerged).length > 0) merged.timed = timedMerged;
      }
      if (Object.keys(merged).length > 0) {
        metadata[baseName].userHints = merged;
        // For backward compat, also set userHint to the overall or first timed
        metadata[baseName].userHint = hints.overall || (hints.timed ? Object.values(hints.timed)[0] : "") || "";
        mergeCount++;
      }
    } else if (media.description) {
      // Legacy format: single description
      metadata[baseName].userHint = media.description;
      metadata[baseName].userHints = { overall: media.description };
      mergeCount++;
    }
  }
  try { rmSync(labelsPath, { force: true }); } catch {}
  emitInfo(`  Merged ${mergeCount} labels → userHints in metadata.json`);
  return metadata;
}

// ── Perception helpers ────────────────────────────────────────────────────

function analyzeImage(imagePath, normPath, prompts, ittCli, context = "", userHint = "", userHints = null) {
  let ctxParts = [];
  if (context) ctxParts.push(`Context: ${context}`);
  if (userHint) ctxParts.push(`User hint: ${userHint}`);
  const ctx = ctxParts.length > 0 ? ctxParts.join("\n") + "\n\n" : "";
  const prompt = ctx + getPrompt(prompts, "image-perception");
  const raw = runITT(normPath, prompt, ittCli);
  const parsed = looseJSONParse(raw);
  const rawText = stripThinkBlocks(extractRawText(raw));
  return normalizePerception({
    desc: rawText.slice(0, 500) || parsed?.desc || raw.slice(0, 500),
  });
}

/**
 * Build a merged cue timeline from VTT cues, user hints, and ffprobe scene changes.
 * Start with VTT cues as the base, then merge in user hint timestamps (highest
 * priority) and ffprobe scene changes (lowest). Sorts by time and deduplicates
 * boundaries within 500ms keeping the highest-weight source.
 *
 * Returns a unified array of { timeMs, sourceTag, label } ready for the prompt.
 */
function buildMergedCues(userHint, cues, sceneChangesMs, totalDurationMs) {
  const entries = [];

  // Source weight: userHint=3, VTT/subtitle=2, ffprobe scene=1
  // Track earliest occurrence per timestamp cluster for weight comparison

  // 1. VTT cues as the base
  for (const cue of cues) {
    const t = Math.floor(cue.end * 1000);
    if (t > 0 && t < totalDurationMs) {
      entries.push({ timeMs: t, source: 2, sourceTag: "subtitle", label: cue.text.slice(0, 80) });
    }
  }

  // 2. Merge user hints into the timeline (highest weight)
  // Supports both flat { at_XXXX: "..." } and nested { overall: "...", timed: { at_XXXX: "..." } }
  var hintSrc = userHint;
  if (hintSrc && typeof hintSrc === "object" && !Array.isArray(hintSrc)) {
    // If userHint has a "timed" sub-object, prefer entries from there
    var timedEntries = hintSrc.timed && typeof hintSrc.timed === "object" ? hintSrc.timed : hintSrc;
    for (const [key, val] of Object.entries(timedEntries)) {
      const m = key.match(/^at[_-]?(\d+)$/);
      if (m) {
        const t = parseInt(m[1], 10);
        if (t > 0 && t < totalDurationMs) {
          entries.push({ timeMs: t, source: 3, sourceTag: "userHint", label: String(val) });
        }
      }
    }
  }

  // 3. Merge ffprobe scene changes (lowest weight)
  for (const t of sceneChangesMs) {
    if (t > 0 && t < totalDurationMs) {
      entries.push({ timeMs: t, source: 1, sourceTag: "scene", label: "(shot change)" });
    }
  }

  // Sort by time, then by weight descending (so higher weight wins dedup)
  entries.sort((a, b) => a.timeMs - b.timeMs || b.source - a.source);

  // Deduplicate: within 500ms, keep the first (highest-weight, since sorted above)
  const merged = [];
  for (const e of entries) {
    const last = merged[merged.length - 1];
    if (last && Math.abs(last.timeMs - e.timeMs) < 500) continue;
    merged.push(e);
  }

  return merged;
}

function analyzeVideo(videoPath, normInfo, normDir, prompts, vttCli, sttCli, context = "", userHint = "", ittCli = null, sampleInterval = DEFAULT_VTT_SAMPLE_INTERVAL, agentCli = null, userHints = null) {
  let ctxParts = [];
  if (context) ctxParts.push(`Context: ${context}`);
  if (userHint && typeof userHint === "string") ctxParts.push(`User hint: ${userHint}`);
  const ctx = ctxParts.length > 0 ? ctxParts.join("\n") + "\n\n" : "";
  const perception = {};

  // 1. VTT → overall video description
  emitInfo(`  Running video understanding...`);
  const descPrompt = ctx + getPrompt(prompts, "video-perception");
  const descRaw = runVTT(normInfo.path, descPrompt, vttCli, ittCli, sampleInterval);
  const descText = stripThinkBlocks(extractRawText(descRaw));
  perception.desc = descText.slice(0, 500) || looseJSONParse(descRaw)?.desc || descRaw.slice(0, 500);

  // 2. STT → VTT subtitle
  emitInfo(`  Running speech-to-text...`);
  perception.subtitle = runSTT(videoPath, normDir, sttCli);

  // 3. Build merged cue timeline from VTT + user hints + ffprobe
  emitInfo(`  Building merged segment boundaries...`);
  const cues = perception.subtitle ? parseVTT(join(dirname(videoPath), perception.subtitle)) : [];
  const totalDurMs = Math.round((normInfo.trimmedDuration || getVideoDuration(videoPath)) * 1000);

  // Parse userHint/userHints: string → overall context only; object with at_* keys → timestamp boundaries
  let hintObject = {};
  if (userHints && typeof userHints === "object") {
    // New format: { overall: "...", at_XXXX: "...", ... }
    hintObject = userHints;
  } else if (userHint && typeof userHint === "object") {
    hintObject = userHint;
  }

  const sceneChangesMs = detectSceneChanges(videoPath);
  if (sceneChangesMs.length > 0) emitInfo(`  ffprobe: ${sceneChangesMs.length} scene changes detected`);

  const mergedCues = buildMergedCues(hintObject, cues, sceneChangesMs, totalDurMs);
  emitInfo(`  ${mergedCues.length} unified boundary cues`);

  // 4. Feed the merged timeline to the LLM for final segment merging
  let segments = {};
  if (mergedCues.length > 0) {
    const candidateLines = mergedCues.map(c => `- ${c.timeMs}ms [${c.sourceTag}]: ${c.label}`).join("\n");
    const transcript = cues.map(c => `${formatTime(c.start)} --> ${formatTime(c.end)}\n${c.text}`).join("\n\n");

    const segInput = `Candidates:\n${candidateLines}\n\nTranscript:\n${transcript || "(no speech)"}\n\nDuration: ${totalDurMs}ms`;
    const segPrompt = ctx + getPrompt(prompts, "detect-scenes");
    // Use agent CLI with a dummy input (detect-scenes is text reasoning; agent CLI handles text + vision)
    const tmpDir = join(__dirname, ".tmp");
    mkdirSync(tmpDir, { recursive: true });
    const dummyInput = join(tmpDir, "_.png");
    if (!existsSync(dummyInput)) {
      writeFileSync(dummyInput, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"));
    }
    const segRaw = runAgent(dummyInput, `${segPrompt}\n\nInput:\n${segInput}`, agentCli || ittCli);
    const segParsed = looseJSONParse(segRaw);

    if (segParsed && typeof segParsed === "object" && Object.keys(segParsed).length > 0) {
      segments = segParsed;
      emitInfo(`  LLM merged into ${Object.keys(segments).length} segments`);
    } else {
      // Fallback: use merged cues as raw cut points
      emitInfo(`  LLM merge returned empty — using raw boundaries`);
      let prev = 0;
      for (const c of mergedCues) {
        const key = `${prev}to${c.timeMs}`;
        segments[key] = { subtitle: c.label };
        prev = c.timeMs;
      }
      if (prev < totalDurMs) {
        const key = `${prev}to${totalDurMs}`;
        segments[key] = { subtitle: "" };
      }
    }
  }

  // Fallback: no boundaries at all → single full-video segment
  if (Object.keys(segments).length === 0) {
    emitInfo(`  No segment boundaries — using full video as single segment`);
    segments = { [`0to${totalDurMs}`]: { subtitle: "" } };
  }

  // 5. Percept each segment
  perception.segments = {};
  if (Object.keys(segments).length > 0) {
    const segDir = join(normDir, "segments");
    mkdirSync(segDir, { recursive: true });
    const visSegPrompt = getPrompt(prompts, "video-perception");

    for (const [key, seg] of Object.entries(segments)) {
      const msMatch = key.match(/^(\d+)to(\d+)$/);
      if (!msMatch) continue;
      const startMs = parseInt(msMatch[1], 10);
      const endMs = parseInt(msMatch[2], 10);
      if (endMs <= startMs) continue;

      const startSec = startMs / 1000;
      const durSec = (endMs - startMs) / 1000;

      const clipName = `${basename(normInfo.path, extname(normInfo.path))}_seg_${key}.mp4`;
      const clipOut = join(segDir, clipName);
      let clipPath = normInfo.path;

      if (!existsSync(clipOut)) {
        const srcForClip = existsSync(normInfo.path) ? normInfo.path : videoPath;
        const clipFilter = "scale='min(360,iw)':'min(360,ih)':force_original_aspect_ratio=decrease,pad='ceil(iw/2)*2':'ceil(ih/2)*2':-1:-1";
        try {
          // Use -ss after -i (output seek) for accurate duration metadata
          run(`ffmpeg -y -i ${shQuote(srcForClip)} -ss ${startSec} -t ${durSec} -vf ${shQuote(clipFilter)} -c:v libx264 -preset fast -crf 28 -an -fflags +genpts ${shQuote(clipOut)}`, { timeout: 120_000 });
          if (existsSync(clipOut)) clipPath = clipOut;
        } catch { /* fallback */ }
      } else { clipPath = clipOut; }

      // Use runVTT for video clips (extracts frames, then runs ITT)
      const segRawVis = runVTT(clipPath, visSegPrompt, vttCli, ittCli, sampleInterval);
      const segVisText = extractRawText(segRawVis);
      seg.vision = stripThinkBlocks(looseJSONParse(segRawVis)?.desc || segVisText.slice(0, 300) || segRawVis.slice(0, 300));
      try { if (clipPath !== normInfo.path) rmSync(clipPath, { force: true }); } catch {}
    }
    try { rmSync(segDir, { recursive: true, force: true }); } catch {}
    perception.segments = segments;
  }

  return normalizePerception(perception);
}

// ── Full pipeline runner (step 2: label → normalize → percept → segments) ──

async function runFullPipeline(folder, prompts, ittCli, vttCli, sttCli, context, pickSet, vttSampleInterval, skipSTT, dryRun, agentCli = null) {
  const metadataPath = join(folder, "metadata.json");

  // ── Ensure metadata exists ──────────────────────────────────────────
  if (!existsSync(metadataPath)) {
    emitInfo(`\n📋 No metadata.json found. Extracting metadata first...`);
    await runMetadataMode(folder, pickSet, false);
  }

  if (!existsSync(metadataPath)) {
    emitError("No media files found — nothing to process.");
    return;
  }

  const metadata = JSON.parse(readFileSync(metadataPath, "utf-8"));
  if (Object.keys(metadata).length === 0) {
    emitError("metadata.json is empty — no media found.");
    return;
  }

  // ── Build preview and open label server ─────────────────────────────
  emitInfo(`\n🏗️  Building preview from metadata (${Object.keys(metadata).length} entries)...`);
  const previewTree = buildPreviewTree(folder, metadata);
  const previewJsonPath = join(folder, ".preview.json");
  writeFileSync(previewJsonPath, JSON.stringify(previewTree, null, 2), "utf-8");

  const labelServer = join(__dirname, "..", "player", "label-server.mjs");
  if (!existsSync(labelServer)) {
    emitError(`Label server not found at ${labelServer}`);
    process.exit(1);
  }

  emitInfo(`\n🏷️  Opening label preview...`);
  emitInfo(`  Label each scene, then close the browser/tab when done.`);
  emitInfo(`  Labels will be merged into metadata.json as user hints.\n`);

  const port = 3031;
  const child = spawn("node", [labelServer, previewJsonPath, `--port=${port}`], {
    cwd: resolve(__dirname, "..", ".."),
    stdio: ["ignore", "pipe", "inherit"],
  });

  let serverReady = false;
  if (child.stdout) {
    child.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
      if (!serverReady && chunk.toString().includes("Label Preview")) {
        serverReady = true;
        try { execSync(`open http://localhost:${port}`, { stdio: "ignore" }); } catch {}
      }
    });
  }

  // Wait for user to close the browser tab / label server
  await new Promise((resolvePromise) => { child.on("exit", () => resolvePromise()); });

  // ── Merge labels into metadata ──────────────────────────────────────
  emitInfo(`\n💾 Merging labels into metadata.json...`);
  const updatedMetadata = mergeLabelsIntoMetadata(folder, metadata);
  writeFileSync(metadataPath, JSON.stringify(updatedMetadata, null, 2), "utf-8");
  emitSuccess(`metadata.json updated with user hints`);

  try { rmSync(previewJsonPath, { force: true }); } catch {}

  // ── Proceed with the rest of the pipeline ──────────────────────────
  if (dryRun) {
    emitInfo("\n⚠️  Dry run — skipping normalize + percept after label merge.");
    return;
  }

  await runNormalizeAndPercept(folder, metadataPath, prompts, ittCli, vttCli, sttCli, context, pickSet, vttSampleInterval, skipSTT, agentCli);
}

// ── Normalize + Percept (internal step) ───────────────────────────────────

async function runNormalizeAndPercept(folder, metadataPath, prompts, ittCli, vttCli, sttCli, context, pickSet, vttSampleInterval, skipSTT, agentCli = null) {
  const { results, cacheMap } = loadMetadata(folder);
  const cache = { ...cacheMap };
  const normDir = join(folder, ".normalized");
  mkdirSync(normDir, { recursive: true });

  const allFiles = readdirSync(folder);
  const imageFiles = allFiles.filter(f => IMAGE_EXTS.has(extname(f).toLowerCase()));
  const videoFiles = allFiles.filter(f => VIDEO_EXTS.has(extname(f).toLowerCase()));

  emitInfo(`\n🔧 Normalizing + perceiving: ${folder}`);
  emitInfo(`  ${imageFiles.length} images, ${videoFiles.length} videos`);

  // Process images
  for (const fileName of imageFiles) {
    if (pickSet.size > 0 && !pickSet.has(fileName)) continue;
    const base = basename(fileName, extname(fileName));
    const meta = results[base];
    if (!meta) { emitWarn(`  No metadata for ${fileName}, skipping.`); continue; }
    const userHint = meta.userHints?.overall || meta.userHint || "";
    const userHints = meta.userHints || (userHint ? { overall: userHint } : {});

    emitInfo(`\n📷 Image: ${base}${userHint ? ` (hint: "${userHint}")` : ""}`);
    const imgPath = join(folder, fileName);
    const normPath = normalizeImage(imgPath, normDir);

    let perception = {};
    let cacheKey = "";
    const ctx = context ? `Context: ${context}\n\n` : "";
    const imgPrompt = (userHint ? `User hint: ${userHint}\n\n` : "") + ctx + getPrompt(prompts, "image-perception");
    const imgInput = `${ittCli ? "" : "@"}${shQuote(normPath)}`;
    const imgCmd = substituteTemplate(ittCli || DEFAULT_ITT, { input: imgInput, prompt: imgPrompt });
    cacheKey = perceptionCacheKey(imgPath, imgCmd, "image");
    if (cache[cacheKey]) {
      perception = cache[cacheKey];
      emitInfo(`  (cached)`);
    } else {
      perception = analyzeImage(imgPath, normPath, prompts, ittCli, context, userHint, userHints);
      if (perception.desc) cache[cacheKey] = perception;
      emitInfo(`  ${perception.desc?.slice(0, 80)}...`);
    }
    results[base] = { ...meta, perception, _cache: cacheKey };
    writeFileSync(metadataPath, JSON.stringify(results, null, 2), "utf-8");

    // Enrich location for images too
    let location = meta.location;
    if (location) location = await enrichLocation(location);
    if (location !== meta.location) {
      results[base] = { ...results[base], location };
      writeFileSync(metadataPath, JSON.stringify(results, null, 2), "utf-8");
    }
  }

  // Process videos
  for (const fileName of videoFiles) {
    if (pickSet.size > 0 && !pickSet.has(fileName)) continue;
    const base = basename(fileName, extname(fileName));
    const meta = results[base];
    if (!meta) { emitWarn(`  No metadata for ${fileName}, skipping.`); continue; }
    const userHint = meta.userHints?.overall || meta.userHint || "";
    const userHints = meta.userHints || (userHint ? { overall: userHint } : {});

    emitInfo(`\n🎬 Video: ${base}${userHint ? ` (hint: "${userHint}")` : ""}`);
    const vidPath = join(folder, fileName);
    const normInfo = normalizeVideo(vidPath, normDir, meta.duration);
    const stt = skipSTT ? null : sttCli;

    let perception = {};
    let cacheKey = "";
    const ctxV = context ? `Context: ${context}\n\n` : "";
    const vidPrompt = (userHint ? `User hint: ${userHint}\n\n` : "") + ctxV + getPrompt(prompts, "video-perception");
    let vttActualCmd;
    if (vttCli) {
      vttActualCmd = substituteTemplate(vttCli, { input: shQuote(normInfo.path), prompt: vidPrompt });
    } else {
      const dur = meta.duration || 0;
      const n = Math.max(5, Math.min(10, Math.ceil(dur / vttSampleInterval)));
      const framePaths = Array.from({ length: n }, (_, i) => `${basename(normInfo.path, extname(normInfo.path))}_${String(i + 1).padStart(3, "0")}.jpg`);
      vttActualCmd = substituteTemplate(ittCli || DEFAULT_ITT, { input: framePaths.map(p => `@${p}`).join(" "), prompt: vidPrompt });
    }
    cacheKey = perceptionCacheKey(vidPath, vttActualCmd, "video");
    if (cache[cacheKey]) {
      perception = cache[cacheKey];
      emitInfo(`  (cached)`);
    } else {
      perception = analyzeVideo(vidPath, normInfo, normDir, prompts, vttCli, stt, context, userHint, ittCli, vttSampleInterval, agentCli, userHints);
      if (perception.desc) cache[cacheKey] = perception;
    }

    let location = meta.location;
    if (location) location = await enrichLocation(location);

    results[base] = { ...meta, location, perception, _cache: cacheKey };
    writeFileSync(metadataPath, JSON.stringify(results, null, 2), "utf-8");
  }

  emitInfo(`\n✅ Pipeline complete: ${Object.keys(results).length} files → metadata.json`);
}

// ═════════════════════════════════════════════════════════════════════════
// CLI entry
// ═════════════════════════════════════════════════════════════════════════

function printUsage() {
  console.log(`
markcut vision — Analyze images and videos in a folder for video generation

Usage:
  markcut vision <folder>                Extract metadata into metadata.json
  markcut vision <folder> --label        Full pipeline: preview → label → normalize → percept → segments

Options:
  --label              Open label preview → then continue with full AI pipeline
  --agent <template>   Custom text LLM CLI for detect-scenes ({prompt})
  --itt <template>     Custom ITT CLI template with {input}, {prompt}
  --vtt <template>     Custom VTT CLI template with {input}, {prompt}
  --stt <template>     Custom STT CLI template with {input}, {output}
  --prompts-file <path> Path to prompts markdown file (default: vision_prompts.md)
  --vtt-sample-interval <n> Sample one video frame every N seconds (default: 5)
  --context "text"     Background context about people/places (injected into prompts)
  --pick <files>       Comma-separated filenames to process
  --skip-stt           Skip speech-to-text for videos
  --dry-run            Show what would be processed without running AI
  --show-prompts       Print the prompts file and exit
  --show-clis          Print the default ITT/VTT/STT CLI templates
  --help               Show this help

Prompt overrides:
  --<prompt-name> "text"  Override any prompt template from vision_prompts.md
`);
}

export async function main(args) {
  let folder = "";
  let agentCli = null;
  let ittCli = null;
  let vttCli = null;
  let sttCli = null;
  let promptsFile = PROMPTS_FILE;
  let context = "";
  let vttSampleInterval = DEFAULT_VTT_SAMPLE_INTERVAL;
  let skipSTT = false;
  let dryRun = false;
  let doLabel = false;
  const pickSet = new Set();
  const promptOverrides = new Map();

  let i = 2;
  if (args[i] === "vision") i++;
  if (args[i] && !args[i].startsWith("--")) folder = args[i++];

  while (i < args.length) {
    const flag = args[i++];
    if (flag === "--help") { printUsage(); return; }
    else if (flag === "--label") { doLabel = true; }
    else if (flag === "--agent" && args[i]) { agentCli = args[i++]; }
    else if (flag === "--itt" && args[i]) { ittCli = args[i++]; }
    else if (flag === "--vtt" && args[i]) { vttCli = args[i++]; }
    else if (flag === "--stt" && args[i]) { sttCli = args[i++]; }
    else if (flag === "--prompts-file" && args[i]) { promptsFile = resolve(args[i++]); }
    else if (flag === "--vtt-sample-interval" && args[i]) { vttSampleInterval = parseInt(args[i++], 10) || DEFAULT_VTT_SAMPLE_INTERVAL; }
    else if (flag === "--context" && args[i]) { context = args[i++]; }
    else if (flag === "--show-prompts") { console.log(readFileSync(promptsFile, "utf-8")); return; }
    else if (flag === "--show-clis") {
      console.log(`DEFAULT_ITT:\n${DEFAULT_ITT}\n`);
      console.log(`DEFAULT_VTT: (empty — uses ITT via frame extraction, sample every ${DEFAULT_VTT_SAMPLE_INTERVAL}s)\n`);
      console.log(`DEFAULT_STT:\n${DEFAULT_STT}`);
      return;
    }
    else if (flag === "--skip-stt") { skipSTT = true; }
    else if (flag === "--pick" && args[i]) { for (const f of args[i++].split(",")) pickSet.add(f.trim()); }
    else if (flag === "--dry-run") { dryRun = true; }
    else if (flag.startsWith("--") && args[i]) { promptOverrides.set(flag.slice(2), args[i++]); }
  }

  if (!folder) { emitError("No folder specified."); printUsage(); process.exit(1); }
  folder = resolve(folder);
  if (!existsSync(folder)) { emitError(`Folder not found: ${folder}`); process.exit(1); }

  const prompts = loadPrompts(promptsFile);
  for (const [name, value] of promptOverrides) prompts.set(name, value);

  if (doLabel) {
    await runFullPipeline(folder, prompts, ittCli, vttCli, sttCli, context, pickSet, vttSampleInterval, skipSTT, dryRun, agentCli);
  } else {
    await runMetadataMode(folder, pickSet, dryRun);
  }
}

// Direct execution
if (process.argv[1] && process.argv[1].includes("src/vision/cli.mjs")) {
  main(process.argv).catch((e) => { emitError(e.message); process.exit(1); });
}
