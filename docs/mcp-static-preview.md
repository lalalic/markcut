# Markcut MCP Static Preview Architecture

**Compile-and-release**: markcut.preview compiles Markdown, publishes an immutable JSON and media snapshot to NeoY File Server, and returns. It does not spawn a persistent Player Manager or per-Revision Player. Native CLI preview remains separate.

## Files
- Keep only current story.md, directory.md and video.md in a Vlog run. Story/directory are not necessarily Markcut video DSL.
- Latest compiled stream: <run>/.markcut/<basename>/default/compiled.json
- General immutable cache: <run>/.markcut/cache/<hash>.json
- Per-video index: <run>/.markcut/<basename>/default/cache-index.json
- NeoY HTTPS published resources: /files/_neoy/markcut/cache/<hash>.json, /generated/<hash> for frozen local media, and /player/<bundle-hash>.js for the shared MCP player.

## Lifecycle
- Input fingerprint covers absolute source path, Markdown, audio and referenced local media metadata. Repeating identical input reuses the cache.
- Compile with a deterministic seed so parsing does not modify the source Markdown.
- Publish media and immutable JSON before atomically updating the latest compiled file.
- Retain latest plus nine older successful compiled results per Video. Compilation errors leave the previous latest intact.
- Local media files are snapshotted and older retained previews can play, seek and show maps without a local preview process.
- Old Preview review buttons become read-only; review submissions check the current published hash. Human/Relay review authorization remains separate.
- Source files are latest-only, not historically versioned. No user-facing History UI.
- External HTTPS media are not frozen; local media snapshots provide exact replay where required.

## Verification
Run focused Vitest tests and node scripts/verify-mcp-preview.mjs, then independently inspect the real ChatGPT hosted iframe with Browser Workspace. A passing compiler, a compiled tool result, and a working hosted MCP player are distinct gates. Do not approve automatically.
