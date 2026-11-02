# ChatGPT MCP review: external behavior contract

The `markcut.preview({path})` tool accepts an absolute Markcut `.md` path or a supported NeoY mounted HTTPS Markdown URL. This tool is for **interactive viewing and human review** inside ChatGPT, not for parsing unrelated Markdown or editing the supplied file. A `relay` correlation object is optional; use it only when the task already belongs to Agents Relay.

The tool creates or reuses a durable Review Session keyed by the absolute source path and source hash, then starts compilation and publication of an immutable video revision. The accepted response includes `reviewSessionId`; it is submission acknowledgement, not approval. The linked Neo Mobile Review Inbox discovers the same session through the authenticated Neo Master MCP gateway and can resync after being offline. The returned operation or player resource can precede successful compilation. The hosted player may show stages before the video is playable. Record the revision/content hash when ready; validate in the actual hosted player.

Human review behavior:

- Draft comments may belong to a scene or a playback timestamp; submitting feedback sends `decision: changes_requested` with context. The agent edits the **original Markcut Markdown** and calls `markcut.preview` again for a new revision.
- An explicit `decision: approved` is tied to the reviewed content hash/revision. Never apply it to a changed source file. Unsaved comments are not an approval.
- The hosted player persists a decision through `markcut.review.decide` before sending `ui/message`. The phone submits to the same durable session. Only one decision is accepted for the latest compiled content hash; exact retries with the same idempotency key return the stored decision, while conflicting retries, stale hashes and edited sources are rejected.
- The originating agent can retrieve asynchronous completion with `markcut.review.get({sessionId})`; Relay correlation is retained in the session so the originating workflow can route the result. Do not claim that an accepted preview call is complete or approved.
- Earlier preview revisions are read-only after supersession. Failed compilation does not invalidate previously successful revisions, but does not authorize approval of an unrendered new one.
- Browser TTS is a **preview playback option**, not an authoritative representation of the voice used in rendered MP4. Confirm the final file's audio independently.

For implementation-specific caching, publishing and iframe internals, developers can consult the Markcut repository `docs/mcp-static-preview.md`. Such internals are not mandatory context for ordinary video authoring.
