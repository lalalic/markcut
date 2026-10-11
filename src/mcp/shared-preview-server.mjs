#!/usr/bin/env node
import { createHash, randomBytes } from "node:crypto";
import { createServer, request as httpRequest } from "node:http";
import { realpath, access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { extname, resolve, dirname } from "node:path";
import { spawn } from "node:child_process";
import { createServer as createNetServer } from "node:net";

export const DEFAULT_PORT = 4571;

export function documentId(path) {
  return createHash("sha256").update(path).digest("hex").slice(0, 24);
}

export function validateDocumentPath(value) {
  if (typeof value !== "string" || !value.startsWith("/") || extname(value).toLowerCase() !== ".md") {
    throw new Error("path must be an absolute Markdown file");
  }
  return value;
}

async function freePort() {
  return new Promise((resolvePort, reject) => {
    const probe = createNetServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const port = probe.address().port;
      probe.close(() => resolvePort(port));
    });
  });
}

function proxy(req, res, targetPort, targetPath) {
  const upstream = httpRequest({ host: "127.0.0.1", port: targetPort, path: targetPath, method: req.method, headers: req.headers }, (response) => {
    res.writeHead(response.statusCode || 502, response.headers);
    response.pipe(res);
  });
  upstream.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end("Preview worker unavailable"); });
  req.pipe(upstream);
}

export function startSharedPreviewServer({ port = DEFAULT_PORT, token = randomBytes(24).toString("hex"), playerServer, spawnImpl = spawn } = {}) {
  const documents = new Map();
  const workers = new Set();
  const register = async (rawPath) => {
    const requested = validateDocumentPath(rawPath);
    const canonical = await realpath(requested);
    await access(canonical, fsConstants.R_OK);
    if (extname(canonical).toLowerCase() !== ".md") throw new Error("path must point to a Markdown file (.md)");
    const id = documentId(canonical);
    const existing = documents.get(canonical);
    if (existing) return { id, canonical, port: existing.port };
    const workerPort = await freePort();
    const child = spawnImpl(process.execPath, [playerServer, canonical, `--port=${workerPort}`], {
      cwd: resolve(dirname(playerServer), "../.."), stdio: ["ignore", "pipe", "pipe"]
    });
    workers.add(child);
    const ready = new Promise((resolveReady, rejectReady) => {
      let stderr = "";
      const timer = setTimeout(() => resolveReady(), 1000);
      child.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
      child.once("error", (error) => { clearTimeout(timer); rejectReady(error); });
      child.once("exit", (code, signal) => {
        workers.delete(child);
        if (documents.get(canonical)?.child === child) documents.delete(canonical);
        if (code !== 0) rejectReady(new Error(`Markcut player exited (${signal || code})${stderr ? `: ${stderr.trim()}` : ""}`));
      });
      setTimeout(() => { clearTimeout(timer); resolveReady(); }, 150);
    });
    try {
      await ready;
    } catch (error) {
      workers.delete(child);
      if (child.exitCode == null && !child.killed) child.kill("SIGTERM");
      throw error;
    }
    documents.set(canonical, { id, port: workerPort, child });
    return { id, canonical, port: workerPort };
  };
  const server = createServer(async (req, res) => {
    try {
      if (req.url === "/health" && req.method === "GET") {
        if (req.headers.authorization !== `Bearer ${token}`) { res.writeHead(401); res.end("Unauthorized"); return; }
        res.writeHead(200); res.end("ok"); return;
      }
      if (req.url === "/api/register" && req.method === "POST") {
        if (req.headers.authorization !== `Bearer ${token}`) { res.writeHead(401); res.end("Unauthorized"); return; }
        let body = ""; for await (const chunk of req) body += chunk;
        const data = JSON.parse(body); const result = await register(data.path);
        res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify({ id: result.id, path: result.canonical, previewUrl: `http://127.0.0.1:${port}/d/${result.id}/` })); return;
      }
      const match = new URL(req.url, `http://127.0.0.1:${port}`).pathname.match(/^\/d\/([a-f0-9]{24})(\/.*)?$/);
      if (!match) { res.writeHead(404); res.end("Not found"); return; }
      const entry = [...documents.values()].find((item) => item.id === match[1]);
      if (!entry) { res.writeHead(404); res.end("Not found"); return; }
      const suffix = match[2] || "/";
      proxy(req, res, entry.port, suffix + (new URL(req.url, `http://127.0.0.1:${port}`).search || ""));
    } catch (error) { res.writeHead(error.code === "ENOENT" ? 404 : 400); res.end(error.message); }
  });
  server.on("close", () => { for (const child of workers) child.kill("SIGTERM"); workers.clear(); });
  server.listen(port, "127.0.0.1");
  return { server, token, documents, close: () => server.close() };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const port = Number(process.env.MARKCUT_PREVIEW_PORT || DEFAULT_PORT);
  const token = process.env.MARKCUT_PREVIEW_TOKEN;
  const playerServer = resolve(new URL("../player/server.mjs", import.meta.url).pathname);
  const app = startSharedPreviewServer({ port, token, playerServer });
  process.on("SIGTERM", () => app.close());
  process.on("SIGINT", () => app.close());
  app.server.on("listening", () => console.log(`Markcut shared preview ready at http://127.0.0.1:${port}`));
}
