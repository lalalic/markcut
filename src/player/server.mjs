#!/usr/bin/env node
/**
 * Custom player server for markcut.
 *
 * Modes:
 *   --label   – playback with label input overlay; labels map to media timestamps
 *   --edit    – auto-reload when the JSON file changes (agent edits file, player refreshes)
 *
 * Usage:
 *   node src/player/server.mjs <video.json> [--label] [--edit] [--port 3001]
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, writeFileSync, watchFile, existsSync, statSync, createReadStream } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isDescriptiveRoot, resolveAndCompile, resolveAndCompileMarkdown, parseImportsBlock } from "./pipeline.mjs";
import { bundleFromEntries } from "./bundler.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
const PORT = parseInt(process.argv.find(a => a.startsWith("--port="))?.split("=")[1] || process.argv[process.argv.indexOf("--port") + 1] || "3001", 10);

// Find video input path (.json or .md)
const inputArg = process.argv.find(a => (a.endsWith(".json") || a.endsWith(".md")) && !a.startsWith("--"));
const VIDEO_JSON = inputArg ? resolve(inputArg) : join(ROOT, "video.json");
const IS_MARKDOWN = VIDEO_JSON.endsWith(".md");
const MODE_LABEL = process.argv.includes("--label");
const MODE_EDIT = process.argv.includes("--edit");

// ─── SSE clients for reload notifications ────────────────────────────────
const sseClients = new Set();
let shutdownTimer = null;

// ─── Label store for label mode ───────────────────────────────────────────
let labels = [];

// ─── Edit history for context ─────────────────────────────────────────────
let editHistory = [];

// ─── TTS/STT output directory (relative to video.json) ────────────────────
const TTS_OUTPUT_DIR = join(dirname(VIDEO_JSON), "assets", "tts");
const WHISPER_BIN = process.env.WHISPER_BIN || "/Users/lir/Library/Python/3.9/bin/whisper";

// ─── Extract scene info from compiled root ───────────────────────────────
function extractScenes(root) {
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

  return { scenes, totalDuration };
}

// ─── Compiled root cache (avoids re-running pipeline on every fetch) ─────
let compiledRootCache = null;
let compiledRootIsDescriptive = false;
let pipelineRunning = false;

/**
 * Read the input file (.json or .md), detect format, run pipeline,
 * bundle any component imports, extract scenes. Caches the result.
 */
async function loadCompiledRoot() {
  if (compiledRootCache) return compiledRootCache;

  const raw = readFileSync(VIDEO_JSON, "utf-8");
  let compiled;

  if (IS_MARKDOWN) {
    // Markdown → descriptive root → compiled stream tree
    console.log("  📝 Detected markdown input — parsing + running pipeline...");
    compiled = await resolveAndCompileMarkdown(raw, {
      baseDir: dirname(VIDEO_JSON),
      scriptOutputDir: TTS_OUTPUT_DIR,
      whisperBin: existsSync(WHISPER_BIN) ? WHISPER_BIN : undefined,
    });
    compiledRootIsDescriptive = true;
  } else {
    const parsed = JSON.parse(raw);
    const root = parsed.root || parsed;

    if (isDescriptiveRoot(root)) {
      compiledRootIsDescriptive = true;
      console.log("  🔍 Detected descriptive JSON — running resolve + compile pipeline...");
      compiled = await resolveAndCompile(root, {
        baseDir: dirname(VIDEO_JSON),
        scriptOutputDir: TTS_OUTPUT_DIR,
        whisperBin: existsSync(WHISPER_BIN) ? WHISPER_BIN : undefined,
      });
    } else {
      compiledRootIsDescriptive = false;
      compiled = root;
    }
  }

  // Bundle component imports if any exist
  try {
    let importEntries = null;

    if (IS_MARKDOWN) {
      // For markdown: extract the imports block from the raw source
      const importsBlockMatch = raw.match(/(?:```|~~~)(?:js|javascript)\s+imports\s*\n([\s\S]*?)(?:```|~~~)/i);
      if (importsBlockMatch) {
        importEntries = parseImportsBlock(importsBlockMatch[1]);
      }
    } else if (compiledRootIsDescriptive) {
      // For descriptive JSON: extract imports from the parsed root directly
      // (before compilation, the root has an `imports` array and optional `importsBlock`)
      const parsedRoot = JSON.parse(raw).root || JSON.parse(raw);
      if (parsedRoot.imports) {
        importEntries = parsedRoot.imports;
      } else if (parsedRoot.importsBlock) {
        importEntries = parseImportsBlock(parsedRoot.importsBlock);
      }
    }

    if (importEntries && importEntries.length > 0) {
      const bundle = await bundleFromEntries(importEntries);
      if (bundle.url) {
        compiled.imports = bundle.url;
        console.log(`  ✅ Component bundle: ${bundle.url} (${bundle.exports.join(", ")})`);
      }
    }
  } catch (e) {
    console.error("  ⚠️  Component bundling failed:", e.message);
    // Continue without bundled components — JSX will fail gracefully
  }

  compiledRootCache = compiled;
  return compiled;
}

