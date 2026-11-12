# Codex / terminal → Neo Mobile Event Preview

On **Neo Master**, with a current managed Relay Task execution context, create a JSON Event Template according to `agents-relay/skills/agents-relay/contracts/event-contract.md`. **Do not invent Job/Task/Execution identity.** Use the exact execution identity supplied by Relay, without manufacturing an invocation ID; the Task execution ID is authoritative. Do not prefill `decision`, `feedback`, `comments`, `revision`, `contentHash`, `revisionId`, `previewId`, `requestId`, or `idempotencyKey`.

Example illustrative template file (`/tmp/review-event.json`; replace placeholders with actual Relay Task values):

```json
{
  "type": "task.interactive_decision",
  "source": "job/<jobId>/task/<taskId>/execution/<executionId>",
  "data": {
    "interactive": {
      "jobId": "<jobId>",
      "taskId": "<taskId>",
      "executionId": "<executionId>"
    }
  }
}
```

Run:

```sh
markcut verify /absolute/video.md
markcut preview /absolute/video.md --delivery event --event-template /tmp/review-event.json
```

The CLI submits the request through Neo's installed wrapper. The wrapper keeps a
30-day pending-delivery queue; NeoY sends an APNs wake-up hint. The phone
acquires through authenticated `review.preview.acquire` and stores its own
history. Options: `--delivery`, `--event-template`, `--timeout-ms`.

It starts the same detached Markcut MCP compile worker, waits for an immutable revision, and stores the request in Neo Wrapper. On durable storage it prints JSON, including `status: "review_requested"`, `requestId`, `contentHash`, and `revisionId`. It **does not wait for a human decision**. The phone can be offline or Neo can be suspended. The wrapper stores the delivery request, with APNs as a best-effort wake-up hint.
Neo Mobile acknowledges only after its local persistent import, and retains
its own history. If the wrapper cannot persist the request, CLI delivery fails. Phone users can inspect the compiled scenes and submit `approved` or `changes_requested`, which publishes `task.interactive_decision` through the existing authenticated Events MCP. The Event's `data.interactive` includes the exact reviewed hash, scene/timestamp comments, and idempotency key.

Relay's Event receiver and Graph decide whether to resume/revise the original Task. **A successful phone enqueue is not a human approval or a resumed Codex thread.** Do not mark the Task complete until a real human decision was correlated to the correct immutable revision and the downstream workflow actually completed. For a local browser-only preview, omit `--delivery event` and use normal `markcut preview`.
