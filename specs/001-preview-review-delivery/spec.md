# Feature Specification: Preview Review Delivery (Text / Event)

**Library:** Markcut (`markcut.preview` and Neo Mobile review clients)
**Created:** 2026-11-05
**Status:** Implemented — uniform Master-to-iPhone Preview delivery; independent Text/Event Review Result delivery
**Decision:** Use exactly two delivery modes, `text` and `event`. No callback registry, callback dispatcher, or Markcut-owned Relay workflow.

## Goal and boundaries

Let the same Markcut Preview player collect human review decisions, scene/timestamp comments, and immutable video revision identity, then deliver that result through the caller's selected transport. Markcut owns preview/review interaction, not the decision about how to revise a video, resume an Agent, or advance a Relay Job.

- `text` (default): send the Review Result to the opening Agent conversation using the existing MCP App `ui/message` route.
- `event`: the caller supplies an event template to the Markcut Provider. On Submit, the Preview UI fills the review-only fields and publishes it through the existing authorized Events MCP tool. The event consumer (Relay or another application) decides what to do next.
- **Preview request delivery is independent from result delivery.** Every successful `markcut.preview` hosted MCP invocation and every Codex CLI Event Preview stores an immutable request in Neo Master's durable APNs review inbox. Apple receives only a request ID as a notification. iPhone fetches the request via authenticated `review.push.pending` on foreground/notification tap. No inbound iPhone MCP is needed.
- Neo Mobile uses the caller-bound Event Template to fill standard `data.interactive` decision/feedback and publishes through the already authenticated Events MCP connection. It calls `review.push.complete` after transport acceptance. A default ChatGPT Text Preview without an owning thread is mirrored on iPhone **for viewing only**; its text Review Result continues in the ChatGPT UI. Do not synthesize unauthorized Relay event identity.
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

### US-4: Trigger Event-mode Preview from Codex CLI (P1)

1. Given a current Relay execution and a caller-authored JSON Event Template, when Codex runs `markcut preview <video.md> --delivery event --event-template <file.json>`, the CLI validates the template, compiles/publishes the same immutable Markcut Preview assets as the MCP provider, then persists a review request on Neo Master.
2. The CLI and hosted MCP compiler use the same Neo Master push adapter; CLI requires `{stored:true,requestId}` from the durable queue. APNs `accepted` is optional and does not prove phone delivery. No direct phone URL, ChatGPT iframe, or callback registry is involved.
3. The CLI exits after mobile receipt, rather than waiting for human action. User submission on iPhone publishes the canonical `task.interactive_decision` using the frozen template. **Event Bus transport acceptance is not Relay Graph completion or Codex continuation.**
4. The iPhone may be asleep or offline; the request remains on Master even if APNs rejects the notification. App foreground/notification taps synchronize the pending list. Failed durable storage is an explicit error, never a success receipt or text fallback.
5. On retry after an uncertain ACK, reuse the same mobile `--request-id` (UUID) so the phone can deduplicate the request. Never repurpose an old revision's approval to a changed source.

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
      type: "task.interactive_decision",
      source: "job/<job-id>/task/<task-id>/execution/<execution-id>",
      data: { interactive: {jobId: "<job-id>", taskId: "<task-id>",
        executionId: "<execution-id>", invocationId: "<review-request-id>"} }
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

The Provider's event template owns `type`, `source` and any fixed `data` fields. The **only supported Event type** is `task.interactive_decision` from the Relay Event Contract. On Submit, the client fills reserved `data.interactive` fields (`decision`, `feedback`, `comments`, `revision`, `contentHash`, `revisionId`, `previewId`, `requestId`, `idempotencyKey`); `revision` equals `contentHash`. It never overwrites caller-owned execution identity. Templates using any other type are rejected without publishing. Then it publishes through the existing Events MCP interface:

```json
{
  "command": "publish",
  "args": {
    "type": "task.interactive_decision",
    "source": "job/<job-id>/task/<task-id>/execution/<execution-id>",
    "data": {
      "interactive": {
        "jobId": "<job-id>", "taskId": "<task-id>", "executionId": "<execution-id>",
        "invocationId": "<review-request-id>", "revision": "<contentHash>",
        "contentHash": "<contentHash>", "revisionId": "<revisionId>",
        "decision": "changes_requested", "feedback": "Shorten the opening",
        "comments": [], "idempotencyKey": "<stable submission ID>"
      }
    }
  }
}
```

