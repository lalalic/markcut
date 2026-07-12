#!/usr/bin/env node
/**
 * `markcut vision <folder>` — Vision understanding CLI.
 *
 * Processes all images and videos in a folder:
 *   1. Extract raw metadata (width, height, created, GPS, duration)
 *   2. Normalize media to .normalized/ (token-efficient sizes)
 *   3. Run ITT (image-to-text) and VTT (video-to-text) via configured CLI
 *   4. For videos: run STT → VTT subtitles
 *   5. Output metadata.json with metadata + perception for video generation
 *
 * Default ITT/VTT: pi with agnes-2.0-flash (from image-video-understanding skill)
 * Default STT: whisper (same as cli-tools.ts)
 */

import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, renameSync, rmSync,
} from "node:fs";
import { join, resolve, dirname, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";

// ── Paths ─────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Constants ─────────────────────────────────────────────────────────────

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tiff", ".heic", ".avif"]);
const VIDEO_EXTS = new Set([".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v", ".wmv"]);
const MAX_IMAGE_DIMENSION = 384;    // longest side in px for normalized images
const MAX_VIDEO_DURATION = 60;      // max seconds for normalized video clip
const MAX_VIDEO_DIMENSION = 360;    // max height/width for normalized video

const DEFAULT_ITT =
  'uvx --from mlx-vlm mlx_vlm.generate --model mlx-community/MiniCPM-V-4.6-bf16 --max-tokens 2048 --prompt "{prompt}" --image {input} --temperature 0.0';
/** Interval in seconds between sampled video frames (default: one frame every 5 s). */
const DEFAULT_VTT_SAMPLE_INTERVAL = 5;
const DEFAULT_VTT = 'uvx --from mlx-vlm mlx_vlm.generate --model mlx-community/MiniCPM-V-4.6-bf16 --max-tokens 2048 --prompt "{prompt}" --video {input} --temperature 0.0 --processor-kwargs \'{"max_num_frames": 32, "stack_frames": 1, "max_slice_nums": 1, "use_image_id": false}\''; // empty → use frame sampling + ITT; set to customize
const DEFAULT_STT =
  'uvx --from openai-whisper whisper "{input}" --output_format vtt --output_dir "{output}"';

const PROMPTS_FILE = join(__dirname, "vision_prompts.md");

// ── Helpers ───────────────────────────────────────────────────────────────

function emitInfo(msg) { console.error(msg); }
function emitSuccess(msg) { console.error(`✅ ${msg}`); }
function emitWarn(msg) { console.error(`⚠️  ${msg}`); }
function emitError(msg) { console.error(`❌ ${msg}`); }

/**
 * Run a command, return stdout. Throws on non-zero exit.
 */
function run(cmd, opts = {}) {
  return execSync(cmd, {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 300_000,
    ...opts,
  });
}

// ── Cache (embedded in metadata.json) ────────────────────────────────────
// Perception results are cached inside metadata.json via a `_cache` hash field
// on each entry. The hash covers (file fingerprint + CLI config + prompts + context).
// If the hash matches, perception is skipped on re-run.

/** Hash of file mtime+size to detect changes. */
function fileFingerprint(filePath) {
  try {
    const s = statSync(filePath);
    return `${s.mtimeMs}:${s.size}`;
  } catch {
    return "0:0";
  }
}

/** Build a deterministic cache key for a media file. */
function perceptionCacheKey(filePath, prompts, ittCli, vttCli, sttCli, context, type) {
  const parts = {
    file: fileFingerprint(filePath),
    type,
    ittCli: ittCli || DEFAULT_ITT,
    vttCli: vttCli || DEFAULT_VTT,
    sttCli: sttCli || DEFAULT_STT,
    context: context || "",
    prompts: Object.fromEntries([...prompts.entries()].sort()),
  };
  return createHash("sha1").update(JSON.stringify(parts)).digest("hex").slice(0, 16);
}

/**
 * Load existing metadata.json and build a cache map from `_cache` fields.
 * Returns { results, cacheMap } where cacheMap = { [cacheKey]: perception }.
 */
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

/**
 * Quote a string for shell safety.
 */
function shQuote(s) {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

/**
 * Parse prompts from the prompts markdown file.
 * Returns Map<promptName, promptTemplate>.
 */
function loadPrompts(filePath) {
  const prompts = new Map();
  if (!existsSync(filePath)) {
    emitWarn(`Prompts file not found: ${filePath}`);
    return prompts;
  }
  const content = readFileSync(filePath, "utf-8");
  // Match sections: ## prompt-name\n~~~md\n...content...\n~~~
  const sectionRe = /^##\s+(\S[\w-]*)\s*\n~~~md\n([\s\S]*?)~~~\s*$/gm;
  let match;
  while ((match = sectionRe.exec(content)) !== null) {
    const name = match[1].trim();
    const template = match[2].trim();
    if (name && template) {
      prompts.set(name, template);
    }
  }
  return prompts;
}

/**
 * Substitute placeholders in a CLI template string.
 * Supports: {input}, {output}, {prompt}
 */
function substituteTemplate(tmpl, vars) {
  let result = tmpl;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, "g"), String(value));
  }
  return result;
}

// ── Media Scanning ────────────────────────────────────────────────────────

/**
 * Scan a folder and return lists of image and video file paths (sorted).
 */
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

/**
 * Try exiftool for rich GPS/exif metadata, falling back to ffprobe.
 * Returns { width, height, created, location, duration? }.
 */
