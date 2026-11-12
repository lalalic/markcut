---
name: markcut
description: Create, edit, preview, review, and render videos from Markdown using Markcut. Use for storyboards and scene structure, media inspection, narration and subtitles, video variants, GPS route visuals, MP4 export, and interactive human review in ChatGPT. Select the right authoring, preview, or review workflow for the requested outcome.
---

# Markcut — Markdown-to-video

Markcut turns a Markdown video definition into a compiled stream tree and a playable video. **Use the project-selected video template for creative defaults** (opening/ending, BGM, transitions, subtitles, voice, aspect ratio); **the instantiated `video.md` is the authoritative source for that video's current scenes, media paths, previews, review revisions, and render**. Original media files are evidence/assets, not a substitute for the active Markdown. Do not duplicate template settings in the Skill or an agent prompt.

## Choose the capability

| User goal | Agent action |
|---|---|
| Understand a folder of photos or clips | Inspect the files; use `markcut vision <folder>` if scene selection needs visual/media understanding. |
| Make or revise a video | Load the project-selected template, author/edit its Markdown scenes, run `markcut verify <file>`, and **inspect real playback before claiming a finished video**. |
| Browse reusable motion/map recipes | Use `markcut recipes list --json` to see both Markcut-owned native scenes and installed Shotcraft reference cards; `markcut recipes show <qualified-id>` to inspect the selected card. Only `executable:true` cards provide ready-to-customize Markcut snippets. Read [Recipe catalog](docs/recipes.md) for source ownership, parameters and selection rules. |
| Quickly assess story structure | `markcut preview <file> --storyboard` (placeholder media, not a final-video quality check). |
| Watch a native work-in-progress video | `markcut preview <file>`; test real visuals, sound, and seeking. |
| Watch a hosted preview without reviewing | Call `markcut.preview({path,readonly:true})`; no approval, comment submission, Git checkpoint, Relay change, or iPhone review request. |
| Ask a person to review in ChatGPT | Call the available `markcut.preview({path})` tool; handle revision-specific feedback and approval. |
| Ask for human review from Codex/terminal via iPhone | Use `markcut preview <video.md> --delivery event --event-template <relay-event.json>` on Neo Master. Neo Master stores the Preview and APNs notifies iPhone; the phone publishes the Event when the person submits. |
| Deliver a finished MP4 | `markcut render <file> --output <path>`; inspect the resulting video and sound. |
| Visualize a route or trip | Use a Markdown `map` stream; load [route/map reference](docs/map-dynamic-camera.md). |

`markcut` means the `npx @lalalic/markcut` CLI in the examples below. For supported flags and generation adapters, consult `npx @lalalic/markcut --help`, `npx @lalalic/markcut vision --help`, and `npx @lalalic/markcut --show-clis` rather than guessing. Media generation is handled by the configured Markcut pipeline; this Skill does not select a project's private vision provider.

## Author and validate

1. Identify the requested audience, platform, duration, story, language, available assets, and desired output. Reuse the user's/project's designated video Markdown template; if none exists, start a minimal `# video` document.
2. Use scene nodes for narrative beats, visual media for what viewers see, and `script` for spoken content. Keep scene structure, soundtracks, caption styling, and transitions in the video Markdown. Do not impose a viral-video arc unless the user requests that style.
3. For a scene with narration and **one visual intended to span the narration**, make that visual `isBackground:true`; otherwise it may end before the voice and leave a blank tail. Do not impose a fixed script duration when narration timing is resolved by the pipeline.
4. Put hand-authored/third-party assets beside the video under `assets/`; do not place them in generated `.markcut/` cache. Do not manually remove that cache as a troubleshooting shortcut.
5. Run `verify` on the actual file and correct missing/escaped asset paths, invalid node properties, and timing assumptions before preview or render. For exact grammar, load [Markdown DSL](docs/markdown-descriptive.md) **only when authoring or validating**.

