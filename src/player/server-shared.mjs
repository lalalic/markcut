#!/usr/bin/env node
/**
 * Shared utilities for markcut player servers.
 *
 * Extracts common code between server.mjs (edit/preview) and
 * label-server.mjs (label annotation) into one place.
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
    let offset = 0;
    for (const s of root.children) {
      if (!(s.type === "folder" || s.type === "scene" || s.children?.length)) continue;
      if (s.isBackground) continue;
      const leaf = (s.children || []).find(c => c.src && (c.type === "image" || c.type === "video"));
      const action = leaf?.actions?.[0] || s.actions?.[0] || {};
      const dur = (action.end || 5) - (action.start || 0);
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
      const action = child?.actions?.[0];
      const dur = action ? (action.end - action.start) : 5;
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
  const cacheControl = (ext === ".js" || ext === ".html") ? "no-cache" : "public, max-age=3600";
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
