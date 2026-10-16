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


## Asynchronous compilation and in-app progress (v21)

markcut.preview validates the Markdown source, writes a transient operation record,
spawns a detached compiler worker, and returns immediately with operationId,
operationUrl, state=compiling, path and resourceUri.

The worker publishes its status through NeoY File Server under
/files/_neoy/markcut/operations/<uuid>.json. It reports actual stages:
checking-cache, parsing-markdown, resolving-assets-and-generating-media,
compiling-scenes, freezing-preview-assets and publishing-static-preview.
The iframe shows the current stage and elapsed seconds, without a fabricated percent.

Ready status includes a compiledUrl. Failed status includes an error. The iframe
polls once per second and hides playback and review controls until the immutable
compiled JSON is available. The compiler then exits, with no long-lived manager.

Status files older than 24 hours are opportunistically pruned during new operations.
The existing immutable compiled cache keeps up to ten results per Video.
Source hashes are checked at worker start and again before publishing.

The real hosted ChatGPT iframe was observed while an isolated 30-second MCP probe
still reported compiling. That validation establishes early mounting, not a
production video or Google Maps pixel-level verification.


## Current hosted Player (v24)

The immutable MCP player shares the native Remotion player and scene navigator. The header contains Markcut/title, optional browser-TTS toggle, and version. The human may Send feedback with scene/time context or Approve a specific revision. These review decisions use MCP Apps `ui/message`; the agent performs all Markdown changes and repeats `markcut.preview` to show a new revision. Host end-to-end continuation is not yet production-verified.

During compilation, Google Maps route/cinematic scenes are optionally rendered by Remotion to MP4 and published as immutable generated media. On successful render the compiled stream references video nodes, and the public JSON omits the Google Maps API key. If no key is available or rendering fails, the original live Map component is retained. The compiler's launch environment must supply `GOOGLE_MAPS_API_KEY`; the NeoY MCP entrypoint is `scripts/launch-mcp.sh` which loads the login environment. This is separate from the local CLI preview.

Player Browser TTS is a **playback-only** mode: it uses existing VTT text for speech and captions, defaulting on when VTT exists. Turning it off restores generated audio. STT is not used in this mode; compilation-time TTS is currently unchanged.
