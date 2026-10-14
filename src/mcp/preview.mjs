import { spawn } from "node:child_process";
import { access, readFile, writeFile, unlink, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { isAbsolute, extname, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPreviewBridgeScript } from "./bridge.mjs";

export const TOOL_NAME = "markcut.preview";
export const RESOURCE_URI = "ui://markcut/video-preview-v5.html";
export const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";
export const PLAYER_PORT = 4571;
export const PLAYER_ORIGIN = `http://127.0.0.1:${PLAYER_PORT}`;

const moduleDir = dirname(fileURLToPath(import.meta.url));
const playerServer = resolve(moduleDir, "managed-player.mjs");
const renderCli = resolve(moduleDir, "../render/cli.mjs");
const execFileAsync = promisify(execFile);
const renderedResources = new Map();
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
  const rendered = renderedResources.get(previewResourceUri(contentHash));
  if (!rendered) throw new Error("Unknown or expired Markcut preview media");
  return rendered;
}

export function previewResourceUri(contentHash) {
  return `${RESOURCE_URI}/${contentHash}`;
}

export function buildPreviewResourceResult(resourceUri = RESOURCE_URI) {
  const rendered = renderedResources.get(resourceUri);
  return {
    ttlMs: 0,
    cacheScope: "private",
    contents: [{
      uri: resourceUri,
      mimeType: RESOURCE_MIME_TYPE,
      text: buildPreviewHtml(rendered),
      _meta: {
        ui: {
          prefersBorder: true,
          csp: {
            connectDomains: [],
            resourceDomains: [],
            frameDomains: [],
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
  if (!renderedResources.has(resourceUri)) {
    const bytes = await readFile(validatedPath);
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== preview.contentHash) throw new Error("Markdown changed during preview creation");
    const directory = await mkdtemp(join(tmpdir(), "markcut-mcp-preview-"));
    // Snapshot alongside the input, so relative media references still resolve.
    const snapshot = join(dirname(validatedPath), `.markcut-mcp-${randomUUID()}.md`);
    try {
      await writeFile(snapshot, bytes, {flag:"wx", mode:0o600});
      const output = join(directory, "preview.mp4");
      const poster = join(directory, "poster.jpg");
      await execFileAsync(process.execPath, [renderCli, "render", snapshot, "--output", output], {
        cwd: resolve(moduleDir, "../.."), timeout: 180000, maxBuffer: 4 * 1024 * 1024,
      });
      const after = createHash("sha256").update(await readFile(validatedPath)).digest("hex");
      if (after !== digest) throw new Error("Markdown changed while rendering preview");
      const video = await readFile(output);
      if (video.length > 8 * 1024 * 1024) throw new Error("Embedded video exceeds the 8 MB review limit");
      await execFileAsync("ffmpeg", ["-y", "-ss", "0.5", "-i", output, "-frames:v", "1", "-q:v", "5", poster], {
        timeout: 15000, maxBuffer: 512 * 1024,
      });
      renderedResources.set(resourceUri, {
        videoBase64: video.toString("base64"),
        posterBase64: (await readFile(poster)).toString("base64"),
      });
    } finally {
      await unlink(snapshot).catch(()=>{});
      await rm(directory, { recursive: true, force: true });
    }
  }
  // The federated host resolves UI resources from startup registration.
  // Media is fetched independently through the app-only tool by content hash.
  return { ...preview, resourceUri: RESOURCE_URI };
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

export function buildPreviewHtml(rendered) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Markcut video review</title>
<style>body{font:15px system-ui,sans-serif;margin:0;color:#17202a;background:#fff}main{max-width:980px;margin:auto;padding:16px}.meta{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}.meta h1{font-size:18px;margin:0}.path{font-size:12px;color:#656d76;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.player{width:100%;aspect-ratio:9/16;max-height:72vh;border:1px solid #d8dee4;border-radius:10px;background:#0d1117;overflow:hidden}.player video{width:100%;height:100%;display:block;object-fit:contain}textarea{box-sizing:border-box;width:100%;min-height:82px;margin:12px 0 8px;padding:10px;border:1px solid #8c959f;border-radius:6px;font:inherit}button{border:0;border-radius:6px;padding:9px 14px;margin-right:8px;font:inherit;cursor:pointer}#approve{background:#1f883d;color:#fff}#changes{background:#cf222e;color:#fff}#status{min-height:1.4em;margin:8px 0;color:#656d76}</style></head>
<body><main><div class="meta"><h1>Review video</h1><div class="path" id="path-label"></div></div><div class="player"><video id="video-player" controls playsinline preload="metadata" ${rendered ? `poster="data:image/jpeg;base64,${rendered.posterBase64}" data-video-base64="${rendered.videoBase64}"` : ""}></video></div>
<label for="feedback">Feedback (required for requested changes)</label><textarea id="feedback" placeholder="What should be changed?"></textarea><div id="status" role="status">Starting preview…</div>
<button id="approve">Approve</button><button id="changes">Request changes</button></main>
<script>${buildPreviewBridgeScript()}</script></body></html>`;
}
