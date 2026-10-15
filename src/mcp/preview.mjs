import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { isAbsolute, extname, dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPreviewBridgeScript } from "./bridge.mjs";
import { externalizePreviewMedia, publicOrigin, resolveMountedFile, resolvePreviewPath, publishPlayerBundle } from "./remote-assets.mjs";

export const TOOL_NAME = "markcut.preview";
export const RESOURCE_URI = "ui://markcut/video-preview-v19.html";
// Legacy entrypoints remain registered, but serve the current implementation.
export const LEGACY_RESOURCE_URIS = [
  "ui://markcut/video-preview-v3.html",
  "ui://markcut/video-preview-v4.html",
  "ui://markcut/video-preview-v5.html",
  "ui://markcut/video-preview-v6.html",
  "ui://markcut/video-preview-v7.html",
  "ui://markcut/video-preview-v8.html",
  "ui://markcut/video-preview-v9.html",
  "ui://markcut/video-preview-v10.html",
  "ui://markcut/video-preview-v11.html",
  "ui://markcut/video-preview-v12.html",
  "ui://markcut/video-preview-v13.html",
  "ui://markcut/video-preview-v14.html",
  "ui://markcut/video-preview-v15.html",
  "ui://markcut/video-preview-v16.html",
  "ui://markcut/video-preview-v17.html",
  "ui://markcut/video-preview-v18.html",
];
export const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";
// Google Maps JS loads libraries, tiles and Routes RPCs from these HTTPS origins.
// The MCP app sandbox enforces the declared domains; native localhost does not.
export const MAPS_CSP_DOMAINS = Object.freeze([
  "https://maps.googleapis.com",
  "https://maps.gstatic.com",
  "https://maps-api-v3.googleapis.com",
  "https://routes.googleapis.com",
]);
export function previewCsp() {
  return {
    connectDomains: [publicOrigin(), ...MAPS_CSP_DOMAINS],
    resourceDomains: [publicOrigin(), ...MAPS_CSP_DOMAINS],
    frameDomains: [],
  };
}
export const PLAYER_PORT = 4571;
export const PLAYER_ORIGIN = `http://127.0.0.1:${PLAYER_PORT}`;

const moduleDir = dirname(fileURLToPath(import.meta.url));
const playerServer = resolve(moduleDir, "managed-player.mjs");
const bundlePath = resolve(moduleDir,"remotion-app.bundle.js");
const compiledResources = new Map();
let managedPlayer = null;
let startPromise = null;
async function managerRunning() {
  try {
    const response = await fetch(PLAYER_ORIGIN + "/__markcut/health", {signal: AbortSignal.timeout(1000)});
    return response.ok && (await response.json()).service === "markcut-preview-manager";
  } catch { return false; }
}

async function submitPreview(path) {
  const response = await fetch(PLAYER_ORIGIN + "/__markcut/previews", {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({path}),signal:AbortSignal.timeout(150000)});
  const result = await response.json(); if (!response.ok) throw new Error(result.error || "preview creation failed"); return result;
}

export function getPreviewMedia(contentHash) {
  if (!/^[a-f0-9]{64}$/.test(contentHash)) throw new Error("Invalid Markcut content hash");
  const rendered = compiledResources.get(previewResourceUri(contentHash));
  if (!rendered) throw new Error("Unknown or expired Markcut compiled scenes");
  return rendered;
}

export function previewResourceUri(contentHash) {
  return `${RESOURCE_URI}/${contentHash}`;
}

export function buildPreviewResourceResult(resourceUri = RESOURCE_URI) {
  return {
    ttlMs: 0,
    cacheScope: "private",
    contents: [{
      uri: resourceUri,
      mimeType: RESOURCE_MIME_TYPE,
      text: buildPreviewHtml(),
      _meta: {
        ui: {
          prefersBorder: true,
          csp: previewCsp(),
        },
      },
    }],
  };
}

export function validateMarkdownPath(value) {
  if (typeof value !== "string" || !isAbsolute(value)) {
    throw new Error("path must be an absolute filesystem path");
  }
  if (extname(value).toLowerCase() !== ".md") {
    throw new Error("path must point to a Markdown file (.md)");
  }
  return value;
}

export async function readPreviewAudio(path) {
  const markdown = await readFile(path, "utf8");
  const match = markdown.match(/^audio:\s*([^\r\n]+)\s*$/m);
  const filename = match ? match[1].trim() : `${basename(path, ".md")}.wav`;
  if (!/^[\w. -]+\.(wav|mp3|m4a|ogg)$/i.test(filename) || filename.startsWith(".")) throw new Error("audio must be a local audio filename in the Markdown directory");
  const file = resolve(dirname(path), filename);
  try { await access(file, fsConstants.R_OK); } catch (e) { if (!match && e.code === "ENOENT") return {}; throw e; }
  const remote = resolveMountedFile(file);
  if (remote) return {audioSrc: remote};
  const data = await readFile(file);
  if (data.length > 2 * 1024 * 1024) throw new Error("audio file exceeds 2 MB preview limit for unmounted media");
  const ext = filename.split(".").pop().toLowerCase();
  const mime = {wav:"audio/wav",mp3:"audio/mpeg",m4a:"audio/mp4",ogg:"audio/ogg"}[ext];
  return {audioSrc:`data:${mime};base64,${data.toString("base64")}`};
}

