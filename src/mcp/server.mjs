#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema, ListResourcesRequestSchema, ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  TOOL_NAME, SUBMIT_TOOL_NAME, RESOURCE_URI, buildPreviewHtml, readMarkdownPreview, reviewResult,
} from "./preview.mjs";

const server = new Server(
  { name: "markcut", version: "3.2.0" },
  { capabilities: { tools: {}, resources: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{
    name: TOOL_NAME,
    description: "Ask a human to review a Markdown file and return an approval or requested changes.",
    inputSchema: {
      type: "object", properties: { path: { type: "string", description: "Absolute path to a .md file" } },
      required: ["path"], additionalProperties: false,
    },
    _meta: { "ui/resourceUri": RESOURCE_URI, ui: { resourceUri: RESOURCE_URI } },
  }, {
    name: SUBMIT_TOOL_NAME,
    description: "Submit the review decision from the Markdown preview UI.",
    inputSchema: {
      type: "object",
      properties: {
        decision: { type: "string", enum: ["approved", "changes_requested"] },
        feedback: { type: "string" },
      },
      required: ["decision"], additionalProperties: false,
    },
    _meta: { ui: { visibility: ["app"] } },
  }],
}));

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [{ uri: RESOURCE_URI, name: "MarkCut Markdown review", mimeType: "text/html;profile=mcp-app" }],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => ({
  contents: [{ uri: RESOURCE_URI, mimeType: "text/html;profile=mcp-app", text: buildPreviewHtml({ path: "", markdown: "" }) }],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const input = request.params.arguments ?? {};
    if (request.params.name === SUBMIT_TOOL_NAME) {
      const decision = reviewResult(input.decision, input.feedback);
      return { content: [{ type: "text", text: JSON.stringify(decision) }], structuredContent: decision };
    }
    if (request.params.name !== TOOL_NAME) throw new Error(`unknown tool: ${request.params.name}`);
    const { path, markdown } = await readMarkdownPreview(input.path);
    return {
      content: [{ type: "text", text: `Markdown ready for review: ${path}` }],
      structuredContent: { path, markdown, resourceUri: RESOURCE_URI },
      _meta: {
        "ui/resourceUri": RESOURCE_URI,
        ui: { resourceUri: RESOURCE_URI, props: { path, markdown } },
      },
    };
  } catch (error) {
    return { isError: true, content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }] };
  }
});

await server.connect(new StdioServerTransport());
