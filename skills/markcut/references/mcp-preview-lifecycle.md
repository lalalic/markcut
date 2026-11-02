# ChatGPT MCP preview lifecycle

`markcut.preview({path})` compiles and publishes an immutable video revision for the calling ChatGPT conversation. The result includes `contentHash` and `revisionId`; the hosted player loads the compiled revision and checks the current path-keyed record at `revisions/<sha256(requestedPath)>.json` before enabling review actions.

Review is client-owned. The hosted ChatGPT app sends one `ui/message` containing the decision, revision identity, path, and comments directly to the conversation that opened it. Neo Mobile owns its locally notified review requests and handles its own delivery. Markcut does not keep a global review inbox, persist review decisions, or poll for decisions. A successful `ui/message` response means the conversation received the message; only then does the player show that review was sent. Failures are retried and reported without showing acceptance.

`markcut.preview.media({contentHash})` retrieves the immutable compiled scene tree for clients that need it. No review-session tools are provided. `markcut.preview` compilation operations and content fingerprinting remain available, and completed output is published at the same immutable resource locations.

Human review behavior:

- Draft comments may belong to a scene or playback timestamp. Submitting feedback sends `decision: changes_requested` with revision context. The agent edits the original Markcut Markdown and calls `markcut.preview` again for a new revision.
- An explicit `decision: approved` applies only to the reviewed content hash and revision. Unsaved comments are not an approval.
- Earlier preview revisions are read-only after supersession. Failed compilation does not invalidate previously successful revisions, but does not authorize approval of an unrendered new one.
- Browser TTS is a preview playback option, not an authoritative representation of the voice used in rendered MP4. Confirm the final file's audio independently.

For implementation-specific caching, publishing, and iframe internals, consult `docs/mcp-static-preview.md`.
