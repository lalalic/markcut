import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildPreviewHtml, readMarkdownPreview, reviewMessage, reviewResult, validateMarkdownPath } from "../src/mcp/preview.mjs";

describe("MarkCut MCP Markdown preview", () => {
  it("requires an absolute .md path", () => {
    expect(() => validateMarkdownPath("notes.md")).toThrow(/absolute/);
    expect(() => validateMarkdownPath("/tmp/notes.txt")).toThrow(/Markdown/);
  });

  it("reads Markdown and builds a reviewable UI resource", async () => {
    const directory = mkdtempSync(join(tmpdir(), "markcut-mcp-"));
    const path = join(directory, "review.md");
    writeFileSync(path, "# Hello\n\nThis is a review.");
    const preview = await readMarkdownPreview(path);
    const html = buildPreviewHtml(preview);
    expect(preview.markdown).toContain("# Hello");
    expect(html).toContain("This is a review.");
    expect(html).toContain("Approve");
    expect(html).toContain("Request changes");
    expect(html).toContain("ui/initialize");
    expect(html).toContain("ui/notifications/tool-result");
    expect(html).toContain("tools/call");
    expect(html).toContain("ui/message");
    expect(html).toContain("review.md");
  });

  it("returns approved", () => {
    expect(reviewResult("approved")).toEqual({ decision: "approved" });
  });

  it("requires non-empty feedback for requested changes", () => {
    expect(() => reviewResult("changes_requested", "  ")).toThrow(/feedback is required/);
    expect(reviewResult("changes_requested", " Fix the title ")).toEqual({
      decision: "changes_requested", feedback: "Fix the title",
    });
  });

  it("formats decisions as an MCP Apps ui/message notification", () => {
    expect(reviewMessage({ decision: "approved" })).toEqual({
      jsonrpc: "2.0",
      method: "ui/message",
      params: { role: "user", content: [{ type: "text", text: '{"decision":"approved"}' }] },
    });
    expect(reviewMessage({ decision: "changes_requested", feedback: "Fix the title" }).params.content[0].text)
      .toBe('{"decision":"changes_requested","feedback":"Fix the title"}');
  });
});
