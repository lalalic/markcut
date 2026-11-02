#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { registerAppResource, registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import {publishPreviewRevision,publishPlayerBundle,publicOrigin} from "./remote-assets.mjs";
import {startCompileOperation} from "./compile-operation.mjs";
import {decideReviewSession,getReviewMedia,getReviewSession,listReviewSessions} from "./review-sessions.mjs";
import {fileURLToPath} from "node:url";
import {
  TOOL_NAME, RESOURCE_URI, LEGACY_RESOURCE_URIS, buildPreviewResourceResult, previewCsp, getPreviewMedia, ensureVideoPreview, stopManagedVideoPreview,
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

server.registerTool("markcut.review.list", {
  description:"List durable Markcut review sessions for the linked Neo Mobile Review Inbox. Sessions remain pending across disconnects; a decision is final only for the returned content hash.",
  inputSchema:z.object({after:z.string().optional(),limit:z.number().int().min(1).max(100).optional()}),
  _meta:{ui:{visibility:["app","model"]}},
}, async ({after,limit}) => ({content:[{type:"text",text:"Markcut review inbox"}],structuredContent:listReviewSessions({after,limit})}));

server.registerTool("markcut.review.get", {
  description:"Read a durable Markcut review session and its final decision. Originating agents should poll until compilation is ready and check again after a human review; use the session ID returned by markcut.preview. Relay correlation is included for routing the final decision.",
  inputSchema:z.object({sessionId:z.string().uuid()}),
  _meta:{ui:{visibility:["app","model"]}},
}, async ({sessionId}) => {
  const session=getReviewSession(sessionId);
  return session ? {content:[{type:"text",text:"Review session"}],structuredContent:{session}}
    : {isError:true,content:[{type:"text",text:"Unknown review session"}]};
});

server.registerTool("markcut.review.media", {
  description:"Read the compiled scene tree for a Markcut review session in the linked mobile previewer.",
  inputSchema:z.object({sessionId:z.string().uuid(),contentHash:z.string().regex(/^[a-f0-9]{64}$/)}),
  _meta:{ui:{visibility:["app"]}},
}, async ({sessionId,contentHash}) => {
  try {
    const media=getReviewMedia(sessionId,contentHash);
    media.playerUrl=publishPlayerBundle(fileURLToPath(new URL("./remotion-app.bundle.js",import.meta.url)),publicOrigin());
    return {content:[{type:"text",text:"Compiled preview ready"}],structuredContent:media};
  }
  catch(error) { return {isError:true,content:[{type:"text",text:error.message||String(error)}]}; }
});

server.registerTool("markcut.review.decide", {
  description:"Submit the one final approval or changes-requested decision for the latest compiled Markcut revision. Decisions are durable and idempotent; stale hashes are rejected.",
  inputSchema:z.object({sessionId:z.string().uuid(),contentHash:z.string().regex(/^[a-f0-9]{64}$/),decision:z.enum(["approved","changes_requested"]),comments:z.array(z.record(z.string(),z.any())).optional(),idempotencyKey:z.string()}),
  _meta:{ui:{visibility:["app","model"]}},
}, async (args) => {
  try { return {content:[{type:"text",text:"Review decision saved"}],structuredContent:decideReviewSession({...args,comments:args.comments||[]})}; }
  catch(error) { return {isError:true,content:[{type:"text",text:error.message||String(error)}]}; }
});

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
    description: "Compile a video and create or reuse its durable Markcut Review Session for the linked Neo Mobile Review Inbox and this hosted preview. Returns accepted submission, not approval. After submission, check markcut.review.get for the final decision; changes_requested requires editing the original Markdown and calling markcut.preview again. Approval applies only to its exact contentHash.",
    inputSchema: z.object({
      path: z.string().describe("Absolute .md path or NeoY HTTPS mounted file URL"),
      relay: z.object({jobId:z.string(),taskId:z.union([z.string(),z.number()]),executionId:z.string().optional()}).optional().describe("Optional Agents Relay task correlation. No Relay dependency for standalone ChatGPT/Work reviews."),
    }),
    _meta: {
      ui: { resourceUri: RESOURCE_URI },
    },
  },
  async ({ path, relay }) => {
    try {
      const operation=startCompileOperation(path,relay);
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
