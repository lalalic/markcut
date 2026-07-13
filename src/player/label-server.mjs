#!/usr/bin/env node
/**
 * Label preview server — player for scene labeling.
 *
 * Usage:
 *   node src/player/label-server.mjs <input.json|.md> [--port 3031]
 *
 * Supports compiled stream trees, descriptive JSON, and markdown.
 * Labels are saved to labels.json alongside the source.
 */
import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isDescriptiveRoot, resolveAndCompile, resolveAndCompileMarkdown } from "./pipeline.mjs";
import { extractScenes, MIME, serveFile, handleShutdown } from "./server-shared.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
const PORT = parseInt(process.argv.find(a => a.startsWith("--port="))?.split("=")[1] || "3031", 10);

// Determine source: JSON or MD file (3rd+ arg, skip --flags)
const sourceArg = process.argv.slice(2).find(a => !a.startsWith("--"));
const SOURCE = sourceArg ? resolve(sourceArg) : resolve(".");
const IS_MARKDOWN = SOURCE.endsWith(".md");

// ─── extractScenes imported from ./server-shared.mjs ────────────────────

// ─── Load + compile (handles compiled JSON, descriptive JSON, markdown) ──
async function loadSource() {
  const raw = readFileSync(SOURCE, "utf-8");

  if (IS_MARKDOWN) {
    console.log("  📝 Detected markdown — parsing + compiling...");
    return await resolveAndCompileMarkdown(raw, {
      baseDir: dirname(SOURCE),
    });
  }

  const parsed = JSON.parse(raw);
  const root = parsed.root || parsed;

  if (isDescriptiveRoot(root)) {
    console.log("  🔍 Detected descriptive JSON — running pipeline...");
    return await resolveAndCompile(root, {
      baseDir: dirname(SOURCE),
    });
  }

  return root;
}

// ─── Scene parsing ─────────────────────────────────────────────────────
let scenes = [];
let totalDuration = 0;
let videoData = null;
const LABELS_PATH = join(dirname(SOURCE), "labels.json");
/** Promise that resolves when the initial pipeline (TTS, STT, media) completes */
let bootstrap = Promise.resolve();

if (existsSync(SOURCE)) {
  try {
    // async bootstrap — we inline the promise since the server starts synchronously
    bootstrap = loadSource().then((compiled) => {
      videoData = compiled;
      const extracted = extractScenes(compiled);
      scenes = extracted.scenes;
      totalDuration = extracted.totalDuration;

      // If only scenes metadata (no compiled tree from labels.json), build a player tree
      if (scenes.length > 0 && (!videoData.type || videoData.type !== "root")) {
        videoData = {
          id: "root",
          type: "root",
          width: 1080,
          height: 1920,
          fps: 30,
          isSeries: true,
          transition: "fade",
          theme: "cinematic",
          children: scenes.map((s, i) => ({
            id: s.name || ("scene-" + (i+1)),
            name: s.name || ("scene-" + (i+1)),
            type: "folder",
            isSeries: false,
            children: [{
              id: (s.name || "scene-"+(i+1)) + "-media",
              type: s.mediaType === "video" ? "video" : "image",
              src: s.src,
              fit: "cover",
              actions: [{ start: 0, end: s.duration }],
            }],
          })),
        };
      }

      // Merge existing labels from labels.json into videoData
      try {
        const labelsRaw = readFileSync(LABELS_PATH, "utf-8");
        const labelsData = JSON.parse(labelsRaw);
        const labelsRoot = labelsData.root || labelsData;
        if (labelsRoot.children) {
          for (let i = 0; i < Math.min(labelsRoot.children.length, videoData.children.length); i++) {
            const labelMedia = labelsRoot.children[i]?.children?.[0];
            const targetMedia = videoData.children[i]?.children?.[0];
            if (labelMedia && targetMedia && labelMedia.description) {
              targetMedia.description = labelMedia.description;
            }
          }
        }
      } catch {
        // No existing labels file — that's fine
      }
    }).catch(e => {
      console.error("Failed to load source:", e.message);
      // Fallback: minimal data so the server starts
      videoData = { id: "root", type: "root", width: 1080, height: 1920, fps: 30, isSeries: false, children: [] };
    });
  } catch (e) {
    console.error("Warning: could not parse source:", e.message);
  }
} else {
  console.error(`Source not found: ${SOURCE}`);
  process.exit(1);
}
// ─── MIME imported from ./server-shared.mjs ──────────────────────────────