// ─── Initial scene info ──────────────────────────────────────────────────
let scenes = [];
let totalDuration = 0;

async function initScenes() {
  try {
    const root = await loadCompiledRoot();
    const extracted = extractScenes(root);
    scenes = extracted.scenes;
    totalDuration = extracted.totalDuration;
  } catch (e) {
    console.error("Warning: could not parse video.json for scene info:", e.message);
  }
}

// Fire and forget — scenes get populated asynchronously
initScenes();

// ─── Watch file for changes (--edit mode) ───────────────────────────────
if (MODE_EDIT) {
  let lastContent = readFileSync(VIDEO_JSON, "utf-8");
  watchFile(VIDEO_JSON, { interval: 1000 }, async (curr, prev) => {
    if (curr.mtimeMs === prev.mtimeMs) return;
    if (pipelineRunning) return;
    // Check if content actually changed (avoids false triggers from TTS or metadata updates)
    const newContent = readFileSync(VIDEO_JSON, "utf-8");
    if (newContent === lastContent) return;
    lastContent = newContent;
    pipelineRunning = true;
    console.log(`  📁 ${VIDEO_JSON} changed, re-running pipeline...`);

    try {
      // Invalidate cache so loadCompiledRoot re-reads the file
      compiledRootCache = null;
      const root = await loadCompiledRoot();
      const extracted = extractScenes(root);
      scenes = extracted.scenes;
      totalDuration = extracted.totalDuration;

      for (const client of sseClients) {
        client.write("data: " + JSON.stringify({ type: "reload", scenes, totalDuration }) + "\n\n");
      }
    } catch (e) {
      console.error("  ⚠️  Failed to re-process after change:", e.message);
    } finally {
      pipelineRunning = false;
    }
  });
}
// ─── MIME types ──────────────────────────────────────────────────────────
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".vtt": "text/vtt",
  ".wasm": "application/wasm",
};

