#!/usr/bin/env node
/**
 * Shared utilities for the markcut player server.
 *
 * Common code used by server.mjs across all modes (preview, edit, label).
 */

import { statSync, createReadStream, readFileSync, existsSync } from "node:fs";
import { extname } from "node:path";

// ─── MIME types ──────────────────────────────────────────────────────────
export const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".vtt": "text/vtt",
  ".wasm": "application/wasm",
};

// ─── Extract scene info from compiled root ───────────────────────────────
export function extractScenes(root) {
  const scenes = [];
  let totalDuration = 0;

  // Format 1: scenes as direct children of root
  if (root.children?.length && !root.children.find(c => c.name === "scenes" || c.id === "scenes")) {
    const overlap = root.transition ? (root.transitionTime ?? 0.5) : 0;
    let offset = 0; // cumulative scene durations (without transition overlap)
    for (const s of root.children) {
      if (!(s.type === "folder" || s.type === "scene" || s.children?.length)) continue;
      if (s.isBackground) continue;
      // Compute scene duration. Priority:
      // 1. s.durationInSeconds (set by engine's getDurationInSeconds)
      // 2. Sum of children's durationInSeconds (for series) or max (for parallel)
      // 3. Leaf node's end-start (backward compat with old compiled JSON)
      // 4. Default 5s
      let dur = s.durationInSeconds;
      if (!dur || dur <= 0) {
        const kids = s.children || [];
        const childDurs = kids
          .filter(c => !c.isBackground)
          .map(c => c.durationInSeconds ?? (c.end != null ? c.end - (c.start ?? 0) : 0))
          .filter(d => d > 0);
        if (childDurs.length > 0) {
          // Series → sum; Parallel → max. We don't know which here, so sum is
          // the safe upper bound (parallel scenes are rare as direct root children).
          dur = childDurs.reduce((a, b) => a + b, 0);
        }
      }
      if (!dur || dur <= 0) {
        const leaf = (s.children || []).find(c => c.src && (c.type === "image" || c.type === "video"));
        const src2 = leaf || s;
        dur = (src2.end ?? 5) - (src2.start ?? 0);
      }
      const leaf = (s.children || []).find(c => c.src && (c.type === "image" || c.type === "video"));
      // Use the raw cumulative offset as the scene start time. Transition overlap
      // is a rendering detail — scene thumbnails seek to the raw boundary so the
      // user lands on the first frame of the intended scene, not inside a transition.
      scenes.push({
        name: s.name || s.id || "scene",
        start: offset,
        end: offset + dur,
        duration: dur,
        src: leaf?.src || "",
        mediaType: leaf?.type || "unknown",
      });
      offset += dur;
    }
    totalDuration = offset;
  }

  // Format 2: scenes wrapped in a "scenes" folder
  const scenesFolder = root.children?.find(c => c.name === "scenes" || c.id === "scenes");
  if (scenesFolder?.children && scenes.length === 0) {
    let offset = 0;
    for (const s of scenesFolder.children) {
      const child = s.children?.[0] || {};
      const dur = (child.end ?? ((child.start ?? 0) + 5)) - (child.start ?? 0);
      scenes.push({
        name: s.name,
        start: offset,
        end: offset + dur,
        duration: dur,
        src: child.src || "",
        mediaType: child.type || "unknown",
      });
      offset += dur;
    }
    totalDuration = offset;
  }

  // Format 3: flat scenes array (labels.json format)
  if (scenes.length === 0 && Array.isArray(root.scenes)) {
    let offset = 0;
    for (const s of root.scenes) {
      const dur = (s.end ?? (s.start ?? 0) + 5) - (s.start ?? 0);
      scenes.push({
        name: s.name || "scene",
        start: offset,
        end: offset + dur,
        duration: dur,
        src: s.src || "",
        mediaType: s.mediaType || "unknown",
      });
      offset += dur;
    }
    totalDuration = offset;
  }

  return { scenes, totalDuration };
}

// ─── Static file serving with range request support ──────────────────────
export function serveFile(req, res, filePath) {
  if (!existsSync(filePath) || !statSync(filePath).isFile()) return false;

  const ext = extname(filePath).toLowerCase();
  const mime = MIME[ext] || "application/octet-stream";
  const fileSize = statSync(filePath).size;
  // Dynamic authoring assets (vtt/json/html/js) must not be cached,
  // otherwise subtitle edits can appear stale after refresh.
  const noStoreExt = new Set([".js", ".html", ".json", ".vtt"]);
  const cacheControl = noStoreExt.has(ext) ? "no-store" : "public, max-age=3600";
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;
    const stream = createReadStream(filePath, { start, end });
    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunkSize,
      "Content-Type": mime,
      "Cache-Control": cacheControl,
    });
    stream.pipe(res);
  } else {
    const data = readFileSync(filePath);
    res.writeHead(200, {
      "Content-Type": mime,
      "Accept-Ranges": "bytes",
      "Content-Length": fileSize,
      "Cache-Control": cacheControl,
    });
    res.end(data);
  }
  return true;
}

// ─── Shutdown handler ────────────────────────────────────────────────────
export function handleShutdown(req, res, message = "Shutdown requested") {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ shutting_down: true }));
  console.log(`\n  🚪 ${message}\n`);
  process.exit(0);
}