Minimal structure (adapt to the project's template):

```md
# video
width:1080 height:1920 fps:30 layout:series

## Opening
layout:parallel
- image src:assets/opening.jpg isBackground:true
- script "An opening line that matches the shot."
```

Asset paths are relative to the Markdown document. A `prompt` without `src` asks the media pipeline to generate content; inspect the result rather than assuming the prompt guarantees a correct visual. Keep visual and spoken meaning aligned. Use variants in Markdown for alternate language/platform/aspect outputs, rather than separate prompt rules.

## Select the next action; preserve completion gates

- Choose the **immediate next action** from the user's request. A later verification gate is not the current action: after `changes_requested`, **edit the active source `video.md` first**, then `verify`, preview the **new** revision, and return it for human review. Do not choose `verify` as if the requested edit already happened.
- If a source asset is missing, fix its location or reference (or report the actual blocker); do not re-run `verify` as a substitute for repair, and do not manufacture a missing asset.
- When the user **asks whether** a failed/unverified review is complete, answer **not complete** and identify the missing gate. When asked to **fix** the failure, investigate and recheck the broken layer. A compiled file or MCP resource URL is not evidence of actual playback.
- For a requested **animated route or moving map camera**, inspect real playback to verify that movement and framing actually work; a valid `map` node or GPS source does not prove the animation.
- **Completion gates are not immediate steps.** For a finished video, inspect real playback. For an explicit human review/approval, the current revision must be playable and the human must review or approve that same revision. Never claim human approval, borrow approval from an older revision, or make approval mandatory for ordinary render requests.

## Preview, review, and finish

1. **Structure gate:** `npx @lalalic/markcut verify video.md`, then `npx @lalalic/markcut preview video.md --storyboard` when rapid scene review is useful. Storyboard placeholders do not verify generated media or final audio.
2. **Playback gate:** `npx @lalalic/markcut preview video.md`. Play and seek representative scenes; check black tails, media loading, narration, BGM, subtitles, route movement, and timing. For browser failures, load [Preview Troubleshooting](references/preview-troubleshooting.md) on demand.
3. **Human review gate:** Use Neo's `markcut.preview({path: "/absolute/path/video.md"})` when the user wants to review the hosted ChatGPT video player. For playback only, use `readonly:true` instead; do not supply `review`. This is **not** the CLI preview. Managed requests correlate through `review.relay`, not a top-level `relay` field. The tool compiles/publishes a revision for playback; it does not rewrite the source. Comments with `decision: changes_requested` require editing that Markdown and calling `markcut.preview` again. `decision: approved` applies **only** to the identified revision/content hash; never apply an old approval to changed content. Follow [Review Contract](review.md) for actual video assessment.
4. **Codex / terminal human-review gate:** `npx @lalalic/markcut preview /absolute/video.md --delivery event --event-template /absolute/relay-event.json` on Neo Master. The Event Template must match Relay's canonical `task.interactive_decision` Contract (`type`, `source`, `data.interactive.{jobId,taskId,executionId,invocationId}` only, without review-result fields). The CLI reuses the MCP compiler, publishes immutable preview assets, persists the review request on Neo Master and dispatches an APNs notification through the existing Neo Mobile provider. Exit receipt `review_requested` confirms only that **the iPhone inbox accepted the request**; human decisions arrive asynchronously on Events Bus. The phone need not be online. APNs delivery is best-effort; Neo Mobile synchronizes persisted requests on foreground. There is no automatic text fallback. Do not claim approval or Relay worker continuation from the receipt. For retries with an uncertain phone acknowledgment, pass a stable `--request-id UUID`. See [Codex/mobile review CLI](references/mobile-event-preview-cli.md).
5. **Delivery gate:** `npx @lalalic/markcut render video.md --output out/video.mp4`. Confirm the MP4 exists and examine playback, including the final audio and subtitles. A valid Markdown file, compile success, or hosted-player resource alone is not proof of a finished video.

If the user asks only for a script or structure, stop at the requested stage. Do not trigger expensive generation or claim final video delivery without a requested rendered artifact. A project-specific agent owns its own editorial or approval decisions; Markcut supplies authoring, playback and revision capabilities.

## Failure and lifecycle boundaries

- Treat `verify` errors, missing media, failed compilation, inaccessible preview, broken audio, and failed rendering as different failures. Preserve the previous successful artifact; report the failed gate and evidence, not success.
- Some media jobs run for a long time. Monitor observable progress and use the host's managed-job/timeout/recovery facilities. Do not assume a job succeeded because it launched, and do not leave unresponsive work running indefinitely.
- Native preview, MCP compilation/publication and the actual hosted ChatGPT player are **separate verification gates**. Never infer one passes because another passes.
- Keep manual assets, private coordinates, credentials and third-party rights protected. For route media, distinguish measured GPS tracks from inferred roads between stops.
- Stop only preview servers and browser sessions created for this task; do not disturb unrelated processes.

## References — load by need

| Need | Reference |
|---|---|
| Markdown grammar, nodes, variants and asset syntax | [docs/markdown-descriptive.md](docs/markdown-descriptive.md) |
| Map/GPS videos and camera movement | [docs/map-dynamic-camera.md](docs/map-dynamic-camera.md) |
| Reusable recipes (Markcut native + installed Shotcraft) | [docs/recipes.md](docs/recipes.md) |
| JSX components and package examples | [docs/components.md](docs/components.md) |
| Sound effects | [docs/sound-effects.md](docs/sound-effects.md) |
| Review criteria, evidence and feedback contract | [review.md](review.md) |
| Real player/audio/map/iframe troubleshooting | [references/preview-troubleshooting.md](references/preview-troubleshooting.md) |
| MCP published-preview lifecycle (Markcut repository) | [references/mcp-preview-lifecycle.md](references/mcp-preview-lifecycle.md) |
