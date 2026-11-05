# Feature Specification: Preview Review Delivery (Text / Event)

**Library:** Markcut (`markcut.preview` and Neo Mobile review clients)
**Created:** 2026-11-05
**Status:** Proposed — specification only; not implemented
**Decision:** Use exactly two delivery modes, `text` and `event`. No callback registry, callback dispatcher, or Markcut-owned Relay workflow.

## Goal and boundaries

Let the same Markcut Preview player collect human review decisions, scene/timestamp comments, and immutable video revision identity, then deliver that result through the caller's selected transport. Markcut owns preview/review interaction, not the decision about how to revise a video, resume an Agent, or advance a Relay Job.

- `text` (default): send the Review Result to the opening Agent conversation using the existing MCP App `ui/message` route.
- `event`: the caller supplies an event template to the Markcut Provider. On Submit, the Preview UI fills the review-only fields and publishes it through the existing authorized Events MCP tool. The event consumer (Relay or another application) decides what to do next.
- Neo Mobile supports the same two modes and the same Review Result. It uses its already authenticated Neo MCP connection for event delivery and its existing Agent-turn route for text delivery.
- Do not add `callback`, a callback dispatcher, a Markcut review inbox, or direct Relay SQLite/Graph access inside Markcut.

## User stories and acceptance scenarios

### US-1: Review a video in a direct Agent conversation (P1)

1. Given `markcut.preview({path})` without delivery options, when the viewer submits `approved` or `changes_requested`, then one structured Review Result is sent with `ui/message` to the opening conversation.
2. Given unsaved scene/timestamp comments, when the viewer requests changes, then submission requires explicit actionable feedback and includes the selected scene/time context.
3. Given a superseded revision, when a viewer tries to submit, then the UI refuses and displays the historical/read-only state; an old approval never approves newer content.

### US-2: Publish human review as a caller-owned Event (P1)

1. Given a Preview created with `delivery: "event"` and a valid provider-bound `eventTemplate`, when the viewer submits, then the UI fills only the reserved review payload fields and calls the authorized Events MCP publish tool.
2. Given a successful publish acknowledgement, when the UI reports completion, then it says the feedback was **submitted**, not that Relay processed it or that an Agent fixed the video.
3. Given a temporary publish error or lost acknowledgement, when submission is retried, then the same stable idempotency key is reused; the downstream consumer must deduplicate equivalent review decisions.
4. Given missing event-tool access, invalid authorization/template, or a stale revision, when the viewer submits, then the UI reports a failure and does not silently fall back to `text` or claim success.

### US-3: Submit the same review from Neo Mobile (P1)

1. Given a mobile review request carrying `delivery` and the frozen event template, when the user taps Approve or Request Changes, then Neo Mobile sends the same schema as the web Preview via its authenticated `events publish` tool.
2. Given `text`, when the user submits, then Neo Mobile uses the owning Agent's supported New Turn route without requiring Relay.
3. Given intermittent connectivity, when a queued review is retried after reconnect or relaunch, then the original request ID, video identity and idempotency key are preserved.
4. Given a new published video revision, when the user views history, then approval of an older revision remains scoped to that older `contentHash` and `revisionId`.

## Public contract (proposed)

### Preview request

```js
// Default: text mode; backward compatible.
markcut.preview({ path: "/absolute/video.md" });

// Event mode: caller supplies the template; Provider binds it to this preview.
markcut.preview({
  path: "/absolute/video.md",
  review: {
    delivery: "event",
    eventTemplate: {
      type: "markcut.review.submitted",
      source: "job/<job-id>/task/<task-id>/execution/<execution-id>",
      data: { correlation: { /* caller-owned opaque values */ } }
    }
  }
});
```

The event `source` above illustrates a caller-provided Relay execution identity, **not** a value invented by Markcut or the UI. The caller is responsible for establishing this identity and its permission to emit the review event. For standalone callers, use the authorized source scheme supported by the selected event service. The template is a delivery envelope, not executable code.

### Provider → UI / mobile

The Provider freezes the delivery choice, event template (if any), and preview identifiers with the published immutable revision. Both clients receive the identical logical configuration. Delivery changes require a new authorized preview request; the UI must not choose its own event destination, event type, source, or correlation fields.

### Normalized Review Result

```json
{
  "requestId": "review-request-id",
  "previewId": "preview-id",
  "revisionId": "immutable-revision-id",
  "contentHash": "64-character-sha256-hex",
  "decision": "changes_requested",
  "comments": [
    { "sceneId": "opening", "timeSeconds": 3.2, "text": "Shorten the opening by two seconds" }
  ],
  "idempotencyKey": "stable-per-submission-key"
}
```

`decision` is either `approved` or `changes_requested`. Approved reviews do not include unsent draft comments. Keep existing overall-comment and playback-context fields where applicable; this example shows the minimum scene-specific data, not a replacement for richer existing comment structures. Review Result schema must be identical in `text` and `event` modes.

### Event publish envelope

The Provider's event template owns `type`, `source` and any fixed `data` fields. On Submit, the client attaches the normalized Review Result under `data.review` **without overwriting template-owned fields**, then publishes through the existing Events MCP interface:

```json
{
  "command": "publish",
  "args": {
    "type": "markcut.review.submitted",
    "source": "<trusted-caller-source>",
    "data": {
      "correlation": { "...": "caller-owned" },
      "review": { "decision": "changes_requested", "revisionId": "...", "contentHash": "...", "comments": [], "idempotencyKey": "..." }
    }
  }
}
```

