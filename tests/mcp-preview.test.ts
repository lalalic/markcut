import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import vm from "node:vm";
import {
  buildPreviewHtml,
  buildPreviewResourceResult,
  PLAYER_ORIGIN,
  RESOURCE_MIME_TYPE,
  RESOURCE_URI,
  reviewMessage,
  reviewResult,
  validateMarkdownPath,
} from "../src/mcp/preview.mjs";
import { buildPreviewBridgeScript } from "../src/mcp/bridge.mjs";

describe("MarkCut MCP Markdown preview", () => {
  it("requires an absolute .md path", () => {
    expect(() => validateMarkdownPath("notes.md")).toThrow(/absolute/);
    expect(() => validateMarkdownPath("/tmp/notes.txt")).toThrow(/Markdown/);
  });

  it("builds a video-player review UI instead of rendering Markdown", () => {
    const html = buildPreviewHtml();
    expect(html).toContain('id="video-player"');
    expect(html).toContain("Review video");
    expect(html).toContain("Approve");
    expect(html).toContain("Request changes");
    expect(html).toContain("ui/notifications/tool-result");
    expect(html).toContain("previewUrl");
    expect(html).not.toContain("<article>");
  });

  it("returns Codex-compatible private no-cache resource metadata", () => {
    const result = buildPreviewResourceResult();
    expect(result.ttlMs).toBe(0);
    expect(result.cacheScope).toBe("private");
    expect(result.contents).toHaveLength(1);
    expect(result.contents[0]).toMatchObject({
      uri: RESOURCE_URI,
      mimeType: RESOURCE_MIME_TYPE,
    });
    expect(result.contents[0].text).toContain("ui/initialize");
    expect(result.contents[0].text).toContain("ui/notifications/initialized");
    expect(result.contents[0]._meta.ui.csp.frameDomains).toEqual([PLAYER_ORIGIN]);
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
        appInfo: { name: "Markcut Preview", version: "1.1.0" },
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

    harness.toolResult({ path: "/tmp/video.md", previewUrl: PLAYER_ORIGIN + "/" });
    await tick();
    expect(harness.elements.player.src).toBe(PLAYER_ORIGIN + "/");
    expect(harness.elements.pathLabel.textContent).toBe("/tmp/video.md");

    harness.elements.approve.onclick();
    expect(harness.messages[2]).toMatchObject({ id: 2, method: "tools/call" });
    expect(harness.messages).not.toContainEqual(expect.objectContaining({ method: "ui/message" }));
    harness.respond({ id: 2, result: { structuredContent: { decision: "approved" } } });
    await tick();
    expect(harness.messages[3]).toMatchObject({ method: "ui/message" });
    expect(new Set(harness.messages.filter((message) => "id" in message).map((message) => message.id)).size).toBe(3);
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
    player: element(),
    pathLabel: element(),
    approve: element(),
    changes: element(),
  };
  const parent = { postMessage(message: any) { messages.push(message); } };
  const document = {
    getElementById(id: string) {
      if (id === "feedback") return elements.feedback;
      if (id === "status") return elements.status;
      if (id === "video-player") return elements.player;
      if (id === "path-label") return elements.pathLabel;
      if (id === "approve") return elements.approve;
      return elements.changes;
    },
  };
  const window = { parent, addEventListener(_type: string, listener: (event: any) => void) { listeners.push(listener); } };
  const context = vm.createContext({ window, document, setTimeout, fetch: async () => ({ ok: true, json: async () => ({ ready: true }) }) });
  return {
    messages,
    elements,
    run() { vm.runInContext(buildPreviewBridgeScript("markcut.preview.submit"), context); },
    dispatch(event: any) { listeners.forEach((listener) => listener(event)); },
    respond(message: any) { this.dispatch({ source: parent, data: { jsonrpc: "2.0", ...message } }); },
    toolResult(structuredContent: any) { this.dispatch({ source: parent, data: { jsonrpc: "2.0", method: "ui/notifications/tool-result", params: { result: { structuredContent } } } }); },
  };
}
