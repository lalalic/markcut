import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import vm from "node:vm";
import { buildPreviewHtml, readMarkdownPreview, reviewMessage, reviewResult, validateMarkdownPath } from "../src/mcp/preview.mjs";
import { buildPreviewBridgeScript } from "../src/mcp/bridge.mjs";

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

  it("performs the MCP Apps handshake and awaits a successful submit", async () => {
    const harness = createBridgeHarness();
    harness.run();
    expect(harness.messages[0]).toEqual({
      jsonrpc: "2.0",
      id: 1,
      method: "ui/initialize",
      params: {
        appInfo: { name: "Markcut Preview", version: "1.0.0" },
        appCapabilities: {},
        protocolVersion: "2026-01-26",
      },
    });
    expect(harness.messages.some((message) => message.method === "ui/notifications/initialized")).toBe(false);
    harness.respond({
      id: 1,
      result: {
        protocolVersion: "2026-01-26",
        hostInfo: { name: "test-host", version: "1" },
        hostCapabilities: {},
        hostContext: {},
      },
    });
    await tick();
    expect(harness.messages[1]).toMatchObject({ method: "ui/notifications/initialized" });

    harness.elements.approve.onclick();
    expect(harness.messages[2]).toMatchObject({ id: 2, method: "tools/call" });
    expect(harness.messages).not.toContainEqual(expect.objectContaining({ method: "ui/message" }));
    harness.respond({ id: 2, result: { structuredContent: { decision: "approved" } } });
    await tick();
    expect(harness.messages[3]).toMatchObject({ method: "ui/message" });
    expect(new Set(harness.messages.filter((message) => "id" in message).map((message) => message.id)).size).toBe(2);
  });

  it("surfaces submit errors without sending a decision message and rejects invalid bridge messages", async () => {
    const harness = createBridgeHarness();
    harness.run();
    harness.dispatch({ source: {}, data: { jsonrpc: "2.0", id: 1, result: {} } });
    expect(harness.elements.status.textContent).toBe("");
    harness.respond({ id: 1, result: {} });
    await tick();
    harness.elements.changes.onclick();
    expect(harness.elements.status.textContent).toBe("Feedback is required.");
    harness.elements.feedback.value = "Fix the title";
    harness.elements.changes.onclick();
    harness.respond({ id: 2, error: { message: "submit failed" } });
    await tick();
    expect(harness.elements.status.textContent).toBe("submit failed");
    expect(harness.messages.some((message) => message.method === "ui/message")).toBe(false);
  });
});

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function createBridgeHarness() {
  const messages: any[] = [];
  const listeners: ((event: any) => void)[] = [];
  const element = (value = "") => ({ value, textContent: "", innerHTML: "", onclick: undefined as (() => void) | undefined, focus() {} });
  const elements = {
    feedback: element(),
    status: element(),
    article: element(),
    pathLabel: element(),
    approve: element(),
    changes: element(),
  };
  const parent = { postMessage(message: any) { messages.push(message); } };
  const document = {
    getElementById(id: string) { return id === "feedback" ? elements.feedback : id === "status" ? elements.status : id === "approve" ? elements.approve : elements.changes; },
    querySelector(selector: string) { return selector === "article" ? elements.article : elements.pathLabel; },
  };
  const window = { parent, addEventListener(_type: string, listener: (event: any) => void) { listeners.push(listener); } };
  const context = vm.createContext({ window, document });
  return {
    messages,
    elements,
    run() { vm.runInContext(buildPreviewBridgeScript("markcut.preview.submit"), context); },
    dispatch(event: any) { listeners.forEach((listener) => listener(event)); },
    respond(message: any) { this.dispatch({ source: parent, data: { jsonrpc: "2.0", ...message } }); },
  };
}