function extractMetadata(filePath) {
  let width = 0, height = 0, created = null, duration = null;
  let location = null;

  // ── Try exiftool first (best for image/video EXIF tags) ──────────────
  try {
    const cmd = `exiftool -json ${shQuote(filePath)} 2>/dev/null`;
    const out = run(cmd, { timeout: 30_000 });
    const items = JSON.parse(out);
    if (items && items.length > 0) {
      const tag = items[0];

      // Dimensions
      width = parseInt(tag.ImageWidth || tag.ExifImageWidth || tag.Width || 0, 10);
      height = parseInt(tag.ImageHeight || tag.ExifImageHeight || tag.Height || 0, 10);

      // Creation date
      const dateStr = tag.CreateDate || tag.DateTimeOriginal || tag.MediaCreateDate || "";
      if (dateStr) {
        // exiftool format: "2024:06:15 18:30:00" — split on space, fix date colons only
        const parts = dateStr.split(" ");
        const datePart = (parts[0] || "").replace(/:/g, "-");
        const timePart = parts[1] || "";
        created = datePart + (timePart ? "T" + timePart + "Z" : "Z");
      }

      // Duration (video)
      if (tag.Duration) {
        const dur = parseFloat(tag.Duration);
        if (!isNaN(dur)) duration = dur;
      }

      // GPS — try ISO6709 first (includes sign inherently), then DMS, then decimal
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
  } catch {
    // exiftool not available or failed — fall through to ffprobe
  }

  // ── Fallback: ffprobe ────────────────────────────────────────────────
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

      // GPS fallback from ffprobe tags (ISO6709 first, then decimal with ref)
      if (!location && format.tags) {
        const iso = format.tags["com.apple.quicktime.location.ISO6709"] || "";
        if (iso) {
          const gps = parseISO6709(iso);
          if (gps) location = gps;
        }
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
    } catch {
      emitWarn(`ffprobe also failed on: ${filePath}`);
    }
  }

  return { width, height, created, location, duration };
}

/**
 * Parse ISO 6709 coordinate string (Apple QuickTime format).
 * Examples: +45.5997-076.0053+216.443/  or  +45.5997-076.0053/
 */
function parseISO6709(str) {
  const m = str.match(/^([+-]\d+\.?\d*)([+-]\d+\.?\d*)/);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  if (isNaN(lat) || isNaN(lng)) return null;
  return { lat, lng, place: null };
}

/**
 * Try to parse a DMS (degrees-minutes-seconds) GPS string from exiftool.
 * e.g. "45 deg 35' 58.92\" N" → 45.5997
 * Also handles the hemisphere embedded in the value string (e.g. trailing "W").
 * Returns null if parsing fails.
 */