// ─── HTML page ─────────────────────────────────────────────────────────
function getHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Label Preview</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; overflow: hidden; background: #0a0a0a; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; flex-direction: column; align-items: center; }
  #header { display: flex; align-items: center; justify-content: flex-end; width: 100%; max-width: 500px; padding: 8px 12px; flex-shrink: 0; gap: 8px; }
  #scene-info { font-size: 11px; color: rgba(255,255,255,.4); flex: 1; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #close-btn { width: 22px; height: 22px; border-radius: 50%; border: 1px solid rgba(255,255,255,.15); background: rgba(0,0,0,.3); color: rgba(255,255,255,.4); font-size: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all .15s; }
  #close-btn:hover { background: rgba(255,60,60,.4); border-color: rgba(255,60,60,.5); color: #fff; }
  #player-frame { flex: 1; width: 100%; max-width: 480px; min-height: 0; border-radius: 16px; overflow: hidden; border: 1px solid rgba(255,255,255,.08); background: #000; box-shadow: 0 4px 40px rgba(0,0,0,.6); margin: 0 12px; }
  #root { width: 100%; height: 100%; }
  #thumbnails { display: flex; gap: 6px; width: 100%; max-width: 500px; padding: 4px 12px; flex-shrink: 0; overflow-x: auto; scrollbar-width: thin; }
  #thumbnails::-webkit-scrollbar { height: 4px; }
  #thumbnails::-webkit-scrollbar-thumb { background: rgba(255,255,255,.15); border-radius: 2px; }
  .thumb-item { flex-shrink: 0; width: 64px; height: 48px; border-radius: 6px; overflow: hidden; cursor: pointer; border: 2px solid transparent; transition: all .15s; position: relative; background: rgba(255,255,255,.05); }
  .thumb-item:hover { border-color: rgba(74,158,255,.4); }
  .thumb-item.active { border-color: #4a9eff; box-shadow: 0 0 8px rgba(74,158,255,.3); }
  .thumb-item img { width: 100%; height: 100%; object-fit: cover; }
  .thumb-item .thumb-badge { position: absolute; top: 2px; right: 2px; width: 10px; height: 10px; border-radius: 50%; background: #4ade80; border: 1px solid rgba(0,0,0,.4); display: none; }
  .thumb-item .thumb-badge.has-label { display: block; }
  #bottom-bar { display: flex; gap: 6px; align-items: center; width: 100%; max-width: 500px; padding: 8px 12px; flex-shrink: 0; }
  #label-input { flex: 1; padding: 8px 12px; border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.05); color: #eee; border-radius: 8px; font-size: 13px; outline: none; transition: border-color .15s; }
  #label-input:focus { border-color: rgba(74,158,255,.5); }
  #label-input::placeholder { color: rgba(255,255,255,.25); }
  #label-btn { width: 32px; height: 32px; padding: 0; background: rgba(255,255,255,.06); color: rgba(255,255,255,.5); border: 1px solid rgba(255,255,255,.1); border-radius: 8px; cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center; transition: all .15s; flex-shrink: 0; }
  #label-btn:hover { background: rgba(74,158,255,.2); border-color: rgba(74,158,255,.4); color: #4a9eff; }
  #label-btn:disabled { opacity: 0.3; cursor: wait; }
  #saved-toast { position: fixed; bottom: 70px; left: 50%; transform: translateX(-50%); background: rgba(74,222,128,.9); color: #fff; padding: 8px 16px; border-radius: 8px; font-size: 12px; font-weight: 500; opacity: 0; transition: opacity .3s; pointer-events: none; z-index: 200; backdrop-filter: blur(8px); }
  #saved-toast.show { opacity: 1; }
</style>
</head>
<body>
<div id="header">
  <span id="scene-info"></span>
  <div id="header-actions">
    <button id="close-btn" title="Close">✕</button>
  </div>
</div>
<div id="player-frame">
  <div id="root"></div>
</div>
<div id="thumbnails"></div>
<div id="saved-toast">✓ Label saved</div>
<div id="bottom-bar">
  <input id="label-input" placeholder="Add label for current scene…" />
  <button id="label-btn" title="Save label">&#x1F4DD;</button>
</div>
<script src="/player.js" type="module"></script>
<script>
// ─── Close button ─────────────────────────────────────────────────────
document.getElementById("close-btn")?.addEventListener("click", () => {
  navigator.sendBeacon("/api/shutdown", "{}");
  document.body.innerHTML = "<div style='display:flex;align-items:center;justify-content:center;height:100vh;background:#0a0a0a;color:#555;font-family:sans-serif;font-size:16px'>\\u2B61 player closed</div>";
});

// ─── State ────────────────────────────────────────────────────────────
// labelDescriptions maps sceneIndex → description text (from stream tree)
var labelDescriptions = {};
var currentTime = 0;
var currentSceneIndex = 0;
var selectedSceneOverride = -1;
var labelInput = document.getElementById("label-input");
var labelBtn = document.getElementById("label-btn");
var savedToast = document.getElementById("saved-toast");
var sceneInfo = document.getElementById("scene-info");
var cachedInfo = null;

// ─── Load existing labels from stream tree ───────────────────────────
fetch("/api/labels").then(function(r) {
  if (r.ok) return r.json();
  return null;
}).then(function(tree) {
  if (tree) {
    var root = tree.root || tree;
    var children = root.children || [];
    for (var i = 0; i < children.length; i++) {
      var media = (children[i].children || [])[0];
      if (media && media.description) {
        labelDescriptions[i] = media.description;
      }
    }
  }
  loadSceneInfo();
}).catch(function() {});

// ─── Scene info & thumbnails ─────────────────────────────────────────
function loadSceneInfo(refresh) {
  if (cachedInfo && !refresh) {
    updateSceneInfo(cachedInfo);
    return;
  }
  fetch("/api/video-info").then(function(r) { return r.json(); }).then(function(info) {
    if (info.scenes && info.totalDuration) {
      cachedInfo = info;
      updateSceneInfo(info);
    }
  }).catch(function() {
    if (cachedInfo) updateSceneInfo(cachedInfo);
  });
}

function updateSceneInfo(info) {
  if (!sceneInfo) return;
  var scenes = info.scenes || [];
  var prevIndex = currentSceneIndex;
  if (selectedSceneOverride >= 0) {
    var selScene = scenes[selectedSceneOverride];
    if (selScene) {
      currentSceneIndex = selectedSceneOverride;
      sceneInfo.textContent = selScene.name + " (selected)";
      if (prevIndex !== currentSceneIndex) updateLabelInput();
      renderThumbnails(info);
      return;
    }
  }
  var currentScene = null;
  for (var i = 0; i < scenes.length; i++) {
    if (currentTime >= scenes[i].start && currentTime < scenes[i].end) {
      currentScene = scenes[i];
      currentSceneIndex = i;
      break;
    }
  }
  if (currentScene) {
    sceneInfo.textContent = currentScene.name + " (" + currentTime.toFixed(1) + "s)";
  } else {
    sceneInfo.textContent = currentTime.toFixed(1) + "s";
  }
  if (prevIndex !== currentSceneIndex) updateLabelInput();
  renderThumbnails(info);
}

function renderThumbnails(info) {
  var container = document.getElementById("thumbnails");
  if (!container) return;
  var scenes = info.scenes || [];
  var html = "";
  var isVideoExt = {".mov":1,".mp4":1,".avi":1,".mkv":1,".webm":1,".m4v":1,".wmv":1};
  for (var i = 0; i < scenes.length; i++) {
    var s = scenes[i];
    var isActive = i === currentSceneIndex ? " active" : "";
    var hasLabel = labelDescriptions[i] ? " has-label" : "";
    var thumbSrc = s.src || "";
    var ext = thumbSrc.substring(thumbSrc.lastIndexOf(".")).toLowerCase();
    var isVideo = isVideoExt[ext] || false;
    var img;
    if (thumbSrc && !isVideo) {
      img = "<img src='" + thumbSrc + "' alt='' loading='lazy' />";
    } else if (thumbSrc && isVideo) {
      // Use video element that auto-seeks to first frame as poster
      img = "<video src='" + thumbSrc + "' muted preload='metadata' style='width:100%;height:100%;object-fit:cover'></video>";
    } else {
      img = "<div style='width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.08);color:rgba(255,255,255,.3);font-size:16px;font-weight:600'>" + (s.name || "S" + (i+1)).slice(0,2).toUpperCase() + "</div>";
    }
    html += "<div class='thumb-item" + isActive + "' data-index='" + i + "'>"
      + img
      + "<div class='thumb-badge" + hasLabel + "'></div>"
      + "</div>";
  }
  container.innerHTML = html;
}

// ─── Helper: populate input with current scene's label ───────────────
function updateLabelInput() {
  var label = labelDescriptions[currentSceneIndex];
  if (labelInput) {
    labelInput.value = label || "";
  }
}

// ─── Thumbnail click delegation ──────────────────────────────────────
document.getElementById("thumbnails")?.addEventListener("click", function(e) {
  var item = e.target.closest(".thumb-item");
  if (item) {
    var index = parseInt(item.getAttribute("data-index"), 10);
    if (!isNaN(index)) seekToScene(index);
  }
});

// ─── Seek to scene via player API ────────────────────────────────────
function seekToScene(index) {
  selectedSceneOverride = index;
  currentSceneIndex = index;
  updateLabelInput();
  loadSceneInfo();
  // Seek player using exposed API
  fetch("/api/video-info").then(function(r) { return r.json(); }).then(function(info) {
    var scene = (info.scenes || [])[index];
    if (scene && window.__remotionSeekTo) {
      window.__remotionSeekTo(scene.start);
    }
  }).catch(function() {});
}

// ─── Poll player time ────────────────────────────────────────────────
setInterval(function() {
  var playerText = document.getElementById("player-frame")?.textContent || "";
  var match = playerText.match(/(\\d+):(\\d+)\\s*\\//);
  if (match) {
    var prevTime = currentTime;
    currentTime = parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
    if (prevTime !== currentTime && prevTime > 0 && selectedSceneOverride >= 0) {
      selectedSceneOverride = -1;
    }
  }
  loadSceneInfo();
}, 1000);

// ─── Label save ──────────────────────────────────────────────────────
function showSavedToast() {
  savedToast?.classList.add("show");
  setTimeout(function() { savedToast?.classList.remove("show"); }, 2000);
}

function saveLabel() {
  var text = labelInput.value.trim();
  if (!text) return;
  labelBtn.disabled = true;

  var sceneIndex = currentSceneIndex;

  // Update local state
  labelDescriptions[sceneIndex] = text;

  fetch("/api/labels", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sceneIndex: sceneIndex,
      description: text,
      time: parseFloat(currentTime.toFixed(3)),
    }),
  }).then(function(res) {
    if (res.ok) {
      labelInput.value = "";
      showSavedToast();
      loadSceneInfo();
    }
  }).catch(function(e) {
    console.error("Failed to save label:", e);
  }).finally(function() {
    labelBtn.disabled = false;
  });
}