The Neo MCP command façade accepts `events` with `command: "publish"` and `args: {type,source,data}`; the standalone Events MCP provider exposes `publish({type,source,data})`. The UI must call the actually available, authorized MCP interface. Browser MCP App availability of the Events tool must be verified before promising Event mode; no arbitrary HTTP URL or shell command may be specified as an event target.

## Functional requirements

- **FR-001**: Preserve `text` as the default and existing `ui/message` behavior for old `markcut.preview` callers.
- **FR-002**: Support explicit `review.delivery` values `text` and `event` only; reject unknown values and Event mode without a valid event template.
- **FR-003**: On Approve or Request Changes Submit (not on every comment edit), collect and normalize the review once and deliver via the selected transport.
- **FR-004**: Bind `previewId`, `revisionId`, `contentHash`, `delivery` and event template to the review request; prevent client mutation of protected event fields and reject obsolete revisions.
- **FR-005**: In Event mode, publish the provider-bound template with review fields via existing authenticated Events MCP capability. No Markcut-to-Relay internal dependency or callback registration.
- **FR-006**: Return a truthful receipt for *transport acceptance only*. Processing or Task/Agent completion remains the consumer's responsibility.
- **FR-007**: Persist a stable idempotency key with pending mobile feedback and reuse it on retries. Event consumers must deduplicate by request + revision + submission key; publishing multiple times must not cause repeated revisions.
- **FR-008**: Preserve current Neo Mobile inbox/grouping, video playback, queue and retry UX. Add `delivery` and `eventTemplate` to review request metadata, and route delivery using the selected mode.
- **FR-009**: Validate template source/type permissions server-side or at the authenticated event gateway; never trust a browser-provided Relay execution identity. Review events must not be accepted as `task.completed`, `task.failed`, or Final Reviewer approval events.
- **FR-010**: Preserve review and approval scope per exact immutable revision. A new video revision requires fresh human approval; an Agent review cannot substitute for it.
- **FR-011**: Make submission failures visible and retryable, with no success banner until an actual accepted receipt. Do not change delivery modes automatically on failure.
- **FR-012**: Preserve compatibility for existing Neo Mobile requests carrying legacy `ownerCallbackTool` / `ownerThreadID` while migrating new requests to the explicit two-mode contract; do not introduce a third public mode.

## Ownership and downstream behavior

- **Markcut Provider**: compiles/publishes immutable media, binds review delivery metadata, validates preview revision state, provides review template to clients.
- **Markcut Preview UI**: gathers comments and decision, fills review fields, dispatches either text or event, displays honest receipt/failure state.
- **Neo Mobile**: displays the same review/revision, submits through its authenticated Neo MCP connection, retains offline retry state.
- **Caller/Event consumer**: owns authorization, durable business processing, any Relay Event → original Producer Agent continuation, rereview, workflow transitions, and video delivery. `markcut.review.submitted` is domain input, **not** Relay task-completion authority.

## Edge cases and compatibility

- Published revision superseded while the video is open; duplicated taps, replayed queued submissions, lost ACK, and device offline/relaunch.
- Absent or unauthorized Events MCP tool in an embedded ChatGPT iframe; show an explicit unsupported-delivery error rather than covertly changing modes.
- Invalid/forged template, conflicting reserved payload keys, insufficient execution identity, cancelled/superseded Relay Job, and denied publish permissions.
- Review feedback submitted in ChatGPT but separately approved on mobile; downstream caller resolves competing decisions using version binding and its own policy.
- Failed preview compilation must not cancel previously published immutable preview resources or falsely authorize human approval.

## Verification and success criteria

1. **Web**: default text, explicit text, event request and actual authorized Events MCP publish each deliver one verifiable review result. No Event publish occurs before Submit.
2. **Mobile**: both modes pass device-level submission and offline retry tests. An Event-mode review reaches a test consumer with unchanged template-owned fields and correct scene/timestamp comments.
3. **Safety**: stale hashes, forged source/types, missing event capability and cancelled consumer contexts cannot be misreported as accepted or approved.
4. **Idempotency**: duplicate submits and repeated transport delivery produce at most one consumer-side business decision per key.
5. **Backward compatibility**: existing text-only ChatGPT preview and existing Neo Mobile feedback requests continue to work; no callback dispatcher is required.
6. **End-to-end evidence**: actual hosted Preview and iPhone submissions are tested separately. Published/queued receipts alone do not prove downstream Relay execution, a fixed video, or final delivery.

## Non-goals

- Implementing an Event Bus, callback dispatcher, polling review inbox, or a Markcut-specific review database.
- Allowing the browser to execute shell commands, arbitrary URLs, or unrestricted events.
- Making Markcut decide how Relay revises, reruns, approves, or merges Tasks.
- Treating human Preview approval as Relay Final Reviewer approval.

## Implementation notes to validate before coding

- Today's Markcut Provider accepts `path` and optional `relay` metadata; it does **not yet** accept the proposed `review` option.
- Today the hosted player delivers through `ui/message`; today Neo Mobile uses an `ownerCallbackTool` / Agent-turn fallback. Both need migration to the two-mode configuration.
- The Neo Events Bus has a `publish` MCP tool, with a separate `events` command façade. Verify that the hosted MCP App is permitted to invoke the authorized event tool through its actual Host before implementing a direct UI publish route. If not supported, treat that as an integration constraint to resolve without creating a generic callback framework by default.
- Current Events Bus assigns transport `event_id` internally; place caller-side idempotency in `data.review.idempotencyKey` and enforce deduplication at the consumer.
