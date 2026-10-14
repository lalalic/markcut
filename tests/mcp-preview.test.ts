import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import vm from "node:vm";
import { EventEmitter } from "node:events";
import {
  buildPreviewHtml,
  buildPreviewResourceResult,
  getPreviewMedia,
  ensureVideoPreview,
  previewResourceUri,
  stopManagedVideoPreview,
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
    expect(html).toContain("controls playsinline");
    expect(html).toContain("data:video/mp4;base64,");
    expect(html).not.toContain("createObjectURL");
    expect(html).not.toContain("<iframe");
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
    expect(result.contents[0]._meta.ui.csp.frameDomains).toEqual([]);
    expect(result.contents[0].text).not.toContain("127.0.0.1");
  });

  it("reads revision-specific media using the static app-only tool without localhost or blob URLs", async () => {
    const h = createBridgeHarness();
    h.run();
    h.respond({id:1,result:{hostInfo:{name:"test",version:"1"},hostCapabilities:{},protocolVersion:"2026-01-26"}});
    await tick();
    const contentHash="a".repeat(64);
    h.toolResult({id:"a",revisionId:"a",contentHash,previewUrl:"http://127.0.0.1:4571/p/a/",resourceUri:RESOURCE_URI});
    expect(h.messages.at(-1)).toMatchObject({id:2,method:"tools/call",params:{name:"markcut.preview.media",arguments:{contentHash}}});
    h.respond({id:2,result:{structuredContent:{videoBase64:"YQ==",posterBase64:"Yg=="}}});
    await tick();
    expect(h.elements.player.src).toBe("data:video/mp4;base64,YQ==");
    expect(h.elements.player.poster).toBe("data:image/jpeg;base64,Yg==");
    expect(h.messages.filter(m=>m.method==="tools/call")).toHaveLength(1);
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
        appInfo: { name: "Markcut Preview", version: "1.2.0" },
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

    harness.toolResult({ path: "/tmp/video.md", previewUrl: PLAYER_ORIGIN + "/p/instance/", id: "instance", revisionId: "revision", contentHash: "hash" });
    await tick();
    expect(harness.messages[2]).toMatchObject({ id: 2, method: "tools/call" });
    harness.respond({ id: 2, result: { structuredContent: {videoBase64:"YQ==",posterBase64:"Yg=="} } });
    await tick();
    expect(harness.elements.player.src).toBe("data:video/mp4;base64,YQ==");
    expect(harness.elements.pathLabel.textContent).toBe("/tmp/video.md");

    harness.elements.approve.onclick();
    expect(harness.messages[3]).toMatchObject({ id: 3, method: "ui/message" });
    expect(JSON.parse(harness.messages[3].params.content[0].text)).toEqual({previewId:"instance",revisionId:"revision",contentHash:"hash",decision:"approved"});
    expect(harness.messages.filter(m => m.method === "tools/call")).toHaveLength(1);
    harness.elements.approve.onclick();
    expect(harness.messages.filter(m => m.method === "ui/message")).toHaveLength(1);
    harness.respond({ id: 3, result: {} });
    await tick();
    expect(harness.elements.status.textContent).toBe("Approved.");
    expect(new Set(harness.messages.filter((message) => "id" in message).map((message) => message.id)).size).toBe(3);
  });

  it("surfaces submit errors without sending a decision message and rejects invalid bridge messages", async () => {
    const harness = createBridgeHarness();
    harness.run();
    harness.dispatch({ source: {}, data: { jsonrpc: "2.0", id: 1, result: {} } });
    expect(harness.elements.status.textContent).toBe("");
    harness.respond({ id: 1, result: {} });
    await tick();
    harness.toolResult({ id:"instance", revisionId:"revision", contentHash:"hash", previewUrl:PLAYER_ORIGIN+"/p/instance/" });
    harness.respond({ id: 2, result: { structuredContent: {videoBase64:"YQ==",posterBase64:"Yg=="} } });
    await tick();
    harness.elements.changes.onclick();
    expect(harness.elements.status.textContent).toBe("Feedback is required.");
    harness.elements.feedback.value = "Fix the title";
    harness.elements.changes.onclick();
    harness.respond({ id: 3, error: { message: "submit failed" } });
    await tick();
    expect(harness.elements.status.textContent).toBe("submit failed");
    expect(harness.messages.filter((message) => message.method === "ui/message")).toHaveLength(1);
  });
  it("gives distinct revisions distinct app resource URIs", () => {
    const v1 = previewResourceUri("hash-v1");
    const v2 = previewResourceUri("hash-v2");
    expect(v1).not.toBe(v2);
    expect(v1).toBe(`${RESOURCE_URI}/hash-v1`);
    expect(v2).toBe(`${RESOURCE_URI}/hash-v2`);
  });

  it("serves independent revisions behind the shared preview origin", async () => {
    const root = mkdtempSync(join(tmpdir(), "markcut-mcp-multi-"));
    const a = join(root, "a.md");
    const b = join(root, "b.md");
    writeFileSync(a, "# video\nwidth:320 height:240 fps:15\n## Scene-A\n- component duration:1 jsx:\"<div style={{color:'white'}}>A</div>\"\n");
    writeFileSync(b, "# video\nwidth:320 height:240 fps:15\n## Scene-B\n- component duration:1 jsx:\"<div style={{color:'white'}}>B</div>\"\n");
    const one = await ensureVideoPreview(a);
    const two = await ensureVideoPreview(b);
    expect(one.previewUrl).toMatch(/^http:\/\/127\.0\.0\.1:4571\/p\/[0-9a-f-]{36}\/$/);
    expect(two.previewUrl).toMatch(/^http:\/\/127\.0\.0\.1:4571\/p\/[0-9a-f-]{36}\/$/);
    expect(one.previewUrl).not.toBe(two.previewUrl);
    expect(one.resourceUri).toBe(RESOURCE_URI);
    expect(two.resourceUri).toBe(RESOURCE_URI);
    expect(buildPreviewResourceResult().contents[0].text).not.toContain("data-video-base64=");
    const mediaA=getPreviewMedia(one.contentHash);
    const mediaB=getPreviewMedia(two.contentHash);
    expect(mediaA.videoBase64).not.toBe(mediaB.videoBase64);
    expect(mediaA.posterBase64).toBeTruthy();
    expect(() => getPreviewMedia("f".repeat(64))).toThrow(/Unknown/);
    for (const preview of [one, two]) {
      const resource = buildPreviewResourceResult(preview.resourceUri).contents[0].text;
      expect(resource).toContain("data:video/mp4;base64,");
      expect(getPreviewMedia(preview.contentHash).videoBase64).toBeTruthy();
      expect(resource).not.toContain("127.0.0.1");
    }
    stopManagedVideoPreview();
  });

});

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function createBridgeHarness() {
  const messages: any[] = [];
  const listeners: ((event: any) => void)[] = [];
  const element = (value = "") => ({ value, src:"", dataset:{}, textContent: "", innerHTML: "", onclick: undefined as (() => void) | undefined, getAttribute(_name:string){return this.src||null;}, addEventListener(_event:string,_cb:unknown){}, readyState:0, poster:"", load(){}, removeAttribute(name:string){if(name==="data-video-base64")delete this.dataset.videoBase64;}, focus() {} });
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
