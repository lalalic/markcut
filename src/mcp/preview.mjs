import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
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
let managedPlayer = null;
let managedPath = null;
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
  const validatedPath = validateMarkdownPath(path);
  await access(validatedPath, fsConstants.R_OK);
  if (managedPlayer && managedPath === validatedPath && managedPlayer.exitCode == null && !managedPlayer.killed) {
    return { path: validatedPath, previewUrl: `${PLAYER_ORIGIN}/` };
  }
  if (startPromise && managedPath === validatedPath) return startPromise;

  if (managedPlayer && managedPlayer.exitCode == null && !managedPlayer.killed) {
    managedPlayer.kill("SIGTERM");
  }
  managedPlayer = null;
  managedPath = validatedPath;

  const spawnImpl = options.spawnImpl || spawn;
  const settleMs = options.settleMs ?? 250;
  startPromise = new Promise((resolvePromise, rejectPromise) => {
    const child = spawnImpl(process.execPath, [playerServer, validatedPath, `--port=${PLAYER_PORT}`], {
      cwd: resolve(moduleDir, "../.."),
      stdio: ["ignore", "pipe", "pipe"],
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
        resolvePromise({ path: validatedPath, previewUrl: `${PLAYER_ORIGIN}/` });
      }
    };
    child.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
    child.once("error", (error) => finish(new Error(`unable to start Markcut player: ${error.message}`)));
    child.once("exit", (code, signal) => {
      if (managedPlayer === child) managedPlayer = null;
      if (!settled) finish(new Error(`Markcut player exited during startup (${signal || code || "unknown"})${stderr ? `: ${stderr.trim()}` : ""}`));
    });
    setTimeout(() => {
      if (!settled) finish();
    }, settleMs);
  });
  return startPromise;
}

export function stopManagedVideoPreview() {
  if (managedPlayer && managedPlayer.exitCode == null && !managedPlayer.killed) managedPlayer.kill("SIGTERM");
  managedPlayer = null;
  managedPath = null;
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
<style>body{font:15px system-ui,sans-serif;margin:0;color:#17202a;background:#fff}main{max-width:980px;margin:auto;padding:16px}.meta{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}.meta h1{font-size:18px;margin:0}.path{font-size:12px;color:#656d76;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.player{width:100%;aspect-ratio:9/16;max-height:72vh;border:1px solid #d8dee4;border-radius:10px;background:#0d1117;overflow:hidden}.player iframe{width:100%;height:100%;border:0;display:block}textarea{box-sizing:border-box;width:100%;min-height:82px;margin:12px 0 8px;padding:10px;border:1px solid #8c959f;border-radius:6px;font:inherit}button{border:0;border-radius:6px;padding:9px 14px;margin-right:8px;font:inherit;cursor:pointer}#approve{background:#1f883d;color:#fff}#changes{background:#cf222e;color:#fff}#status{min-height:1.4em;margin:8px 0;color:#656d76}</style></head>
<body><main><div class="meta"><h1>Review video</h1><div class="path" id="path-label"></div></div><div class="player"><iframe id="video-player" title="Markcut video preview" allow="autoplay; fullscreen"></iframe></div>
<label for="feedback">Feedback (required for requested changes)</label><textarea id="feedback" placeholder="What should be changed?"></textarea><div id="status" role="status">Starting preview…</div>
<button id="approve">Approve</button><button id="changes">Request changes</button></main>
<script>${buildPreviewBridgeScript(SUBMIT_TOOL_NAME)}</script></body></html>`;
}
