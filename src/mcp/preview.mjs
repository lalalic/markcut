import { spawn } from "node:child_process";
import { access, realpath } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { isAbsolute, extname, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPreviewBridgeScript } from "./bridge.mjs";

export const TOOL_NAME = "markcut.preview";
export const SUBMIT_TOOL_NAME = "markcut.preview.submit";
export const RESOURCE_URI = "ui://markcut/video-preview-v3.html";
export const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";
export const PLAYER_PORT = 4571;
export const PLAYER_ORIGIN = `http://127.0.0.1:${PLAYER_PORT}`;

const moduleDir = dirname(fileURLToPath(import.meta.url));
const playerServer = resolve(moduleDir, "../player/server.mjs");
const sharedServer = resolve(moduleDir, "./shared-preview-server.mjs");
let managedPlayer = null;
let managedToken = null;
let startPromise = null;

export function buildPreviewResourceResult() {
  return {
    ttlMs: 0,
    cacheScope: "private",
    contents: [{
      uri: RESOURCE_URI,
      mimeType: RESOURCE_MIME_TYPE,
      text: buildPreviewHtml(),
      _meta: {
        ui: {
          prefersBorder: true,
          csp: {
            connectDomains: [PLAYER_ORIGIN],
            resourceDomains: [],
            frameDomains: [PLAYER_ORIGIN],
          },
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

export async function ensureVideoPreview(path, options = {}) {
  const requestedPath = validateMarkdownPath(path);
  await access(requestedPath, fsConstants.R_OK);
  const validatedPath = await realpath(requestedPath);
  if (extname(validatedPath).toLowerCase() !== ".md") throw new Error("path must point to a Markdown file (.md)");
  if (startPromise) return startPromise.then(() => registerDocument(validatedPath, options));
  if (managedPlayer && managedPlayer.exitCode == null && !managedPlayer.killed) return registerDocument(validatedPath, options);
  return startSharedBackend(options).then(() => registerDocument(validatedPath, options));
}

async function registerDocument(path, options) {
  const response = await fetch(`http://127.0.0.1:${PLAYER_PORT}/api/register`, {
    method: "POST", headers: { Authorization: `Bearer ${managedToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
  if (!response.ok) throw new Error(`Markcut preview registration failed (${response.status}): ${await response.text()}`);
  return response.json();
}

async function startSharedBackend(options = {}) {
  const spawnImpl = options.spawnImpl || spawn;
  const settleMs = options.settleMs ?? 500;
  managedToken = options.token || managedToken || `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  startPromise = new Promise((resolvePromise, rejectPromise) => {
    const child = spawnImpl(process.execPath, [sharedServer], {
      cwd: resolve(moduleDir, "../.."),
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, MARKCUT_PREVIEW_PORT: String(PLAYER_PORT), MARKCUT_PREVIEW_TOKEN: managedToken },
    });
    managedPlayer = child;
    let stderr = "";
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      startPromise = null;
      if (error) {
        if (managedPlayer === child) managedPlayer = null;
        rejectPromise(error);
      } else {
        resolvePromise();
      }
    };
    child.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
    child.once("error", (error) => finish(new Error(`unable to start Markcut player: ${error.message}`)));
    child.once("exit", (code, signal) => {
      if (managedPlayer === child) managedPlayer = null;
      if (!settled) finish(new Error(`Markcut player exited during startup (${signal || code || "unknown"})${stderr ? `: ${stderr.trim()}` : ""}`));
    });
    const probe = async () => {
      const deadline = Date.now() + settleMs;
      while (!settled && Date.now() < deadline) {
        try { const response = await fetch(`${PLAYER_ORIGIN}/health`, { headers: { Authorization: `Bearer ${managedToken}` } }); if (response.ok) return finish(); } catch {}
        await new Promise((resolveWait) => setTimeout(resolveWait, 30));
      }
      if (!settled) finish(new Error("Markcut shared preview backend did not become ready"));
    };
    probe();
  });
  try { await startPromise; } finally { startPromise = null; }
}

export function stopManagedVideoPreview() {
  if (managedPlayer && managedPlayer.exitCode == null && !managedPlayer.killed) managedPlayer.kill("SIGTERM");
  managedPlayer = null;
  managedToken = null;
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
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Markcut video review</title>
<style>body{font:15px system-ui,sans-serif;margin:0;color:#17202a;background:#fff}main{max-width:980px;margin:auto;padding:16px}.meta{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}.meta h1{font-size:18px;margin:0}.path{font-size:12px;color:#656d76;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.player{width:100%;aspect-ratio:9/16;max-height:72vh;border:1px solid #d8dee4;border-radius:10px;background:#0d1117;overflow:hidden}.player iframe{width:100%;height:100%;border:0;display:block}@media (min-aspect-ratio:1/1){.player{aspect-ratio:16/9}}textarea{box-sizing:border-box;width:100%;min-height:82px;margin:12px 0 8px;padding:10px;border:1px solid #8c959f;border-radius:6px;font:inherit}button{border:0;border-radius:6px;padding:9px 14px;margin-right:8px;font:inherit;cursor:pointer}#approve{background:#1f883d;color:#fff}#changes{background:#cf222e;color:#fff}#fullscreen{background:#6e7781;color:#fff}#status{min-height:1.4em;margin:8px 0;color:#656d76}</style></head>
<body><main><div class="meta"><h1>Review video</h1><div class="path" id="path-label"></div></div><div class="player" id="player-shell"><iframe id="video-player" title="Markcut video preview" allow="autoplay; fullscreen; picture-in-picture"></iframe></div>
<label for="feedback">Feedback (required for requested changes)</label><textarea id="feedback" placeholder="What should be changed?"></textarea><div id="status" role="status">Starting preview…</div>
<button id="fullscreen" type="button">Fullscreen</button><button id="approve">Approve</button><button id="changes">Request changes</button></main>
<script>${buildPreviewBridgeScript(SUBMIT_TOOL_NAME)}</script></body></html>`;
}
