# ChatGPT MCP review: external behavior contract

The `markcut.preview({path})` tool accepts an absolute Markcut `.md` path or a supported NeoY mounted HTTPS Markdown URL. This tool is for **interactive viewing and human review** inside ChatGPT, not for parsing unrelated Markdown or editing the supplied file. A `relay` correlation object is optional; use it only when the task already belongs to Agents Relay.

The tool starts compilation and publication of an immutable video revision. The returned operation or player resource can precede successful compilation. The hosted player may show stages before the video is playable. Record the revision/content hash when ready; validate in the actual hosted player.

Human review behavior:

- Draft comments may belong to a scene or a playback timestamp; submitting feedback sends `decision: changes_requested` with context. The agent edits the **original Markcut Markdown** and calls `markcut.preview` again for a new revision.
- An explicit `decision: approved` is tied to the reviewed content hash/revision. Never apply it to a changed source file. Unsaved comments are not an approval.
- Earlier preview revisions are read-only after supersession. Failed compilation does not invalidate previously successful revisions, but does not authorize approval of an unrendered new one.
- Browser TTS is a **preview playback option**, not an authoritative representation of the voice used in rendered MP4. Confirm the final file's audio independently.

For implementation-specific caching, publishing and iframe internals, developers can consult the Markcut repository `docs/mcp-static-preview.md`. Such internals are not mandatory context for ordinary video authoring.
