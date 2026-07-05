/**
 * Unit tests for the built-in Markdown component's mdToHtml function
 * and the stylesheet integration.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { parseMarkdownDescriptive } from "../src/descriptive/markdown";
import { compileDescriptiveRoot } from "../src/descriptive/compiler";

// ── mdToHtml unit tests ─────────────────────────────────────────────────
// Copy of the mdToHtml logic from Markdown.tsx for isolated testing
function mdToHtml(src: string): string {
  if (!src) return "";
  const blocks = src.split(/\n\n+/);
  const out: string[] = [];

  for (let block of blocks) {
    block = block.trim();
    if (!block) continue;
    const rawTrimmed = block;

    // Code fences
    if (/^```/.test(rawTrimmed)) {
      const m = rawTrimmed.match(/^```(\w*)\n?([\s\S]*?)```$/);
      if (m) {
        let code = (m[2] || "").trim();
        code = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        out.push(`<pre><code${m[1] ? ` class="language-${m[1]}"` : ""}>${code}</code></pre>`);
        continue;
      }
    }

    // Blockquotes
    if (/^>/.test(rawTrimmed)) {
      let html = rawTrimmed.replace(/^>\s?/gm, "").trim();
      html = html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
      html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
      out.push(`<blockquote>${html}</blockquote>`);
      continue;
    }

    // Headings
    const h1 = /^# (.+)$/.exec(rawTrimmed);
    if (h1) {
      let html = h1[1];
      html = html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
      html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
      out.push(`<h1>${html}</h1>`);
      continue;
    }
    const h2 = /^## (.+)$/.exec(rawTrimmed);
    if (h2) { out.push(`<h2>${h2[1]}</h2>`); continue; }
    const h3 = /^### (.+)$/.exec(rawTrimmed);
    if (h3) { out.push(`<h3>${h3[1]}</h3>`); continue; }

    // Tables
    if (/^\|/.test(rawTrimmed)) {
      const rows = rawTrimmed.split("\n").filter((l: string) => !/^\|[- :]+\|$/.test(l.trim()));
      const cells = rows.map((r: string) => {
        const cols = r.split("|").map((c: string) => c.trim()).filter(Boolean);
        return cols.length ? `<tr>${cols.map(c => `<td>${c}</td>`).join("")}</tr>` : "";
      }).filter(Boolean).join("");
      if (cells) out.push(`<table>${cells}</table>`);
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
        return `<li>${text}</li>`;
      }).filter(Boolean).join("");
      out.push(`<ul>${items}</ul>`);
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
      out.push(`<ol>${items}</ol>`);
      continue;
    }

    // Plain paragraph
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

describe("mdToHtml — block-level rendering", () => {
  it("splits h1 from subsequent paragraphs", () => {
    const result = mdToHtml("# Title\n\nSubtitle\n\n**bold** text");
    expect(result).toContain("<h1>Title</h1>");
    expect(result).toContain("<p>Subtitle</p>");
    expect(result).toContain("<strong>bold</strong>");
    // h1 should NOT contain the paragraph content
    const h1match = result.match(/<h1>(.*?)<\/h1>/);
    expect(h1match).toBeTruthy();
    expect(h1match![1]).toBe("Title");
  });

  it("splits h2 from list items", () => {
    const result = mdToHtml("## Heading\n\n- Item 1\n- Item 2\n\n> Quote");
    expect(result).toContain("<h2>Heading</h2>");
    expect(result).toContain("<ul>");
    expect(result).toContain("<li>Item 1</li>");
    expect(result).toContain("<blockquote>");
    // h2 should NOT contain list content
    const h2match = result.match(/<h2>(.*?)<\/h2>/);
    expect(h2match![1]).toBe("Heading");
  });

  it("splits table from surrounding blocks", () => {
    const result = mdToHtml("## Stats\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\nDone.");
    expect(result).toContain("<h2>Stats</h2>");
    expect(result).toContain("<table>");
    expect(result).toContain("<p>Done.</p>");
  });

  it("handles inline formatting only within its block", () => {
    const result = mdToHtml("# **Only** h1\n\nNot **bold** in paragraph");
    // h1 should have bold
    expect(result).toMatch(/<h1>.*<strong>Only<\/strong>.*h1<\/h1>/);
    // paragraph should have its own bold
    expect(result).toMatch(/<p>.*<strong>bold<\/strong>.*<\/p>/);
  });

  it("preserves blockquote content", () => {
    const result = mdToHtml("> Quoted **text**");
    expect(result).toContain("<blockquote>");
    expect(result).toContain("<strong>text</strong>");
  });
});

describe("stylesheet flow through compiler", () => {
  it("preserves stylesheet from frontmatter to compiled root", () => {
    const md = readFileSync(
      resolve(__dirname, "fixtures", "md", "markdown-stylesheet.md"),
      "utf-8"
    );
    const parsed = parseMarkdownDescriptive(md);
    expect(parsed.stylesheet).toBeTruthy();
    expect(parsed.stylesheet).toContain(".test-title h1");

    const compiled = compileDescriptiveRoot(parsed, { mode: "draft" });
    expect(compiled.stylesheet).toBeTruthy();
    expect(compiled.stylesheet).toContain(".test-title h1");
    expect(compiled.stylesheet).toContain(".test-body li");
    expect(compiled.stylesheet).toContain(".test-body blockquote");
  });

  it("marks component jsx contains Markdown with className", () => {
    const md = readFileSync(
      resolve(__dirname, "fixtures", "md", "markdown-stylesheet.md"),
      "utf-8"
    );
    const parsed = parseMarkdownDescriptive(md);

    // Title slide component
    const titleScene = parsed.children[0] as any;
    const titleComp = titleScene.children[0];
    expect(titleComp.jsx).toContain('<Markdown className="test-title"');
    expect(titleComp.jsx).toContain("# Markdown + Stylesheet Test");

    // Body slide component
    const bodyScene = parsed.children[1] as any;
    const bodyComp = bodyScene.children[0];
    expect(bodyComp.jsx).toContain('<Markdown className="test-body"');
    expect(bodyComp.jsx).toContain("## Section Heading");
    expect(bodyComp.jsx).toContain("- **Bullet 1");
    expect(bodyComp.jsx).toContain("> This is a blockquote");
    expect(bodyComp.jsx).toContain("| Name | Value |");
  });
});
