#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { registerAppResource, registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import {
  TOOL_NAME, SUBMIT_TOOL_NAME, RESOURCE_URI, PLAYER_ORIGIN, buildPreviewResourceResult, ensureVideoPreview, reviewResult,
} from "./preview.mjs";

const server = new McpServer({ name: "markcut", version: "3.2.0" });

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
      return {
        content: [{ type: "text", text: `Video ready for review: ${preview.path}` }],
        structuredContent: { ...preview, resourceUri: RESOURCE_URI },
        _meta: {
          ui: { resourceUri: RESOURCE_URI, props: preview },
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

registerAppTool(
  server,
  SUBMIT_TOOL_NAME,
  {
    description: "Submit the review decision from the Markcut video preview UI.",
    inputSchema: z.object({
      decision: z.enum(["approved", "changes_requested"]),
      feedback: z.string().optional(),
    }),
    _meta: {
      ui: { visibility: ["app"] },
    },
  },
  async ({ decision, feedback }) => {
    try {
      const result = reviewResult(decision, feedback);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
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
