import { readFile } from "node:fs/promises";
import { isAbsolute, extname } from "node:path";
import { buildPreviewBridgeScript } from "./bridge.mjs";

export const TOOL_NAME = "markcut.preview";
export const SUBMIT_TOOL_NAME = "markcut.preview.submit";
export const RESOURCE_URI = "ui://markcut/markdown-preview-v2.html";

export function validateMarkdownPath(value) {
  if (typeof value !== "string" || !isAbsolute(value)) {
    throw new Error("path must be an absolute filesystem path");
  }
  if (extname(value).toLowerCase() !== ".md") {
    throw new Error("path must point to a Markdown file (.md)");
  }
  return value;
}

export async function readMarkdownPreview(path) {
  const validatedPath = validateMarkdownPath(path);
  try {
    return { path: validatedPath, markdown: await readFile(validatedPath, "utf8") };
  } catch (error) {
    throw new Error(`unable to read Markdown file: ${error instanceof Error ? error.message : String(error)}`);
  }
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
    params: {
      role: "user",
      content: [{ type: "text", text: JSON.stringify(normalized) }],
    },
  };
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function renderMarkdown(markdown) {
  return markdown.split(/\r?\n/).map((line) => {
    const escaped = escapeHtml(line);
    if (line.startsWith("### ")) return `<h3>${escaped.slice(4)}</h3>`;
    if (line.startsWith("## ")) return `<h2>${escaped.slice(3)}</h2>`;
    if (line.startsWith("# ")) return `<h1>${escaped.slice(2)}</h1>`;
    if (line.startsWith("- ")) return `<li>${escaped.slice(2)}</li>`;
    return line.trim() ? `<p>${escaped}</p>` : "";
  }).join("\n");
}

export function buildPreviewHtml({ path = "", markdown = "" }) {
  const safePath = escapeHtml(path);
  const rendered = renderMarkdown(markdown);
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>MarkCut Markdown review</title>
<style>body{font:15px system-ui,sans-serif;margin:0;padding:24px;color:#17202a;background:#fff}main{max-width:860px;margin:auto}article{border:1px solid #d8dee4;border-radius:8px;padding:20px;overflow:auto}h1,h2,h3{margin-top:0}p{line-height:1.5}textarea{box-sizing:border-box;width:100%;min-height:100px;margin:16px 0 10px;padding:10px;border:1px solid #8c959f;border-radius:6px;font:inherit}button{border:0;border-radius:6px;padding:9px 14px;margin-right:8px;font:inherit;cursor:pointer}#approve{background:#1f883d;color:#fff}#changes{background:#cf222e;color:#fff}#status{min-height:1.4em;color:#cf222e}</style></head>
<body><main><h1>Review Markdown</h1><p><code>${safePath}</code></p><article>${rendered}</article>
<label for="feedback">Feedback (required for requested changes)</label><textarea id="feedback" placeholder="What should be changed?"></textarea><div id="status" role="status"></div>
<button id="approve">Approve</button><button id="changes">Request changes</button></main>
<script>${buildPreviewBridgeScript(SUBMIT_TOOL_NAME)}</script></body></html>`;
}
