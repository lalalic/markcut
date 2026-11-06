# Codex / terminal → Neo Mobile Event Preview

On **Neo Master**, with a current managed Relay Task execution context, create a JSON Event Template according to `agents-relay/skills/agents-relay/contracts/event-contract.md`. **Do not invent Job/Task/Execution identity.** Use the exact execution identity supplied by Relay, and a stable, unique `invocationId` for each new video review request. Do not prefill `decision`, `feedback`, `comments`, `revision`, `contentHash`, `revisionId`, `previewId`, `requestId`, or `idempotencyKey`.

Example illustrative template file (`/tmp/review-event.json`; replace placeholders with actual Relay Task values):

```json
{
  "type": "task.interactive_decision",
  "source": "job/<jobId>/task/<taskId>/execution/<executionId>",
  "data": {
    "interactive": {
      "jobId": "<jobId>",
      "taskId": "<taskId>",
      "executionId": "<executionId>",
      "invocationId": "<unique-review-request-id>"
    }
  }
}
```

Run:

```sh
markcut verify /absolute/video.md
markcut preview /absolute/video.md --delivery event --event-template /tmp/review-event.json
```

The CLI auto-discovers the `neox` `_mcp._tcp` service on the local network. Override if necessary with `--phone-url http://<trusted-phone>.local:9223/mcp` or `NEOX_MCP_URL`. Options: `--title`, `--group-id`, `--group-title`, `--request-id <UUID>`, `--timeout-ms`.

It starts the same detached Markcut MCP compile worker, waits for an immutable revision, and calls the phone's `review.request`. On phone acceptance it prints JSON, including `status: "review_requested"`, `requestId`, `contentHash`, and `revisionId`. It **does not wait for a human decision**. The phone must have the Neo app running and reachable; offline delivery is not supported by this CLI. A rejected/missing ACK exits nonzero. If reattempting after an uncertain ACK, supply the **same** request UUID to avoid duplicate phone requests. Phone users can inspect the compiled scenes and submit `approved` or `changes_requested`, which publishes `task.interactive_decision` through the existing authenticated Events MCP. The Event's `data.interactive` includes the exact reviewed hash, scene/timestamp comments, and idempotency key.

Relay's Event receiver and Graph decide whether to resume/revise the original Task. **A successful phone enqueue is not a human approval or a resumed Codex thread.** Do not mark the Task complete until a real human decision was correlated to the correct immutable revision and the downstream workflow actually completed. For a local browser-only preview, omit `--delivery event` and use normal `markcut preview`.