// ─── Resolve asset path ──────────────────────────────────────────────────
function resolveAsset(urlPath) {
  if (urlPath === "/") return join(ROOT, "src", "player", "index.html");
  // Bundle dir for the Remotion Player
  if (urlPath === "/player.js") return join(ROOT, "src", "player", "bundle", "player.js");
  // Serve from ROOT/public, ROOT, or relative to the video.json directory
  const jsonDir = dirname(VIDEO_JSON);
  const candidates = [
    join(ROOT, "public", urlPath),
    join(ROOT, urlPath),
    join(jsonDir, urlPath),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

// ─── HTML page ───────────────────────────────────────────────────────────
function getHtml() {
  const hasLabel = MODE_LABEL ? "true" : "false";
  const hasWatch = MODE_EDIT ? "true" : "false";
  const title = MODE_LABEL ? " — Label" : MODE_EDIT ? " — Edit" : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Remotion Player${title}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; overflow: hidden; background: #0a0a0a; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; flex-direction: column; align-items: center; }
  #header { display: flex; align-items: center; justify-content: flex-end; width: 100%; max-width: 500px; padding: 8px 12px; flex-shrink: 0; gap: 8px; }
  #header-status { font-size: 11px; color: rgba(255,255,255,.4); flex: 1; text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #header-actions { display: flex; gap: 6px; align-items: center; flex-shrink: 0; }
  #close-btn { width: 22px; height: 22px; border-radius: 50%; border: 1px solid rgba(255,255,255,.15); background: rgba(0,0,0,.3); color: rgba(255,255,255,.4); font-size: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all .15s; }
  #close-btn:hover { background: rgba(255,60,60,.4); border-color: rgba(255,60,60,.5); color: #fff; }
  #player-frame { flex: 1; width: 100%; max-width: 480px; min-height: 0; border-radius: 16px; overflow: hidden; border: 1px solid rgba(255,255,255,.08); background: #000; box-shadow: 0 4px 40px rgba(0,0,0,.6); margin: 0 12px; }
  #root { width: 100%; height: 100%; }
  #reload-toast { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(74,158,255,.9); color: #fff; padding: 12px 24px; border-radius: 10px; font-size: 14px; font-weight: 600; opacity: 0; transition: opacity .3s; pointer-events: none; z-index: 200; backdrop-filter: blur(8px); }
  #reload-toast.show { opacity: 1; }
  #bottom-bar { display: flex; gap: 6px; align-items: center; width: 100%; max-width: 500px; padding: 8px 12px; flex-shrink: 0; }
  #edit-input { flex: 1; padding: 8px 12px; border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.05); color: #eee; border-radius: 8px; font-size: 13px; outline: none; transition: border-color .15s; }
  #edit-input:focus { border-color: rgba(74,158,255,.5); }
  #edit-input::placeholder { color: rgba(255,255,255,.25); }
  #edit-btn { width: 32px; height: 32px; padding: 0; background: rgba(255,255,255,.06); color: rgba(255,255,255,.5); border: 1px solid rgba(255,255,255,.1); border-radius: 8px; cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center; transition: all .15s; flex-shrink: 0; }
  #edit-btn:hover { background: rgba(74,158,255,.2); border-color: rgba(74,158,255,.4); color: #4a9eff; }
  #edit-btn:disabled { opacity: 0.3; cursor: wait; }
</style>
</head>
<body>
${MODE_EDIT ? `<div id="header">
  <span id="header-status"></span>
  <div id="header-actions">
    <button id="close-btn" title="Close player and return to terminal">✕</button>
  </div>
</div>` : ""}
<div id="player-frame">
  <div id="root"></div>
</div>
<div id="reload-toast">🔄 JSON changed — reloading...</div>
${MODE_EDIT ? `<div id="bottom-bar">
  <input id="edit-input" placeholder="What should change? e.g. make text bigger" />
  <button id="edit-btn" title="Apply edit">&#x2728;</button>
</div>` : ""}
<script src="/player.js" type="module"></script>
${MODE_EDIT ? `<script>
// ─── SSE reload ───────────────────────────────────────────────────────
const evtSource = new EventSource("/api/events");
evtSource.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === "reload" && !suppressReload) {
    window.dispatchEvent(new Event("refresh-player"));
  }
};

// ─── Close button ─────────────────────────────────────────────────────
document.getElementById("close-btn")?.addEventListener("click", () => {
  navigator.sendBeacon("/api/shutdown", "{}");
  document.body.innerHTML = "<div style='display:flex;align-items:center;justify-content:center;height:100vh;background:#0a0a0a;color:#555;font-family:sans-serif;font-size:16px'>\u2B61 player closed \u2014 return to terminal</div>";
});

// ─── Edit input ───────────────────────────────────────────────────────
const editInput = document.getElementById("edit-input");
const editBtn = document.getElementById("edit-btn");
const headerStatus = document.getElementById("header-status");

// Suppress SSE auto-reload during edits — we reload ourselves
let suppressReload = false;

async function applyEdit() {
  const text = editInput.value.trim();
  if (!text) return;
  editBtn.disabled = true;
  headerStatus.textContent = "\u231B editing...";
  editInput.value = "";
  suppressReload = true;
  try {
    const res = await fetch("/api/edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    if (res.ok) {
      const summary = (data.output || "done").split("\\n")[0].slice(0, 65);
      headerStatus.textContent = summary;
      // Refresh player in-place so timeline playback continues
      setTimeout(() => { suppressReload = false; window.dispatchEvent(new Event("refresh-player")); }, 4000);
    } else {
      headerStatus.textContent = "\u274C " + (data.error || "failed");
      suppressReload = false;
    }
  } catch (e) {
    headerStatus.textContent = "\u274C error";
    suppressReload = false;
  }
  editBtn.disabled = false;
}

editBtn?.addEventListener("click", applyEdit);
editInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); applyEdit(); }
});
</script>` : ""}

</body>
</html>`;
}

// ─── HTTP Server ──────────────────────────────────────────────────────────
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const path = url.pathname;

  try {
    // API: Get or save labels (label mode)
    if (path === "/api/labels") {
      const labelsPath = join(dirname(VIDEO_JSON), "labels.json");
      if (req.method === "GET") {
        try {
          const data = readFileSync(labelsPath, "utf-8");
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(data);
        } catch (e) {
          // No labels file yet
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ labels: [], scenes: [] }));
        }
        return;
      }
      if (req.method === "POST") {
        let body = "";
        req.on("data", c => body += c);
        req.on("end", () => {
          try {
            writeFileSync(labelsPath, body, "utf-8");
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ saved: true, path: labelsPath }));
          } catch (e) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: e.message }));
          }
        });
        return;
      }
    }

    // API: Shutdown — kill the server, return control to terminal
    if (path === "/api/shutdown") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ shutting_down: true }));
      console.log("\n  🚪 Close requested from browser — shutting down\n");
      process.exit(0);
      return;
    }

    // API: Feedback from user — printed to stdout AND saved to feedback.txt
    // Agent can read feedback.txt or tail the log
    if (path === "/api/feedback" && req.method === "POST") {
      let body = "";
      req.on("data", c => body += c);
      req.on("end", () => {
        try {
          const { text } = JSON.parse(body);
          const line = `[${new Date().toISOString()}] ${text}`;
          console.log(`\n  💬 USER FEEDBACK: ${text}\n`);
          try { writeFileSync(join(dirname(VIDEO_JSON), "feedback.txt"), line + "\n", { flag: "a" }); } catch {}
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ received: true }));
        } catch (e) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    // API: Edit — call pi one-shot to edit the JSON, player auto-reloads
    if (path === "/api/edit" && req.method === "POST") {
      let body = "";
      req.on("data", c => body += c);
      req.on("end", () => {
        try {
          const { text } = JSON.parse(body);
          if (!text) { res.writeHead(400); res.end(JSON.stringify({ error: "empty text" })); return; }

          editHistory.push(text);

          // Build tree structure description from current JSON (recursive, any depth)
          let treeInfo = "";
          try {
            const raw = readFileSync(VIDEO_JSON, "utf-8");
            const parsed = JSON.parse(raw);
            const root = parsed.root || parsed;

            function describeNode(node, depth) {
              const indent = "  ".repeat(depth);
              const id = node.id || "";
              const name = node.name || "";
              const label = name || id;
              const type = node.type || "unknown";
              const dur = node.durationInSeconds !== undefined ? `, ${node.durationInSeconds}s` : "";

              let line = `${indent}${type} "${label}"`;

              if (type === "root") {
                line += ` (${node.width}x${node.height}, ${node.fps}fps${node.isSeries ? ", series" : ""}${node.transition ? `, transition:${node.transition}` : ""}${node.theme ? `, theme:${node.theme}` : ""})`;
              } else if (type === "folder") {
                line += ` (${node.isSeries ? "series" : "parallel"}${node.transition ? `, transition:${node.transition}` : ""}${dur})`;
              } else if (type === "component") {
                const props = node.props ? JSON.stringify(Object.fromEntries(Object.entries(node.props).filter(([k]) => !k.startsWith("_")))) : "{}";
                line += ` ${node.componentName}(${props.slice(0, 100)})${dur}`;
              } else if (type === "subtitle") {
                const txt = (node.src || "").slice(0, 60);
                line += ` "${txt}"${dur}`;
              } else if (type === "video" || type === "audio" || type === "image") {
                const src = (node.src || "").slice(0, 50);
                line += ` "${src}"${dur}`;
              } else if (type === "effect") {
                line += ` animation:${node.animation || "custom"}${dur}`;
              } else if (type === "rhythm") {
                line += ` src:"${(node.src || "").slice(0, 40)}"${dur}`;
              } else if (type === "map") {
                line += ` waypoints:${(node.waypoints || []).length}${dur}`;
              } else if (type === "include") {
                line += ` src:"${(node.src || "").slice(0, 50)}"${dur}`;
              }

              // Add timing info for leaf actions
              if (node.actions && node.actions.length > 0) {
                const act = node.actions[0];
                line += ` [${act.start}→${act.end}s`;
                if (node.isBackground) line += ", bg";
                if (act.volume !== undefined) line += `, vol:${act.volume}`;
                if (act.style) line += `, style:"${act.style.slice(0, 40)}"`;
                if (act.loop) line += `, loop:${act.loop}`;
                line += `]`;
              } else if (node.isBackground) {
                line += ` [bg]`;
              }

              // Add notable fields
              const extras = [];
              if (node.componentName) extras.push(node.componentName);
              if (node.fit) extras.push(`fit:${node.fit}`);
              if (node.fontSize) extras.push(`fontSize:${node.fontSize}`);
              if (node.volume !== undefined && type !== "root") extras.push(`vol:${node.volume}`);
              if (node.playbackRate) extras.push(`rate:${node.playbackRate}`);
              if (node.style) extras.push(`style:"${node.style.slice(0, 40)}"`);
              if (node.transitionTime !== undefined) extras.push(`transTime:${node.transitionTime}`);
              if (node.visible === false) extras.push("hidden");
              if (extras.length > 0) line += ` {${extras.join(", ")}}`;

              return line;
            }

            function walkTree(node, depth = 0) {
              const lines = [describeNode(node, depth)];
              if (node.children && node.children.length > 0) {
                const shown = node.children.filter(c => c.visible !== false || c.visible === undefined);
                for (const child of shown) {
                  lines.push(...walkTree(child, depth + 1));
                }
              }
              return lines;
            }

            treeInfo = walkTree(root).join("\n");
          } catch {}

          const historyStr = editHistory.length > 1
            ? "\nPrevious edits on this file (in order):\n" + editHistory.slice(0, -1).map((e, i) => `${i+1}. ${e}`).join("\n") + "\n"
            : "";

          const prompt = `You are editing ${VIDEO_JSON.split("/").pop()}, a Remotion stream tree JSON.

The stream tree (indentation shows nesting; timing in seconds):
${treeInfo || "(could not read tree)"}
${historyStr}
Edit request: ${text}

--- Knowledge ---
You can edit ANY field on ANY node in the JSON. Common fields across all types:
  - id, name, type, style (inline CSS string), visible (boolean)

Stream types:
  root: {width, height, fps, isSeries, transition, transitionTime, theme, stylesheet, children}
  folder: {isSeries (parallel if false), transition, transitionTime, children}
  video: {src, volume, playbackRate, width, height, actions}
  audio: {src, volume, foreground (ducks parent video), actions}
  image: {src, fit (contain/cover/fill), actions}
  subtitle: {src (text or VTT), cues[], fontSize, fontStyle, style, actions}
  component: {componentName, props:{}, src (remote URL), actions}
  effect: {animation (builtin name or "custom"), animationTimingFunction, animationIterationCount, customKeyframes, children, actions}
  rhythm: {src (audio), volume, spots[] (beat timestamps), children, actions}
  map: {waypoints[{lat,lng,label?,media?}], routeColor, routeWeight, markerSrc, zoom, actions}
  include: src (video JSON file path/URL), volume, actions — embeds an external video composition referenced by src. Falls back to inline children (legacy).

Actions (on leaf types): [{start, end, style?, volume?, effectId?, loop?}] — start/end in seconds, relative to parent container

Composition rules:
  - isSeries=true → children play sequentially (one after another), with optional transition between them
  - isSeries=false → children play in parallel, max duration wins (default)
  - isBackground=true → node loops for the full duration of its parent, excluded from duration calc
  - transition can be: "fade"|"slide"|"wipe"|"flip"|"clockWipe"

Built-in components (use type="component", componentName="X", props={...}):
  - AnimatedHeadline({text, subtext?, split?"word"|"char"|"line", gradient?bool, glow?bool}) — word-by-word kinetic typography
  - TypewriterText({text, speed?number}) — typing simulation
  - GlitchReveal({text, intensity?number}) — glitch-in text effect
  - DeviceMockup({device"browser"|"phone"|"tablet"|"laptop", src, title?, shadow?bool, angle?number}) — device frame
  - CursorFlyover({screenshot, steps:[{region:{x,y,zoom},cursor:{x,y},annotation?,duration}]}) — cursor animation
  - ComparisonSlider({before,after,matchPercent?number}) — before/after comparison
  - StatCounter({value:number, suffix?string, label?string}) — animated counter
  - ProgressBar({value:number, max?:number, label?string}) — animated progress
  - GradientBackground({type"linear"|"radial"|"conic", animated?bool, noise?bool}) — gradient bg
  - ParticleField({count:number, speed:number, color?string}) — particle system
  - LightLeak({intensity?:0-1}) — cinematic light leak overlay
  - SplitScreen({left?,right?,ratio?}) — side-by-side layout
  - SpotlightReveal({size?:number, duration?:number}) — circular reveal

Subtitle styling: style field supports CSS (e.g. "color:#fff;font-size:48px"). fontSize field for quick sizing. Supports HTML in src for rich text. For word-highlight karaoke: set className:"karaoke" on cue, or provide words[{text,start,end}] array.

Themes: set root.theme = "cinematic"|"minimal"|"neon"|"corporate" or an inline theme JSON object. Default is "cinematic".
Global stylesheet: root.stylesheet = "CSS string" — selectors use .type and .name class names on each node.

IMPORTANT: Read the full existing JSON file before editing. Only edit the JSON file. You can change, add, or remove any field on any node. Output ONLY a one-line summary of what specific change you made. Do not add explanations.`;

          console.log(`  🤖 pi edit: ${text}`);
          const child = spawn("pi", ["-p", prompt], {
            cwd: ROOT,
            stdio: ["ignore", "pipe", "pipe"],
          });

          let output = "";
          child.stdout.on("data", d => output += d);
          child.stderr.on("data", d => output += d);

          child.on("exit", (code) => {
            if (code === 0) {
              console.log(`  ✅ pi edit complete`);
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ done: true, output: output.trim() }));
            } else {
              console.error(`  ❌ pi edit failed (exit ${code}): ${output.trim()}`);
              res.writeHead(500, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: `pi exited with code ${code}`, output: output.trim() }));
            }
          });
        } catch (e) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    // API: SSE stream for reload notifications
    // When the browser tab closes, this connection drops → server shuts down
    // Grace period: wait 3s for reconnection (page reload), then exit
    if (path === "/api/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      });
      sseClients.add(res);
      if (shutdownTimer) {
        clearTimeout(shutdownTimer);
        shutdownTimer = null;
      }
      req.on("close", () => {
        sseClients.delete(res);
        if (MODE_EDIT && sseClients.size === 0) {
          shutdownTimer = setTimeout(() => {
            console.error("\n  🚪 Browser tab closed — shutting down\n");
            process.exit(0);
          }, 3000);
        }
      });
      return;
    }

    // API: Get video.json data (browser fetches this)
    // If descriptive JSON: returns the compiled stream tree
    // If compiled stream tree: returns as-is
    if (path === "/api/video-data") {
      try {
        const root = await loadCompiledRoot();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(root));
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }

    // API: Get scenes with media info (for thumbnails)
    if (path === "/api/scenes") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(scenes));
      return;
    }

    // API: Get current video.json info
    if (path === "/api/video-info") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        scenes,
        totalDuration,
        mode: { label: MODE_LABEL, edit: MODE_EDIT },
      }));
      return;
    }

    // Serve the main HTML page
    if (path === "/" || path === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(getHtml());
      return;
    }

    // Serve static files from ROOT/public/
    const assetPath = resolveAsset(path);
    if (assetPath && existsSync(assetPath)) {
      const ext = path.slice(path.lastIndexOf("."));
      const mime = MIME[ext] || "application/octet-stream";
      const stat = statSync(assetPath);
      const fileSize = stat.size;
      const cacheControl = ext === ".js" || ext === ".html" ? "no-cache" : "public, max-age=3600";
      const range = req.headers.range;
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunkSize = end - start + 1;
        const stream = createReadStream(assetPath, { start, end });
        res.writeHead(206, {
          "Content-Range": "bytes " + start + "-" + end + "/" + fileSize,
          "Accept-Ranges": "bytes",
          "Content-Length": chunkSize,
          "Content-Type": mime,
          "Cache-Control": cacheControl,
        });
        stream.pipe(res);
      } else {
        const data = readFileSync(assetPath);
        res.writeHead(200, {
          "Content-Type": mime,
          "Accept-Ranges": "bytes",
          "Content-Length": fileSize,
          "Cache-Control": cacheControl,
        });
        res.end(data);
      }
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  } catch (err) {
    try {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Server error: " + err.message);
    } catch {
      // Response already sent
    }
  }
});

server.listen(PORT, () => {
  const mode = MODE_LABEL ? " --label" : MODE_EDIT ? " --edit" : "";
  console.log(`\n🎬 Remotion Player${mode} at http://localhost:${PORT}`);
  console.log(`   JSON: ${VIDEO_JSON}`);
  if (MODE_LABEL) console.log(`   Labels: ${dirname(VIDEO_JSON)}/labels.json`);
  if (MODE_EDIT) console.log(`   Watching ${VIDEO_JSON} for changes — edit the file and player auto-reloads`);
  console.log("");
});