export function withPreviewAudio(compiled, audioSrc) {
  if (!audioSrc) return compiled;
  const root = compiled.root || compiled;
  const children = root.children || [];
  const duration = root.durationInSeconds || children.filter(child=>!child.isBackground).reduce((sum,child)=>sum+(child.durationInSeconds||child.duration||0),0);
  if (!duration) throw new Error('compiled preview has no duration for audio track');
  return {...compiled, ...(compiled.root ? {root:{...root,children:[...children,{id:'mcp-preview-audio',type:'audio',src:audioSrc,volume:1,isBackground:true,start:0,end:duration,duration,durationInSeconds:duration}]}} : {children:[...children,{id:'mcp-preview-audio',type:'audio',src:audioSrc,volume:1,isBackground:true,start:0,end:duration,duration,durationInSeconds:duration}]})};
}

export async function ensureVideoPreview(path, options = {}) {
  const validatedPath = validateMarkdownPath(resolvePreviewPath(path));
  await access(validatedPath, fsConstants.R_OK);
  if (!await managerRunning()) {
    if (!startPromise) {
      startPromise = (async () => {
        const child = spawn(process.execPath, [playerServer], {
          cwd: resolve(moduleDir, "../.."), stdio: ["ignore", "ignore", "pipe"], detached: process.platform !== "win32",
        });
        managedPlayer = child;
        let stderr = "";
        child.stderr.on("data", b => { stderr += String(b).slice(-4000); });
        child.once("exit", () => { if (managedPlayer === child) managedPlayer = null; });
        for (let attempt = 0; attempt < 50; attempt++) {
          if (await managerRunning()) return;
          if (child.exitCode !== null) break;
          await new Promise(r => setTimeout(r, 100));
        }
        child.kill("SIGTERM");
        throw new Error("port 4571 unavailable or manager failed: " + stderr);
      })().finally(() => { startPromise = null; });
    }
    await startPromise;
  }
  const preview = await submitPreview(validatedPath);
  const resourceUri = previewResourceUri(preview.contentHash);
  // Re-read the manager-pinned compilation for every issued revision. A process
  // may outlive a manager restart; a content-hash cache must never serve a
  // compilation pinned by an earlier, now-expired preview instance.
  const response = await fetch(preview.previewUrl + "api/video-data", {signal:AbortSignal.timeout(30000)});
  if (!response.ok) throw new Error("Unable to read compiled Remotion scenes");
  const compiled = await response.json();
  const audio = await readPreviewAudio(validatedPath);
  const audioCompiled = withPreviewAudio(compiled,audio.audioSrc);
  const {compiled:remoteCompiled} = externalizePreviewMedia(audioCompiled,preview.id,publicOrigin(),dirname(validatedPath));
  compiledResources.set(resourceUri,{compiled:remoteCompiled});
  // The federated host resolves the static UI resource at startup.
  // The initial tool result carries compiled scenes, without an iframe request.
  const {previewUrl:localPreviewUrl,...publicPreview}=preview;
  return {...publicPreview,assetBaseUrl:publicOrigin()+"/files/_neoy/markcut/generated/"+preview.id+"/",resourceUri:RESOURCE_URI};
}

export function stopManagedVideoPreview() {
  if (managedPlayer && managedPlayer.exitCode == null) {
    try {
      if (process.platform !== "win32" && managedPlayer.pid) process.kill(-managedPlayer.pid, "SIGTERM");
      else managedPlayer.kill("SIGTERM");
    } catch { managedPlayer.kill("SIGTERM"); }
  }
  managedPlayer = null;
  startPromise = null;
}

export function reviewResult(decision, feedback = "") {
  if (decision === "approved") return { decision };
  if (decision === "changes_requested") {
    const normalized = typeof feedback === "string" ? feedback.trim() : "";
    if (!normalized) throw new Error("feedback is required when requesting changes");
    return { decision, feedback: normalized };
  }
  throw new Error(`unsupported review decision: ${String(decision)}`);
}

export function reviewMessage(result) {
  const normalized = reviewResult(result?.decision, result?.feedback);
  return {
    jsonrpc: "2.0",
    method: "ui/message",
    params: { role: "user", content: [{ type: "text", text: JSON.stringify(normalized) }] },
  };
}

export function buildPreviewHtml() {
  const playerScriptUrl = publishPlayerBundle(bundlePath);
  // Base64 keeps HTML parser-sensitive sequences inside the large JS bundle
  // from terminating the embedding script tag or leaking source into the DOM.
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Markcut Preview</title>
<style>body{font:14px system-ui;margin:0;background:#fff;color:#17202a}main{padding:12px;max-width:960px;margin:auto}h1{font-size:17px}.path{font-size:12px;overflow-wrap:anywhere}.transport{display:flex;align-items:center;gap:10px;padding:12px 0}.transport input{flex:1;min-width:50px}button{cursor:pointer;padding:8px;border-radius:6px;border:1px solid #a8a8a8}#approve{background:#198038;color:white}#changes{background:#c72b29;color:white}textarea{width:100%;box-sizing:border-box;min-height:66px}.review-actions{display:flex;justify-content:space-between;align-items:center;width:100%;gap:16px}.review-actions button{min-width:150px}#remotion-canvas{background:#090b12}#status{padding:8px 0}</style></head>
<body><main><h1>Markcut · Video Review</h1><div id="player-version" style="font-weight:600;font-size:13px">Player v19 · Video <span id="video-md-version">Waiting for video...</span></div><div class="path" id="path-label" hidden></div><div id="remotion-root"></div>
<label for="feedback">Review feedback</label><textarea id="feedback"></textarea><div id="status" role="status">Starting preview…</div>
<div class="review-actions"><button id="changes">Request changes</button><button id="approve">Approve</button></div></main>
<!-- Register the MCP message bridge before downloading the large React bundle.
     Otherwise early tool-input/result notifications can be lost while the script loads. -->
<script>${buildPreviewBridgeScript().replaceAll("__MARKCUT_ORIGIN__",JSON.stringify(publicOrigin()))}</script>
<script src="${playerScriptUrl}"></script></body></html>`;
}
