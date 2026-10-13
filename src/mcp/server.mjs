#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { registerAppResource, registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import {
  TOOL_NAME, RESOURCE_URI, PLAYER_ORIGIN, buildPreviewResourceResult, ensureVideoPreview, stopManagedVideoPreview,
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

const registeredPreviewResources = new Set([RESOURCE_URI]);

function ensurePreviewResourceRegistered(resourceUri) {
  if (registeredPreviewResources.has(resourceUri)) return;
  registerAppResource(
    server,
    `Markcut video review ${resourceUri.slice(-12)}`,
    resourceUri,
    { _meta: { ui: { prefersBorder: true, csp: { connectDomains: [PLAYER_ORIGIN], resourceDomains: [], frameDomains: [PLAYER_ORIGIN] } } } },
    async () => buildPreviewResourceResult(resourceUri),
  );
  registeredPreviewResources.add(resourceUri);
}

registerAppTool(
  server,
  TOOL_NAME,
  {
    description: "Show the Markcut video player for a Markdown video definition and ask a human to approve it or request changes.",
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
      ensurePreviewResourceRegistered(preview.resourceUri);
      return {
        content: [{ type: "text", text: `Video ready for review: ${preview.path}` }],
        structuredContent: { ...preview },
        _meta: {
          ui: { resourceUri: preview.resourceUri, props: preview },
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

registerAppResource(
  server,
  "Markcut video review",
  RESOURCE_URI,
  {
    _meta: {
      ui: {
        prefersBorder: true,
        csp: { connectDomains: [PLAYER_ORIGIN], resourceDomains: [], frameDomains: [PLAYER_ORIGIN] },
      },
    },
  },
  async () => buildPreviewResourceResult(),
);

await server.connect(new StdioServerTransport());
