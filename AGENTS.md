# Markcut — repository agent rules

Markcut parses a Markdown video document into a validated stream tree and renders videos with Remotion. For **video authoring and viewing**, load [skills/markcut/SKILL.md](skills/markcut/SKILL.md); load its DSL, map, component, review and troubleshooting references only when the task needs them. For **implementation internals**, consult [docs/developer-reference.md](docs/developer-reference.md), not the video Skill startup prompt.

## Work on the requested layer

- Preserve the user's source video Markdown, selected template and manual `assets/`; never manually wipe generated `.markcut/` cache as a shortcut. Generated output is not a replacement for source Markdown.
- `src/descriptive/` owns Markdown parsing/compilation; `src/schema/` owns stream schema; `src/types/` renders streams; `src/player/` owns native preview; `src/mcp/` owns hosted ChatGPT preview; `src/vision/` owns media processing. Follow these boundaries instead of adding rules to the Skill to compensate for code defects.
- For a video authoring task, check `markcut verify` before preview/render, then confirm **real playback**. Parsing, compilation, rendered MP4 and hosted MCP iframe are separate checks.
- Never assume an image or map HTTP success means a visible frame; never assume a compiled audio stream means audible sound. Distinguish inferred routes from recorded GPS data.

## Commands and evidence

```sh
npm run typecheck
npm test
npm run verify -- <video.md>
npm run preview -- <video.md> --storyboard
npm run render -- <video.md> --output <path.mp4>
```

Use focused tests first, then regression tests relevant to changed code. Avoid running costly media generation when checking Markdown-only changes; create separate real-player E2E evidence when playback behavior was changed.

For MCP provider/player/bridge changes: rebuild the relevant bundle, reload **only the Markcut provider** through Neo's supported provider controls, verify the published resource/version, and open a fresh ChatGPT iframe. Do not restart the entire Neo MCP app. Verify scene/timed comments in the real hosted player, not just unit tests. For browser automation follow the separately discovered WebHelm Skill and stop task-owned sessions.

Preserve unrelated worktrees, services, sessions, user media and credentials. Keep private coordinates and media links out of logs/public artifacts. For implementation-specific known regressions and tests, see [docs/developer-reference.md](docs/developer-reference.md).