labelBtn?.addEventListener("click", saveLabel);
labelInput?.addEventListener("keydown", function(e) {
  if (e.key === "Enter") { e.preventDefault(); saveLabel(); }
});
</script>
</body>
</html>`;
}

// ─── HTTP Server ──────────────────────────────────────────────────────────
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const path = url.pathname;

  try {
    // API: Load/save labels
    if (path === "/api/labels") {
      if (req.method === "GET") {
        // Return the stream tree — descriptions on children are the labels
        let body;
        try {
          body = readFileSync(LABELS_PATH, "utf-8");
          // Validate it's a stream tree; if not, fall back
          const parsed = JSON.parse(body);
          if (!parsed.type && !parsed.root) throw new Error("not a stream tree");
        } catch {
          // Return current videoData (without descriptions) as the label tree
          body = JSON.stringify(videoData);
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(body);
        return;
      }
      if (req.method === "POST") {
        let body = "";
        req.on("data", c => body += c);
        req.on("end", () => {
          try {
            const data = JSON.parse(body);
            // data is { sceneIndex, description, time? } — merge into videoData
            const { sceneIndex, description, time } = data;
            if (typeof sceneIndex === "number" && typeof description === "string") {
              const child = videoData?.children?.[sceneIndex];
              const media = child?.children?.[0];
              if (media) {
                media.description = description || undefined;
                // Store the timestamp when this label was captured
                if (typeof time === "number") {
                  media.labeledAt = time;
                }
              }
            }
            // Save the full stream tree to labels.json
            writeFileSync(LABELS_PATH, JSON.stringify(videoData, null, 2), "utf-8");
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ saved: true }));
          } catch (e) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: e.message }));
          }
        });
        return;
      }
    }

    // API: Video data for player
    if (path === "/api/video-data") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(videoData));
      return;
    }

    // API: Scene info
    if (path === "/api/video-info") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ scenes, totalDuration, mode: { label: true } }));
      return;
    }

    // API: Shutdown
    if (path === "/api/shutdown") {
      handleShutdown(req, res, "Shutdown requested");
      return;
    }

    // Serve player bundle
    if (path === "/player.js") {
      const bundlePath = join(ROOT, "src", "player", "bundle", "player.js");
      if (existsSync(bundlePath)) {
        const data = readFileSync(bundlePath);
        res.writeHead(200, { "Content-Type": "text/javascript", "Cache-Control": "no-cache" });
        res.end(data);
        return;
      }
    }

    // Serve static files
    if (path === "/" || path === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(getHtml());
      return;
    }

    // Serve from public/ (with range request support for video/audio)
    const publicPath = join(ROOT, "public", path);
    if (serveFile(req, res, publicPath)) return;

    // Fallback: serve from the source file's directory (for media files referenced in preview)
    if (SOURCE !== "." && existsSync(SOURCE)) {
      const mediaPath = join(dirname(SOURCE), path);
      if (serveFile(req, res, mediaPath)) return;
    }

    res.writeHead(404);
    res.end("Not found");
  } catch (err) {
    try {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Server error: " + err.message);
    } catch (e2) {
      console.error("Request error:", path, err.message);
    }
  }
});

server.listen(PORT, async () => {
  // Wait for initial pipeline to fully resolve before announcing ready
  try {
    await bootstrap;
  } catch {
    // Pipeline failed — still announce ready
  }
  console.log(`\n🏷️  Label Preview at http://localhost:${PORT}`);
  console.log(`   Source: 📄 ${SOURCE}`);
  console.log(`   Scenes: ${scenes.length}`);
  console.log(`   Labels: ${LABELS_PATH}`);
  console.log("");
});