function tryParseGPS(val, ref) {
  if (!val) return null;
  const s = String(val).trim();
  let dec = NaN;
  let negative = false;

  // Check for hemisphere in the value string itself (trailing N/S/E/W)
  const hemiMatch = s.match(/[NSnsEeWw]\s*$/);
  if (hemiMatch) {
    const h = hemiMatch[0].toUpperCase();
    if (h === "S" || h === "W") negative = true;
  }

  // Try direct number first (e.g. "45.6123")
  const direct = parseFloat(s);
  if (!isNaN(direct) && s.indexOf("deg") === -1) {
    dec = direct;
  } else {
    // DMS format: "45 deg 35' 58.92\" N"
    const dms = s.match(/([+-]?\d+(?:\.\d+)?)\s*deg\s*(\d+(?:\.\d+)?)\s*'\s*(\d+(?:\.\d+)?)/);
    if (dms) {
      dec = parseFloat(dms[1]) + parseFloat(dms[2]) / 60 + parseFloat(dms[3]) / 3600;
    }
  }

  // Apply sign: ref param takes priority, fallback to hemisphere in value string
  if (!isNaN(dec)) {
    if (ref) {
      if (ref === "S" || ref === "South" || ref === "W" || ref === "West" || ref.startsWith("-")) dec = -dec;
    } else if (negative) {
      dec = -dec;
    }
    return dec;
  }
  return null;
}

// ── Media Normalization ───────────────────────────────────────────────────

/**
 * Normalize an image: resize so longest side ≤ maxDim.
 * Returns the path to the normalized file.
 */
function normalizeImage(srcPath, normDir, maxDim = MAX_IMAGE_DIMENSION) {
  const ext = extname(srcPath).toLowerCase();
  // Use JPEG for normalized output (universal support, smaller size)
  const outName = `${basename(srcPath, ext)}_${maxDim}.jpg`;
  const outPath = join(normDir, outName);

  if (existsSync(outPath)) return outPath; // already normalized

  const filter = `scale='min(${maxDim},iw)':'min(${maxDim},ih)':force_original_aspect_ratio=decrease`;
  const cmd = `ffmpeg -y -i ${shQuote(srcPath)} -vf ${shQuote(filter)} -q:v 3 ${shQuote(outPath)}`;
  try {
    run(cmd);
    return outPath;
  } catch (e) {
    emitWarn(`Failed to normalize image ${basename(srcPath)}: ${e.message}`);
    return srcPath; // fallback to original
  }
}

/**
 * Normalize a video:
 *   - ≤60s: trim + scale (preserves audio)
 *   - >60s: sample 60 evenly-spaced frames across the full duration (no audio)
 * Returns { path, trimmedDuration, timeHint }.
 */
function normalizeVideo(srcPath, normDir, duration, maxDim = MAX_VIDEO_DIMENSION, maxDur = MAX_VIDEO_DURATION, maxSamples = 60) {
  const ext = extname(srcPath).toLowerCase() || ".mp4";
  const base = basename(srcPath, ext);
  const totalDur = duration || getVideoDuration(srcPath);

  if (totalDur <= maxDur) {
    // ── Short video: trim to fit maxDur, scale, keep audio ──────────────
    const timeHint = `0to${Math.floor(totalDur)}`;
    const outName = `${base}_${timeHint}.mp4`;
    const outPath = join(normDir, outName);
    if (existsSync(outPath)) return { path: outPath, trimmedDuration: totalDur, timeHint };

    const filter = `scale='min(${maxDim},iw)':'min(${maxDim},ih)':force_original_aspect_ratio=decrease,pad='ceil(iw/2)*2':'ceil(ih/2)*2':-1:-1`;
    const cmd = `ffmpeg -y -i ${shQuote(srcPath)} -t ${totalDur} -vf ${shQuote(filter)} -c:v libx264 -preset fast -crf 28 -c:a aac -b:a 64k ${shQuote(outPath)}`;
    try {
      run(cmd, { timeout: 600_000 });
      return { path: outPath, trimmedDuration: totalDur, timeHint };
    } catch (e) {
      try { rmSync(outPath, { force: true }); } catch {}
      emitWarn(`Failed to normalize video ${basename(srcPath)}: ${e.message}`);
      return { path: srcPath, trimmedDuration: totalDur, timeHint };
    }
  }

  // ── Long video: sample evenly-spaced frames, output at 1fps (no audio) ─
  const timeHint = `full`;
  const outName = `${base}_${timeHint}.mp4`;
  const outPath = join(normDir, outName);
  if (existsSync(outPath)) return { path: outPath, trimmedDuration: totalDur, timeHint };

  const frameCount = getVideoFrameCount(srcPath);
  const step = Math.max(1, Math.floor(frameCount / maxSamples));
  const actualSamples = Math.min(maxSamples, Math.ceil(frameCount / step));

  // Select evenly-spaced frames, reassign PTS so they play at 1fps, scale
  const filter = `select='not(mod(n,${step}))',setpts=N/TB,scale='min(${maxDim},iw)':'min(${maxDim},ih)':force_original_aspect_ratio=decrease,pad='ceil(iw/2)*2':'ceil(ih/2)*2':-1:-1`;
  const cmd = `ffmpeg -y -i ${shQuote(srcPath)} -vf ${shQuote(filter)} -c:v libx264 -preset fast -crf 28 -an -t ${actualSamples} -r 1 ${shQuote(outPath)}`;
  try {
    emitInfo(`  Sampling ${actualSamples} frames across ${totalDur.toFixed(1)}s video`);
    run(cmd, { timeout: 600_000 });
    return { path: outPath, trimmedDuration: totalDur, timeHint };
  } catch (e) {
    try { rmSync(outPath, { force: true }); } catch {}
    emitWarn(`Failed to normalize video ${basename(srcPath)}: ${e.message}`);
    return { path: srcPath, trimmedDuration: totalDur, timeHint };
  }
}

/**
 * Get video duration using ffprobe (fast).
 */
function getVideoDuration(filePath) {
  try {
    const cmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 ${shQuote(filePath)}`;
    const out = run(cmd).trim();
    return parseFloat(out) || 0;
  } catch {
    return 0;
  }
}

/**
 * Get total frame count using ffprobe.
 */
function getVideoFrameCount(filePath) {
  try {
    const cmd = `ffprobe -v error -select_streams v:0 -count_frames -show_entries stream=nb_read_frames -of default=noprint_wrappers=1:nokey=1 ${shQuote(filePath)}`;
    const out = run(cmd, { timeout: 60_000 }).trim();
    const n = parseInt(out, 10);
    return isNaN(n) ? 0 : n;
  } catch {
    return 0;
  }
}

// ── ITT / VTT / STT ───────────────────────────────────────────────────────

/**
 * Run ITT (Image-to-Text) CLI on one or more images.
 * @param {string|string[]} inputPaths - Single image path or array of paths.
 * @returns The stdout text from the CLI.
 */
function runITT(inputPaths, promptText, ittCli) {
  const paths = Array.isArray(inputPaths) ? inputPaths : [inputPaths];
  const tmpl = ittCli || DEFAULT_ITT;
  const inputStr = paths.map(p => `${shQuote(p)}`).join(" ");
  const cmd = substituteTemplate(tmpl, { input: inputStr, prompt: promptText });
  try {
    return run(cmd).trim();
  } catch (e) {
    emitWarn(`ITT failed for ${basename(paths[0])}: ${e.message}`);
    return "";
  }
}

/**
 * Extract evenly-spaced frames from a video into a temp directory.
 * @returns {{ frames: string[], cleanup: () => void }}
 */
function extractVideoFrames(videoPath, intervalSeconds = DEFAULT_VTT_SAMPLE_INTERVAL) {
  const tmpDir = join(dirname(videoPath), ".pi-vtt");
  mkdirSync(tmpDir, { recursive: true });

  const duration = getVideoDuration(videoPath);
  const n = Math.max(5, Math.min(10, Math.ceil(duration / intervalSeconds)));
  const baseName = basename(videoPath, extname(videoPath));
  const framePattern = join(tmpDir, `${baseName}_%03d.jpg`);
  const fps = n / Math.max(duration, 1);

  try {
    run(`ffmpeg -y -i ${shQuote(videoPath)} -vf "fps=${fps},scale=360:-1" -q:v 3 ${shQuote(framePattern)}`, { timeout: 120_000 });
  } catch (e) {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    throw new Error(`Frame extraction failed: ${e.message}`);
  }

  const frames = readdirSync(tmpDir)
    .filter((f) => f.startsWith(baseName) && f.endsWith(".jpg"))
    .sort()
    .map((f) => join(tmpDir, f));

  if (frames.length === 0) {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    throw new Error("No frames extracted from video");
  }

  return {
    frames,
    cleanup: () => { try { rmSync(tmpDir, { recursive: true, force: true }); } catch {} },
  };
}

/**
 * Run VTT (Video-to-Text): extract frames and run ITT with them.
 * @param {string} videoPath - Path to the (preferably normalized) video.
 * @param {string} promptText - Description prompt.
 * @param {string|null} vttCli - Custom VTT CLI template (if provided, used as-is with {input} / {prompt}).
 * @param {string|null} ittCli - ITT CLI template (used for default frame-based VTT).
 * @param {number} sampleInterval - Seconds between sampled frames when using default ITT-based VTT.
 */
function runVTT(videoPath, promptText, vttCli, ittCli, sampleInterval = DEFAULT_VTT_SAMPLE_INTERVAL) {
  // Custom VTT template → pipe through shell command (backward compat)
  if (vttCli) {
    const tryRun = () => {
      const cmd = substituteTemplate(vttCli, { input: shQuote(videoPath), prompt: promptText });
      return run(cmd, { timeout: 600_000 }).trim();
    };
    for (let attempt = 0; attempt < 2; attempt++) {
      try { return tryRun(); } catch (e) {
        const msg = e.message || "";
        const isCorrupted = msg.includes("Cannot open video") || msg.includes("moov atom not found");
        if (attempt === 0 && isCorrupted && existsSync(videoPath)) {
          emitWarn(`  Corrupted video file, removing and retrying...`);
          try { rmSync(videoPath, { force: true }); } catch {}
          continue;
        }
        emitWarn(`VTT failed for ${basename(videoPath)}: ${msg}`);
        return "";
      }
    }
    return "";
  }

  // Default: extract frames, then use ITT (which supports multiple @file inputs)
  let extracted;
  try {
    extracted = extractVideoFrames(videoPath, sampleInterval);
  } catch (e) {
    emitWarn(`  ${e.message}`);
    return "";
  }

  const result = runITT(extracted.frames, promptText, ittCli);
  extracted.cleanup();
  return result;
}

/**
 * Run STT on a video: extract audio, then whisper → VTT.
 * Returns the VTT file path (relative to media folder), or null on failure.
 */
function runSTT(videoPath, normDir, sttCli) {
  const base = basename(videoPath, extname(videoPath));
  const mediaDir = dirname(videoPath);
  const audioPath = join(normDir, `${base}_audio.mp3`);
  const vttPath = join(mediaDir, `${base}.vtt`); // store alongside original media

  if (existsSync(vttPath)) {
    return `${base}.vtt`;
  }

  // Step 1: extract audio from original video
  try {
    const extractCmd = `ffmpeg -y -i ${shQuote(videoPath)} -vn -acodec libmp3lame -q:a 2 ${shQuote(audioPath)}`;
    run(extractCmd, { timeout: 300_000 });
  } catch (e) {
    emitWarn(`Audio extraction failed for ${base}: ${e.message}`);
    return null;
  }

  // Step 2: run STT — whisper outputs <basename>.vtt in normDir
  const tmpl = sttCli || DEFAULT_STT;
  const cmd = substituteTemplate(tmpl, {
    input: audioPath,
    output: normDir,
  });
  try {
    run(cmd, { timeout: 600_000 });
  } catch (e) {
    emitWarn(`STT failed for ${base}: ${e.message}`);
    return null;
  }

  // Move whisper's output from normDir to media folder
  const whisperVtt = join(normDir, `${base}_audio.vtt`);
  if (existsSync(whisperVtt)) {
    renameSync(whisperVtt, vttPath);
  }

  if (existsSync(vttPath)) {
    return `${base}.vtt`;
  }
  return null;
}

/**
 * Parse VTT file into an array of cues: { start, end, text }.
 */
function parseVTT(vttPath) {
  const cues = [];
  if (!existsSync(vttPath)) return cues;

  const content = readFileSync(vttPath, "utf-8");
  const cueRe = /(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})\s*\n([\s\S]*?)(?=\n\n|\n\d{2}:\d{2}|\s*$)/g;
  let match;
  while ((match = cueRe.exec(content)) !== null) {
    const start = timeToSeconds(match[1]);
    const end = timeToSeconds(match[2]);
    const text = match[3].trim().replace(/\n/g, " ");
    if (text) cues.push({ start, end, text });
  }
  return cues;
}

function timeToSeconds(ts) {
  const parts = ts.split(":");
  return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
}

// ── Prompt-based LLM call (text-only via mlx-vlm) ─────────────────────────

/**
 * Send a text-only prompt to the configured LLM (mlx-vlm without image/video).
 * Uses a 1×1 dummy PNG as a minimal image input.
 */
function queryLLM(promptText) {
  const tmpDir = join(__dirname, ".tmp");
  mkdirSync(tmpDir, { recursive: true });
  const dummyPng = join(tmpDir, "_.png");
  if (!existsSync(dummyPng)) {
    // Minimal 1×1 white PNG
    const minPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    );
    writeFileSync(dummyPng, minPng);
  }

  const cmd = `uvx --from mlx-vlm mlx_vlm.generate --model mlx-community/Qwen2.5-VL-7B-Instruct-4bit --max-tokens 2048 --prompt ${shQuote(promptText)} --image ${shQuote(dummyPng)}`;
  try {
    return run(cmd, { timeout: 300_000 }).trim();
  } catch (e) {
    emitWarn(`LLM query failed: ${e.message}`);
    return "";
  }
}

// ── Perception Analysis ───────────────────────────────────────────────────

/**
 * Attempt to fix and parse malformed JSON from model output.
 * Handles unquoted keys, trailing commas, numbered list wrapping, etc.
 *
 * Common Qwen2.5-VL output format:
 *   {
 *    1. {key: value, key: value, ...}
 *   }
 * — i.e. a numbered-list wrapper around a JSON-like object.
 */
function looseJSONParse(text) {
  if (!text) return null;
  let s = text.trim();

  // Strip common wrappers
  s = s.replace(/^(You are a helpful assistant[.\s]*)/i, "");
  s = s.replace(/<\|im_start\|>/g, "").replace(/<\|im_end\|>/g, "");
  s = s.replace(/<\|vision[^|]*\|>/g, "");
  // Strip markdown code fences (```json ... ``` or ``` ... ```)
  s = s.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");

  // Find the innermost/outermost { ... } pair
  // Strategy: find the first { and last } — anything between is candidate
  const firstBrace = s.indexOf("{");
  const lastBrace = s.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;

  let content = s.slice(firstBrace, lastBrace + 1);

  // Try direct parse first
  try { return JSON.parse(content); } catch { /* continue */ }

  // Remove numbered list prefix inside the object (e.g. "1. { ... }" → "{ ... }")
  // This handles: { \n 1. {actual content} }
  content = content.replace(/\d+\.\s*(\{)/g, (m, brace) => {
    // Keep only the brace
    return brace;
  });

  // Handle nested braces: if removal of numbered list prefix leaves
  // outer { ... } wrapper, try extracting the inner content.
  // Check: is there a '{' after position 0 and a '}' before the last char?
  const innerBrace = content.indexOf("{", 1);
  const innerBraceEnd = content.lastIndexOf("}");
  // inner brace should be after first char, and end before last char (outer wrapper)
  if (innerBrace > 0 && innerBraceEnd > innerBrace) {
    const inner = content.slice(innerBrace, innerBraceEnd + 1);
    try { return JSON.parse(inner); } catch { /* continue */ }
    // Even if JSON.parse failed, the inner content is more likely to be valid
    content = inner;
  }

  // Fix common issues
  let fixed = content
    // Remove trailing commas before closing
    .replace(/,(\s*[}\]])/g, '$1')
    // Fix single quotes to double quotes
    .replace(/'/g, '"')
    // Normalize boolean/null
    .replace(/\btrue\b/gi, 'true')
    .replace(/\bfalse\b/gi, 'false')
    .replace(/\bnull\b/gi, 'null');

  try { return JSON.parse(fixed); } catch { /* continue */ }

  // Add quotes to unquoted keys: {key: → {"key":
  fixed = fixed.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":');

  try { return JSON.parse(fixed); } catch { /* continue */ }

  // Wrap unquoted string values
  fixed = fixed.replace(/:\s*([a-zA-Z][a-zA-Z0-9_ \/-]+?)\s*([,\}\]])/g, (m, val, sep) => {
    const t = val.trim();
    if (t === "true" || t === "false" || t === "null") return `:${t}${sep}`;
    if (/^\d+(\.\d+)?$/.test(t)) return `:${t}${sep}`;
    if (t.startsWith('"') && t.endsWith('"')) return `:${t}${sep}`;
    return `:"${t}"${sep}`;
  });

  try { return JSON.parse(fixed); } catch { /* continue */ }

  // More aggressive: wrap anything that looks like a string value
  fixed = fixed.replace(/:\s*([A-Za-z][A-Za-z0-9\s,._-]+?)\s*([,\}\]])/g, (m, val, sep) => {
    const t = val.trim();
    if (t === "true" || t === "false" || t === "null") return `:${t}${sep}`;
    if (/^\d+(\.\d+)?$/.test(t)) return `:${t}${sep}`;
    return `:"${t}"${sep}`;
  });

  try { return JSON.parse(fixed); } catch { return null; }
}

/**
 * Parse perception output from the model.
 * Tries to extract JSON from the response, with fallbacks.
 */
function parseJSONFromResponse(text) {
  if (!text) return null;

  // First extract the actual model response text
  const raw = extractRawText(text);
  if (!raw) return null;

  // Try direct JSON parse
  try { return JSON.parse(raw); } catch {}

  // Try loose parsing
  const result = looseJSONParse(raw);
  if (result) return result;

  return null;
}

/**
 * Normalize perception: ensure desc is present.
 */
function normalizePerception(perception) {
  return { ...perception };
}

/**
 * Extract raw text response from mlx-vlm output.
 *
 * mlx-vlm output format:
 *
 *   ==========                              ← first separator
 *   Files: [...]
 *   (empty)
 *   Prompt: <|im_start|>system
 *   You are a helpful assistant.<|im_end|>
 *   <|im_start|>user
 *   <|vision_start|><|image_pad|><|vision_end|>{prompt}<|im_end|>
 *   <|im_start|>assistant
 *   (empty)
 *   <ACTUAL MODEL RESPONSE — may be multiple lines>
 *   ==========                              ← second separator
 *   Prompt: ... tokens...
 *   Generation: ... tokens...
 *   Peak memory: ... GB
 */
function extractRawText(text) {
  if (!text) return "";

  const lines = text.split("\n");
  const respLines = [];
  let inResponse = false;
  let seenAssistant = false;

  for (const line of lines) {
    const s = line.trim();

    // First ========== starts the block (skip it)
    // Second ========== ends the response block
    if (s.startsWith("====")) {
      if (seenAssistant) break; // second ==== → done
      continue;
    }

    // Skip metadata/header lines
    if (s.startsWith("Files:") || s.startsWith("Prompt:")) continue;
    if (s.startsWith("Generation:") || s.startsWith("Peak memory:")) continue;

    // Detect the assistant header line
    if (s.includes("<|im_start|>assistant")) {
      seenAssistant = true;
      inResponse = true;
      continue;
    }

    // Collect response lines
    if (inResponse) {
      respLines.push(line);
    }
  }

  // Join and trim
  let result = respLines.join("\n").trim();

  // Remove trailing stats if they somehow got included
  result = result.replace(/\n={3,}[\s\S]*$/, "").trim();
  // Strip markdown code fences
  result = result.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

  return result;
}

/**
 * Strip <think>...</think> reasoning blocks from model output.
 */
function stripThinkBlocks(text) {
  if (!text) return text;
  return text.replace(/^<think>[\s\S]*?<\/think>\s*/g, "");
}

/**
 * Analyze an image: run ITT with image-perception prompt, parse result.
 */
function analyzeImage(imagePath, normPath, prompts, ittCli, context = "") {
  const ctx = context ? `Context: ${context}\n\n` : "";
  const prompt = ctx + (prompts.get("image-perception") || 'Describe this image in detail. What do you see? Include setting, colors, objects, weather, mood. Write at least 3-4 sentences.');
  const raw = runITT(normPath, prompt, ittCli);
  const parsed = parseJSONFromResponse(raw);
  const rawText = stripThinkBlocks(extractRawText(raw));

  return normalizePerception({
    desc: rawText.slice(0, 500) || parsed?.desc || raw.slice(0, 500),
  });
}

/**
 * Analyze a video: run VTT, STT, segment analysis.
 */
function analyzeVideo(videoPath, normInfo, normDir, prompts, vttCli, sttCli, context = "", ittCli = null, sampleInterval = DEFAULT_VTT_SAMPLE_INTERVAL) {
  const ctx = context ? `Context: ${context}\n\n` : "";
  const perception = {};

  // Step 1: VTT → video description
  emitInfo(`  Running video understanding...`);
  const descPrompt = ctx + (prompts.get("video-description") || 'Describe this video in detail. What is happening? Describe setting, subjects, actions, visual style, mood. Write at least 3-4 sentences.');
  const descRaw = runVTT(normInfo.path, descPrompt, vttCli, ittCli, sampleInterval);
  const descParsed = parseJSONFromResponse(descRaw);
  const descText = stripThinkBlocks(extractRawText(descRaw));
  perception.desc = descText.slice(0, 500) || descParsed?.desc || descRaw.slice(0, 500);

  // Step 2: STT → VTT subtitle
  emitInfo(`  Running speech-to-text...`);
  const vttRelPath = runSTT(videoPath, normDir, sttCli);
  perception.subtitle = vttRelPath;

  // Step 3: Segments by VTT (subtitle-based) + vision analysis per segment
  perception.segmentsByVTT = {};
  if (vttRelPath) {
    const vttAbsPath = join(dirname(videoPath), vttRelPath);
    const cues = parseVTT(vttAbsPath);
    if (cues.length > 0) {
      emitInfo(`  Analyzing segments by subtitle (${cues.length} cues)...`);
      // Build the VTT transcript text
      const transcript = cues.map(c =>
        `${formatTime(c.start)} --> ${formatTime(c.end)}\n${c.text}`
      ).join("\n\n");

      const segPrompt = ctx + (prompts.get("video-segments-by-subtitle") || "Analyze these subtitles and split into segments.");
      const segInput = `${segPrompt}\n\nInput:\n${transcript}`;
      const segRaw = queryLLM(segInput);
      const segParsed = parseJSONFromResponse(segRaw);
      let segments = {};

      if (segParsed && typeof segParsed === "object") {
        segments = segParsed;
      } else {
        // Fallback: simple grouping — each cue as its own segment (ms keys)
        for (const cue of cues) {
          const key = `${Math.floor(cue.start * 1000)}to${Math.floor(cue.end * 1000)}`;
          segments[key] = cue.text.slice(0, 100);
        }
      }

      // Convert string values to {subtitle, vision} objects
      for (const [key, val] of Object.entries(segments)) {
        segments[key] = typeof val === "string" ? { subtitle: val } : { subtitle: val.subtitle || val.desc || "", ...val };
      }

      // Analyze each segment with the vision model
      const segDir = join(normDir, "segments");
      mkdirSync(segDir, { recursive: true });
      const visSegPrompt = prompts.get("video-segments-by-subtitle-vision") ||
        "Describe what is visually happening in this short video clip. Focus on visual details only.";

      for (const [key, seg] of Object.entries(segments)) {
        // Parse ms key: "12500to25000" → start=12.5s, duration=12.5s
        const msMatch = key.match(/^(\d+)to(\d+)$/);
        if (!msMatch) continue;
        const startMs = parseInt(msMatch[1], 10);
        const endMs = parseInt(msMatch[2], 10);
        const startSec = startMs / 1000;
        const durSec = (endMs - startMs) / 1000;
        if (durSec <= 0) continue;

        // Extract a short clip for this segment
        let clipPath = normInfo.path; // fallback: use full normalized video
        const clipName = `${basename(normInfo.path, extname(normInfo.path))}_seg_${key}.mp4`;
        const clipOut = join(segDir, clipName);

        if (!existsSync(clipOut)) {
          // Use the original media file for accurate seeking (normalized video may have different timing for long/sampled videos)
          const srcForClip = existsSync(normInfo.path) ? normInfo.path : videoPath;
          // Simple trim — scale to 360p for efficiency
          const clipFilter = "scale='min(360,iw)':'min(360,ih)':force_original_aspect_ratio=decrease,pad='ceil(iw/2)*2':'ceil(ih/2)*2':-1:-1";
          const clipCmd = `ffmpeg -y -ss ${startSec} -i ${shQuote(srcForClip)} -t ${durSec} -vf ${shQuote(clipFilter)} -c:v libx264 -preset fast -crf 28 -an ${shQuote(clipOut)}`;
          try {
            run(clipCmd, { timeout: 120_000 });
            if (existsSync(clipOut)) clipPath = clipOut;
          } catch {
            // fallback to full normalized video
          }
        } else {
          clipPath = clipOut;
        }

        // Run vision model on the clip
        const segRawVis = runVTT(clipPath, visSegPrompt, vttCli, ittCli, sampleInterval);
        const segVisParsed = parseJSONFromResponse(segRawVis);
        const segVisText = extractRawText(segRawVis);
        seg.vision = segVisParsed?.desc || segVisText.slice(0, 300) || segRawVis.slice(0, 300);

        // Clean up extracted clip after use
        try { if (clipPath !== normInfo.path) rmSync(clipPath, { force: true }); } catch {}
      }

      // Clean up segment temp dir
      try { rmSync(segDir, { recursive: true, force: true }); } catch {}

      perception.segmentsByVTT = segments;
    }
  }

  // Step 4: Segments by Vision Model
  emitInfo(`  Analyzing segments by vision...`);
  const visDescPrompt = ctx + (prompts.get("video-segments-by-vision") || "Watch this video and describe each scene you see. List scenes with start/end times in ms and what's happening visually.");
  const visRaw = runVTT(normInfo.path, visDescPrompt, vttCli, ittCli, sampleInterval);
  const visParsed = parseJSONFromResponse(visRaw);
  if (visParsed && typeof visParsed === "object") {
    perception.segmentsByVisionModel = visParsed;
  } else {
    perception.segmentsByVisionModel = {};
  }

  return normalizePerception(perception);
}

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${s.toFixed(3).padStart(6, "0")}`;
}

// ── Location reverse-geocode (lightweight) ────────────────────────────────
// Uses a simple helper: if GPS coords exist, try to get a place name
// via a prompt to the vision model (text only)

/**
 * Reverse-geocode GPS coordinates to a place name via Nominatim.
 * Uses OpenStreetMap's free API (no key required, 1 req/sec max).
 */
async function enrichLocation(location) {
  if (!location || location.lat == null || location.lng == null) return location;
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${location.lat}&lon=${location.lng}&format=json&zoom=14`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "markcut-vision/1.0" },
    });
    if (!res.ok) return location;
    const data = await res.json();
    const place = data?.display_name || data?.name || null;
    return { ...location, place };
  } catch {
    return location;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────

function printUsage() {
  console.log(`
markcut vision — Analyze images and videos in a folder for video generation

Usage:
  markcut vision <folder> [options]

Options:
  --itt <template>        Custom ITT CLI template with {input}, {prompt}
  --vtt <template>        Custom VTT CLI template with {input}, {prompt}
  --stt <template>        Custom STT CLI template with {input}, {output}
  --prompts-file <path>   Path to prompts markdown file (default: vision_prompts.md)
  --vtt-sample-interval <n> Sample one video frame every N seconds (default: 5)
  --skip-normalize        Skip normalization step
  --skip-stt              Skip speech-to-text for videos
  --context "text"        Background context about people/places (injected into prompts)
  --show-prompts          Print the prompts file and exit
  --show-clis             Print the default ITT/VTT/STT CLI templates and exit
  --pick <files>          Comma-separated filenames to process (e.g. 'IMG_7068.JPG,IMG_7060.MOV')
  --dry-run               Show what would be processed without running AI models
  --help                  Show this help

Prompt overrides:
  --<prompt-name> "text"  Override any prompt template from vision_prompts.md

Examples:
  markcut vision ./media
  markcut vision ./media --image-perception "Describe this image for a travel video"
  markcut vision ./media --itt 'custom-itt --prompt "{prompt}" --image "{input}"'
`);
}

export async function main(args) {
  // ── Parse args ────────────────────────────────────────────────────────
  let folder = "";
  let ittCli = null;
  let vttCli = null;
  let sttCli = null;
  let promptsFile = PROMPTS_FILE;
  let context = "";
  let vttSampleInterval = DEFAULT_VTT_SAMPLE_INTERVAL;
  let skipNormalize = false;
  let skipSTT = false;
  let dryRun = false;
  const pickSet = new Set();
  const promptOverrides = new Map();

  let i = 2; // skip "node" and "cli.mjs" (or "markcut vision")
  // Skip past "vision" command if present
  if (args[i] === "vision") i++;
  if (args[i] && !args[i].startsWith("--")) {
    folder = args[i++];
  }

  while (i < args.length) {
    const flag = args[i++];
    if (flag === "--help") { printUsage(); return; }
    else if (flag === "--itt" && args[i]) { ittCli = args[i++]; }
    else if (flag === "--vtt" && args[i]) { vttCli = args[i++]; }
    else if (flag === "--stt" && args[i]) { sttCli = args[i++]; }
    else if (flag === "--prompts-file" && args[i]) { promptsFile = resolve(args[i++]); }
    else if (flag === "--vtt-sample-interval" && args[i]) { vttSampleInterval = parseInt(args[i++], 10) || DEFAULT_VTT_SAMPLE_INTERVAL; }
    else if (flag === "--context" && args[i]) { context = args[i++]; }
    else if (flag === "--show-prompts") {
      const promptsContent = readFileSync(promptsFile, "utf-8");
      console.log(promptsContent);
      return;
    }
    else if (flag === "--show-clis") {
      console.log(`DEFAULT_ITT:\n${DEFAULT_ITT}\n`);
      console.log(`DEFAULT_VTT: (empty — uses ITT via frame extraction, sample every ${DEFAULT_VTT_SAMPLE_INTERVAL}s)\n`);
      console.log(`DEFAULT_STT:\n${DEFAULT_STT}`);
      return;
    }
    else if (flag === "--skip-normalize") { skipNormalize = true; }
    else if (flag === "--skip-stt") { skipSTT = true; }
    else if (flag === "--pick" && args[i]) {
      for (const f of args[i++].split(",")) pickSet.add(f.trim());
    }
    else if (flag === "--dry-run") { dryRun = true; }
    else if (flag.startsWith("--") && args[i]) {
      // Treat as prompt override: --prompt-name "value"
      const name = flag.slice(2);
      promptOverrides.set(name, args[i++]);
    }
  }

  if (!folder) {
    emitError("No folder specified.");
    printUsage();
    process.exit(1);
  }

  folder = resolve(folder);
  if (!existsSync(folder)) {
    emitError(`Folder not found: ${folder}`);
    process.exit(1);
  }

  // ── Load prompts ─────────────────────────────────────────────────────
  const prompts = loadPrompts(promptsFile);
  // Apply overrides
  for (const [name, value] of promptOverrides) {
    prompts.set(name, value);
  }

  emitInfo(`\n🔍 Scanning: ${folder}`);
  const { images, videos } = scanMedia(folder);
  emitInfo(`  Found ${images.length} images, ${videos.length} videos`);

  if (images.length === 0 && videos.length === 0) {
    emitWarn("No media files found.");
    return;
  }

  // ── Create .normalized directory ──────────────────────────────────────
  const normDir = join(folder, ".normalized");
  mkdirSync(normDir, { recursive: true });

  // ── Load existing results & build cache map ─────────────────────────
  const { results, cacheMap } = loadMetadata(folder);
  const cache = { ...cacheMap }; // mutable copy

  // ── Process Images ────────────────────────────────────────────────────
  for (const imgPath of images) {
    if (pickSet.size > 0 && !pickSet.has(basename(imgPath))) continue;
    const base = basename(imgPath, extname(imgPath));
    emitInfo(`\n📷 Image: ${base}`);

    // Metadata
    const meta = extractMetadata(imgPath);

    // Normalize
    let normPath = imgPath;
    if (!skipNormalize) {
      normPath = normalizeImage(imgPath, normDir);
      emitInfo(`  Normalized → ${basename(normPath)}`);
    }

    // Perception (skip if dry-run, check cache)
    let perception = {};
    let cacheKey = "";
    if (!dryRun) {
      cacheKey = perceptionCacheKey(imgPath, prompts, ittCli, null, null, context, "image");
      if (cache[cacheKey]) {
        perception = cache[cacheKey];
        emitInfo(`  (cached)`);
      } else {
        perception = analyzeImage(imgPath, normPath, prompts, ittCli, context);
        if (perception.desc) cache[cacheKey] = perception;
        emitInfo(`  ${perception.desc?.slice(0, 80)}...`);
      }
    }

    // Location enrichment
    let location = meta.location;
    if (location && !dryRun) {
      location = await enrichLocation(location);
    }

    results[base] = {
      width: meta.width,
      height: meta.height,
      created: meta.created,
      location,
      perception,
      _cache: cacheKey,
    };
    // Save after each image so progress isn't lost on crash
    writeFileSync(join(folder, "metadata.json"), JSON.stringify(results, null, 2), "utf-8");
  }

  // ── Process Videos ────────────────────────────────────────────────────
  for (const vidPath of videos) {
    if (pickSet.size > 0 && !pickSet.has(basename(vidPath))) continue;
    const base = basename(vidPath, extname(vidPath));
    emitInfo(`\n🎬 Video: ${base}`);

    // Metadata
    const meta = extractMetadata(vidPath);

    // Normalize
    let normInfo = { path: vidPath, trimmedDuration: meta.duration || 0, timeHint: "0to0" };
    if (!skipNormalize) {
      normInfo = normalizeVideo(vidPath, normDir, meta.duration);
      emitInfo(`  Normalized → ${basename(normInfo.path)} (${normInfo.timeHint}s)`);
    }

    // Perception (skip if dry-run, check cache)
    let perception = {};
    let cacheKey = "";
    if (!dryRun) {
      const stt = skipSTT ? null : sttCli;
      cacheKey = perceptionCacheKey(vidPath, prompts, null, vttCli, stt, context, "video");
      if (cache[cacheKey]) {
        perception = cache[cacheKey];
        emitInfo(`  (cached)`);
      } else {
        perception = analyzeVideo(vidPath, normInfo, normDir, prompts, vttCli, stt, context, ittCli, vttSampleInterval);
        if (perception.desc) cache[cacheKey] = perception;
      }
    }

    // Location enrichment
    let location = meta.location;
    if (location && !dryRun) {
      location = await enrichLocation(location);
    }

    results[base] = {
      width: meta.width,
      height: meta.height,
      created: meta.created,
      location,
      duration: meta.duration,
      perception,
      _cache: cacheKey,
    };
    // Save after each video so progress isn't lost on crash
    writeFileSync(join(folder, "metadata.json"), JSON.stringify(results, null, 2), "utf-8");
  }

  // ── Final summary ─────────────────────────────────────────────────────

  // Summary
  const imageCount = images.length;
  const videoCount = videos.length;
  emitInfo(`\n📊 Summary: ${imageCount} images, ${videoCount} videos analyzed`);
  for (const [name, data] of Object.entries(results)) {
    const type = videos.some(v => basename(v, extname(v)) === name) ? "🎬" : "📷";
    emitInfo(`  ${type} ${name}: ${data.width}x${data.height}${data.duration ? `, ${data.duration.toFixed(1)}s` : ""}`);
  }

  if (dryRun) {
    emitInfo("\n⚠️  Dry run — no AI models were invoked. Run without --dry-run to analyze.");
  }
}

// Allow running directly (when invoked as `node src/vision/cli.mjs <folder>`)
if (process.argv[1] && process.argv[1].includes("src/vision/cli.mjs")) {
  main(process.argv).catch((e) => {
    emitError(e.message);
    process.exit(1);
  });
}
