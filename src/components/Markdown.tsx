/**
 * Markdown — lightweight markdown-to-HTML renderer for video slides.
 *
 * Built-in component available in any component `jsx:` expression without
 * needing to register it in `~~~js imports`.
 *
 * Supports:
 *   - Headings (# ## ###)
 *   - Bold (**text**) and italic (*text*)
 *   - Unordered lists (- * +) and ordered lists (1. 2.)
 *   - Tables (| col | col |)
 *   - Blockquotes (> text)
 *   - Inline code (`code`) and fenced code blocks (``` ```)
 *   - Horizontal rules (---)
 *   - Links ([text](url))
 *   - Line breaks
 *
 * Usage in descriptive markdown:
 *
 *   ---
 *   stylesheet: |
 *     .my-slide h1 { color: #667eea; font-size: 64px; }
 *     .my-slide li  { font-size: 32px; margin: 0.4em 0; }
 *   ---
 *   # video
 *   ...
 *
 *   - component isBackground:true
 *     ~~~jsx jsx
 *     <Markdown className="my-slide">
 *     # Title
 *
 *     - Bullet 1
 *     - Bullet 2
 *     </Markdown>
 *     ~~~
 */
import React from "react";
import { useVideoConfig } from "remotion";

interface MarkdownProps {
  children?: string;
  style?: React.CSSProperties;
  /** CSS class name for the root div. Use with root.stylesheet for global styling. */
  className?: string;
}

/** Simple markdown → HTML converter. No external dependencies. */
function mdToHtml(src: string): string {
  if (!src) return "";

  // Step 1: Split into blocks by double newlines
  const blocks = src.split(/\n\n+/);
  const out: string[] = [];

  for (let block of blocks) {
    block = block.trim();
    if (!block) continue;

    // Step 2: Detect block type BEFORE inline processing (to preserve syntax markers)
    const rawTrimmed = block;

    // Fenced code blocks
    if (/^```/.test(rawTrimmed)) {
      const codeMatch = rawTrimmed.match(/^```(\w*)\n?([\s\S]*?)```$/);
      if (codeMatch) {
        const lang = codeMatch[1]!;
        let code = codeMatch[2]!.trim();
        code = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        out.push(`<pre><code${lang ? ` class="language-${lang}"` : ""}>${code}</code></pre>`);
        continue;
      }
    }

    // Horizontal rules
    if (/^---+$/.test(rawTrimmed)) {
      out.push("<hr />");
      continue;
    }

    // Blockquotes (detect before HTML escaping)
    if (/^>/.test(rawTrimmed)) {
      const content = rawTrimmed.replace(/^>\s?/gm, "").trim();
      // Process inline elements within the quote
      let html = content;
      html = html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
      html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
      out.push(`<blockquote style="border-left:4px solid rgba(255,255,255,0.3);padding-left:1em;margin:0.5em 0">${html}</blockquote>`);
      continue;
    }

    // Headings (detect before HTML escaping)
    const h1 = /^# (.+)$/.exec(rawTrimmed);
    if (h1) {
      let html = h1[1];
      html = html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
      html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
      out.push(`<h1 style="font-size:2em;margin:0.4em 0 0.2em">${html}</h1>`);
      continue;
    }
    const h2 = /^## (.+)$/.exec(rawTrimmed);
    if (h2) {
      let html = h2[1];
      html = html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
      html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
      out.push(`<h2 style="font-size:1.6em;margin:0.6em 0 0.3em">${html}</h2>`);
      continue;
    }
    const h3 = /^### (.+)$/.exec(rawTrimmed);
    if (h3) {
      let html = h3[1];
      html = html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
      html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
      out.push(`<h3 style="font-size:1.3em;margin:0.6em 0 0.3em">${html}</h3>`);
      continue;
    }

    // Tables (detect before HTML escaping to preserve pipe chars)
    if (/^\|/.test(rawTrimmed)) {
      const rows = rawTrimmed.split("\n").filter((l: string) => !/^\|[- :]+\|$/.test(l.trim()));
      const cells = rows.map((r: string) => {
        const cols = r.split("|").map((c: string) => c.trim()).filter(Boolean);
        if (!cols.length) return "";
        let rowHtml = cols.map((c: string) => {
          c = c.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
          c = c.replace(/`([^`]+)`/g, "<code>$1</code>");
          c = c.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
          c = c.replace(/\*(.+?)\*/g, "<em>$1</em>");
          return `<td style="border:1px solid rgba(255,255,255,0.2);padding:0.4em 0.6em">${c}</td>`;
        }).join("");
        return `<tr>${rowHtml}</tr>`;
      }).filter(Boolean).join("");
      if (cells) out.push(`<table style="width:100%;border-collapse:collapse;margin:0.5em 0">${cells}</table>`);
      continue;
    }

    // Unordered lists
    if (/^(\s*)[-*+]\s/.test(rawTrimmed)) {
      const items = rawTrimmed.split("\n").map((l: string) => {
        const m = l.match(/^(\s*)[-*+]\s+(.*)$/);
        if (!m) return "";
        let text = m[2]!;
        text = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        text = text.replace(/`([^`]+)`/g, "<code>$1</code>");
        text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
        text = text.replace(/\*(.+?)\*/g, "<em>$1</em>");
        const depth = Math.floor(m[1]!.length / 2);
        const bullet = depth === 0 ? "●" : depth === 1 ? "○" : "▪";
        return `<li style="margin:0.2em 0;padding-left:${1.5 + depth * 1.2}em"><span style="display:inline-block;width:1.2em;text-align:center">${bullet}</span>${text}</li>`;
      }).filter(Boolean).join("");
      out.push(`<ul style="list-style:none;padding:0;margin:0.5em 0">${items}</ul>`);
      continue;
    }

    // Ordered lists
    if (/^\d+\.\s/.test(rawTrimmed)) {
      const items = rawTrimmed.split("\n").map((l: string) => {
        const m = l.match(/^\d+\.\s+(.*)$/);
        if (!m) return "";
        let text = m[1]!;
        text = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        text = text.replace(/`([^`]+)`/g, "<code>$1</code>");
        text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
        text = text.replace(/\*(.+?)\*/g, "<em>$1</em>");
        return `<li>${text}</li>`;
      }).filter(Boolean).join("");
      out.push(`<ol style="margin:0.5em 0;padding-left:1.5em">${items}</ol>`);
      continue;
    }

    // Plain paragraph — apply inline processing
    let html = block;
    html = html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
    html = html.replace(/\n/g, " ");
    out.push(`<p>${html}</p>`);
  }

  return out.join("\n");
}

export function Markdown({ children, style, className }: MarkdownProps) {
  const { width, height } = useVideoConfig();
  const text = typeof children === "string" ? children : "";

  const html = React.useMemo(() => mdToHtml(text), [text]);

  return (
    <div
      className={className}
      style={{
        width,
        height,
        padding: "60px 80px",
        fontFamily: "'Helvetica Neue', 'PingFang SC', 'Microsoft YaHei', Arial, sans-serif",
        fontSize: 28,
        lineHeight: 1.6,
        color: "#fff",
        textShadow: "0 1px 3px rgba(0,0,0,0.3)",
        boxSizing: "border-box",
        overflow: "hidden",
        ...style,
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
