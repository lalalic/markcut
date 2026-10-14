#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { registerAppResource, registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import {
  TOOL_NAME, RESOURCE_URI, LEGACY_RESOURCE_URIS, buildPreviewResourceResult, getPreviewMedia, ensureVideoPreview, stopManagedVideoPreview,
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
      return {content:[{type:"text",text:"Preview media ready"}], structuredContent:getPreviewMedia(contentHash)};
    } catch (error) {
      return {isError:true,content:[{type:"text",text:error.message||String(error)}]};
    }
  },
);

registerAppTool(
  server,
  TOOL_NAME,
  {
    description: "Show the Markcut video player for a Markdown video definition and ask a human to approve it or request changes. When a review ui/message arrives with decision=changes_requested, edit the supplied path using feedback and call markcut.preview again with the same path; do not consider it approved. When decision=approved, treat only that contentHash/revisionId as approved and stop the review loop. Never approve a newer revision from an older message.",
    inputSchema: z.object({
      path: z.string().describe("Absolute path to a .md file"),
    }),
    _meta: {
      ui: { resourceUri: RESOURCE_URI },
    },
  },
  async ({ path }) => {
    try {
      const preview = await ensureVideoPreview(path);
      // Deliver bytes with the initiating tool result; MCP App tool re-requests
      // are not consistently routable through the ChatGPT federation host.
      const media = getPreviewMedia(preview.contentHash);
      const payload = { ...preview, ...media };
      return {
        content: [{ type: "text", text: `Video ready for review: ${preview.path}` }],
        structuredContent: payload,
        _meta: {
          ui: { resourceUri: preview.resourceUri, props: payload },
          "ui/resourceUri": preview.resourceUri,
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
          csp: { connectDomains: [], resourceDomains: [], frameDomains: [] },
        },
      },
    },
    async () => buildPreviewResourceResult(uri),
  );
}

await server.connect(new StdioServerTransport());