Relay's canonical Event Contract is at `agents-relay/skills/agents-relay/contracts/event-contract.md`. A managed Relay caller must build its Template from that Contract, not from Markcut-specific examples. The Neo MCP command façade accepts `events` with `command: "publish"` and `args: {type,source,data}`; the standalone Events MCP provider exposes `publish({type,source,data})`. The UI must call the actually available, authorized MCP interface. Browser MCP App availability of the Events tool must be verified before promising Event mode; no arbitrary HTTP URL or shell command may be specified as an event target.

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
- **FR-012**: Text is the existing Agent conversation path; Event is exclusively the canonical Relay `task.interactive_decision`. Old Markcut-specific event types are rejected. Existing Neo Mobile legacy storage fields do not define an additional public delivery mode.
- **FR-013**: Provide a headless `markcut preview --delivery event` CLI for Codex and terminal agents, using the same publisher/compiler, and persist through Neo Master `review.push.notify`. Validate the caller-owned template and require a durable Master receipt.
- **FR-014**: Preview delivery must be performed once on successful compilation for every Markcut MCP/CLI Preview, independent from result Text/Event mode. APNs notification contains only the request UUID, not the Event Template; Master stores the full immutable request and supports authenticated pending/complete operations. An offline phone must be able to fetch outstanding reviews later.
- **FR-015**: Neo Mobile `review.push.complete` follows successful Events MCP result submission. Replay after completed human review must not restore an obsolete pending request.

## Ownership and downstream behavior

- **Markcut Provider and CLI**: compile/publish immutable media and deliver every Preview request to Neo Master (APNs notifier), independently of any user result.
- **Markcut Preview UI**: gathers comments and decision, fills review fields, dispatches either text or event, displays honest receipt/failure state.
- **Neo Master/APNs**: persist pending Preview requests and notify Apple with the request ID. Provide authenticated `pending`/`complete` API; do not claim APNs acceptance as iPhone receipt.
- **Neo Mobile**: synchronizes stored requests into its local Inbox, shows the same immutable revision, submits result Event through authenticated Neo MCP, then acknowledges completion. Offline local feedback retry remains.
- **Caller/Event consumer**: owns authorization, durable business processing, any Relay Event → original Producer Agent continuation, rereview, workflow transitions, and video delivery. `task.interactive_decision` is Relay human-interaction input, **not** Relay task-completion authority. No alternate or legacy review event type is accepted by the Preview provider.

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
5. **Compatibility**: existing text-only ChatGPT preview continues to work; no callback dispatcher or deprecated Markcut event type is required.
6. **End-to-end evidence**: actual hosted Preview and iPhone submissions are tested separately. Published/queued receipts alone do not prove downstream Relay execution, a fixed video, or final delivery.

## Non-goals

- Implementing an Event Bus, callback dispatcher, polling review inbox, or a Markcut-specific review database.
- Allowing the browser to execute shell commands, arbitrary URLs, or unrestricted events.
- Making Markcut decide how Relay revises, reruns, approves, or merges Tasks.
- Treating human Preview approval as Relay Final Reviewer approval.

## Implementation and observed evidence (2026-11-05)

- Markcut's MCP tool supports both `text` and canonical Relay `event` delivery. The hosted Review UI and the Neo Mobile Event requester use the immutable `data.interactive` field names.
- Codex/terminal users can now call `markcut preview <video.md> --delivery event --event-template <file.json>`; this route starts the same hosted-preview compiler and sends the accepted revision to Neo Mobile using its `review.request` MCP, without invoking a ChatGPT iframe.
- The earlier direct-phone Codex CLI → physical iPhone 17 → Events Bus test (isolated Job `999999993`) returned `review_requested` and accepted the Event Template. The iPhone Review Inbox displayed the request and the phone submitted `changes_requested` with precise revision metadata, producing one persisted `task.interactive_decision`. This proves the transport and mobile UI paths, **not** real Relay Graph job continuation.
- The CLI does not call the phone's MCP server. Master holds pending reviews durably; APNs notification is a best-effort alert. A reachable Master is required to persist the review, but the phone can be offline.
- Events Bus assigns the transport `event_id`; the mobile review result carries a stable `data.interactive.idempotencyKey`, and Relay consumes the canonical Task event. Code-level Graph/worker continuation verification remains owned by Relay.
