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

  let html = src;

  // Escape HTML entities to prevent XSS (content is user-provided)
  html = html
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Inline code (must come before bold/italic to avoid clobbering `**`)
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Italic
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Links
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" style="color:inherit;text-decoration:underline">$1</a>',
  );

  // Horizontal rules
  html = html.replace(/^---+$/gm, "<hr />");

  // Fenced code blocks (```...```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m: string, lang: string, code: string) => {
    return `<pre><code${lang ? ` class="language-${lang}"` : ""}>${code.trim()}</code></pre>`;
  });

  // Blockquotes
  html = html.replace(
    /^(>+)\s?(.+)$/gm,
    (_m: string, depth: string, text: string) => {
      const tag = "blockquote".repeat(Math.min(depth.length, 3));
      return `${tag}>${text}`;
    },
  );
  // Collapse blockquote markers (simple approach: wrap in <blockquote>)
  html = html.replace(/((?:<blockquote>[^<]*<\/blockquote>\s*)+)/g, (_m: string, block: string) => {
    const content = block.replace(/<\/?blockquote>/g, "").trim();
    return `<blockquote style="border-left:4px solid rgba(255,255,255,0.3);padding-left:1em;margin:0.5em 0">${content}</blockquote>`;
  });

  // Tables
  html = html.replace(
    /^\|(.+)\|\s*$/gm,
    (_m: string, row: string) => {
      const cells = row.split("|").map((c: string) => c.trim());
      // Check if it's a separator row (|---|)
      if (cells.every((c: string) => /^-+$/.test(c))) return "";
      return `<tr>${cells.map((c: string) => `<td>${c}</td>`).join("")}</tr>`;
    },
  );
  // Wrap consecutive <tr> in <table>
  html = html.replace(/((?:<tr>.*?<\/tr>\s*)+)/g, (_m: string, rows: string) => {
    const cleaned = rows.replace(/\n\s*/g, "");
    return `<table style="width:100%;border-collapse:collapse;margin:0.5em 0">${cleaned}</table>`;
  });
  html = html.replace(/<td>/g, '<td style="border:1px solid rgba(255,255,255,0.2);padding:0.4em 0.6em">');

  // Unordered lists
  html = html.replace(/^(\s*)[-*+]\s+(.+)$/gm, (_m: string, indent: string, text: string) => {
    const depth = Math.floor(indent.length / 2);
    return `<li data-depth="${depth}">${text}</li>`;
  });
  // Wrap consecutive <li> in <ul>
  html = html.replace(/((?:<li[^>]*>.*?<\/li>\s*)+)/g, (_m: string, items: string) => {
    return `<ul style="list-style:none;padding:0;margin:0.5em 0">${items}</ul>`;
  });
  // Style list items with bullet markers via CSS
  html = html.replace(
    /<li data-depth="(\d)">/g,
    (_m: string, d: string) => {
      const bullet = d === "0" ? "●" : d === "1" ? "○" : "▪";
      return `<li style="margin:0.2em 0;padding-left:${1.5 + Number(d) * 1.2}em">` +
        `<span style="display:inline-block;width:1.2em;text-align:center">${bullet}</span>`;
    },
  );

  // Ordered lists (1. item)
  html = html.replace(/^\d+\.\s+(.+)$/gm, "<li class='ol'>$1</li>");
  html = html.replace(
    /((?:<li class='ol'>.*?<\/li>\s*)+)/g,
    `<ol style="margin:0.5em 0;padding-left:1.5em">$1</ol>`,
  );
  html = html.replace(/<li class='ol'>/g, "<li>");

  // Headings
  html = html.replace(/^### (.+)$/gm, '<h3 style="font-size:1.3em;margin:0.6em 0 0.3em">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 style="font-size:1.6em;margin:0.6em 0 0.3em">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 style="font-size:2em;margin:0.4em 0 0.2em">$1</h1>');

  // Line breaks (double newline → paragraph break)
  html = html.replace(/\n\n+/g, "</p><p>");

  // Single newlines → space (within a paragraph)
  html = html.replace(/\n/g, " ");

  // Wrap in paragraph if not already wrapped in block elements
  if (!/^<(h[123]|p|ul|ol|table|blockquote|pre|hr)/.test(html)) {
    html = `<p>${html}</p>`;
  }

  return html;
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
