#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { registerAppResource, registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import {normalizeReviewConfig} from "./review-delivery.mjs";
import {publishPreviewRevision,publishPlayerBundle,publicOrigin} from "./remote-assets.mjs";
import {fileURLToPath} from "node:url";
import {startCompileOperation} from "./compile-operation.mjs";
import {
  TOOL_NAME, RESOURCE_URI, LEGACY_RESOURCE_URIS, buildPreviewResourceResult, previewCsp, getPreviewMedia, stopManagedVideoPreview,
} from "./preview.mjs";

const server = new McpServer({ name: "markcut", version: "3.2.0" });
process.once("exit", stopManagedVideoPreview);
// Stdio clients commonly terminate the server via SIGTERM rather than EOF.
// Node's default signal termination does not reliably run exit handlers.
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.once(signal, () => { stopManagedVideoPreview(); process.exit(0); });
}
process.stdin.once("end", stopManagedVideoPreview);
process.stdin.once("close", stopManagedVideoPreview);

// Discoverable at federation startup: unlike dynamically added resource URIs,
// an app-only tool remains routable for every independently identified preview.
server.registerTool(
  "markcut.preview.media",
  {
    description: "Read compiled Remotion scene data for an existing Markcut preview revision.",
    inputSchema: z.object({contentHash:z.string().regex(/^[a-f0-9]{64}$/)}),
    _meta: { ui: { visibility: ["app"] } },
  },
  async ({contentHash}) => {
    try {
      // Mobile clients need the current published player without a server-owned
      // review session. Both resources are immutable and keyed by contentHash.
      const media=getPreviewMedia(contentHash);
      media.playerUrl=publishPlayerBundle(fileURLToPath(new URL("./remotion-app.bundle.js",import.meta.url)),publicOrigin());
      return {content:[{type:"text",text:"Preview media ready"}], structuredContent:media};
    } catch (error) {
      return {isError:true,content:[{type:"text",text:error.message||String(error)}]};
    }
  },
);

registerAppTool(
  server,
  TOOL_NAME,
  {
    description: "Compile and publish an immutable Markcut preview revision for this ChatGPT conversation. Review delivery defaults to ui/message, or submits an authorized caller-bound event when explicitly configured. Event-mode decisions bind only the current Relay Task execution; compiled media is used for playback.",
    inputSchema: z.object({
      path: z.string().describe("Absolute .md path or NeoY HTTPS mounted file URL; Neo Wrapper also accepts single local image/audio/video files"),
      readonly: z.boolean().optional().describe("View-only preview: no review controls, Relay binding, Git checkpoint, or mobile review notification."),
      review: z.object({delivery:z.enum(["text","event"]).optional(),eventTemplate:z.object({type:z.string(),source:z.string(),data:z.record(z.string(),z.unknown())}).optional(),
        relay:z.object({jobId:z.string(),taskId:z.union([z.string(),z.number()]),executionId:z.string().optional()}).optional().describe("Optional managed review correlation; no Relay needed for standalone review."),
      }).optional(),
    }),
    _meta: {
      ui: { resourceUri: RESOURCE_URI },
    },
  },
  async ({ path, review, readonly }) => {
    const relay=review?.relay;
    try {
      if (readonly && review !== undefined)
        throw new Error("Read-only preview cannot request Relay or review delivery");
      const config={...normalizeReviewConfig(review),...(readonly ? {readonly:true} : {})};
      const operation=startCompileOperation(path,relay,config);
      const payload={...operation,...(relay ? {relay} : {})};
      return {
        content: [{ type: "text", text: `Compilation started: ${operation.path}` }],
        structuredContent: payload,
        _meta: {
          ui: { resourceUri: RESOURCE_URI, props: payload },
          "ui/resourceUri": RESOURCE_URI,
        },
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
      };
    }
  },
);

// All historical static entrypoints resolve to the latest bridge/player HTML.
// Register at startup so federation can discover every alias.
for (const uri of [RESOURCE_URI, ...LEGACY_RESOURCE_URIS]) {
  registerAppResource(
    server,
    `Markcut video review (latest; alias ${uri})`,
    uri,
    {
      _meta: {
        ui: {
          prefersBorder: true,
          csp: previewCsp(),
        },
      },
    },
    async () => buildPreviewResourceResult(uri),
  );
}

await server.connect(new StdioServerTransport());
