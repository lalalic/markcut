---
name: markcut
description: Author, compile, preview, review and render videos from Markcut Markdown stream trees. Use for scene planning, TTS/TTI/TTV/STT media generation, Google Maps GPS routes, native CLI previews, and interactive ChatGPT MCP video reviews with contextual feedback and approval.
---

## Stream Tree Specs

Everything video is a **stream tree** described with markdown. see [docs/markdown-descriptive.md](docs/markdown-descriptive.md) for full details.


## Video Design Utilities

### Vision — understand video and images
- `npx @lalalic/markcut vision <folder>` provides tool to understand video and images in a folder, and generate a `metadata.json` file with with text description, duration, and other metadata for each media file.
- `npx @lalalic/markcut vision <folder> --label`, interactive mode, provides tool to label video and images with text, and above metadata.

### Storyboard — plan video structure with scene nodes

- Use `scene` nodes to organize your video. Scenes can nest inside other scenes.
- Use `description`, `scene.instruction`, `script`, `image|video.prompt` to structure your video content.
- **If a scene has a `script` (or `audio`) plus one primary visual, the visual MUST be `isBackground:true`.** Without it the visual plays only its own duration (3s default for images) while narration continues — the rest of the scene is a black screen. Scene duration follows the audio, not the image.

```md
## scene-1
- image prompt:"..." isBackground:true   # fills the whole scene, narration decides duration
- script "..."
```

see [docs/markdown-descriptive.md](docs/markdown-descriptive.md) for full details.

### `--storyboard` — fast structure preview
```bash
npx @lalalic/markcut preview video.md --storyboard
```

Skips slow TTI/TTV/STT generation and renders a fast preview where:
- `image`/`video` nodes with `prompt` but no `src` → `<StoryboardSlot>` placeholder showing the prompt text
- `audio`/`script` nodes → `<StoryboardCaption>` overlays showing narration text
- A `<StoryboardInfo>` card with root metadata (title, dimensions, fps) appears at the first frame

Implies `--edit` so you can chat to reshape the story and see live reloads.

### Video Variants
- define variants for different video configurations, such as different languages, aspects, platforms

### Route / Vlog videos (map clips)
- For **route / travel-vlog clips** (drone flyover, route map with photo stops, Street View walks) use the `map` stream type with `view: overview | route | cinematic | streetview` and `tween(from,to,easing)` camera moves.
- Discover interesting stops along a route with `markcut spots --waypoints "lat,lng;lat,lng" --photos --markdown`, then compose a `map` storyboard from the returned `waypoints:[...]` line.
- See [docs/map-dynamic-camera.md](docs/map-dynamic-camera.md) — the agent guide with effects, spots workflow, and copy-paste markdown examples.

### Viral Story requires
- **Hooks** : why should the viewer watch this?
- **Conflict** : what challenges or obstacles do the characters face?
- **Resolution** : how are the conflicts resolved?
- **Emotion** : what feelings are evoked in the viewer?
- **Call to action** : what should the viewer do next?
- **Open ending** : does the story leave room for interpretation or continuation?

### TTS, TTI, TTV, STT media generation
markcut implements a **media generation pipeline** to generate TTS, TTI, TTV, STT media automatically. 
- `npx @lalalic/markcut --show-clis` to see the default CLIs for TTS, TTI, TTV, STT media generation.
- `orchestrator` agent DONT generate media directly

## 3. CLI

```bash
npx @lalalic/markcut <command> [options]
npx @lalalic/markcut --help # get overall information
npx @lalalic/markcut --show-clis # get command specific information
npx @lalalic/markcut preview <file> # assemble and preview the video with a local server, and chat to edit the video and auto refresh
npx @lalalic/markcut preview <file> --storyboard # fast structure preview: replaces TTI/TTV prompts with placeholder components, skips slow generation
npx @lalalic/markcut render <file> # render the video to mp4
npx @lalalic/markcut vision <folder> # vision understanding medias in folder
npx @lalalic/markcut vision <folder> --label # an extra step to provide UI to label the medias with text, time ranges
npx @lalalic/markcut spots --waypoints "lat,lng;lat,lng" # discover POIs along a route (for route/vlog map clips)

```

---

## Preview troubleshooting

For native previews, Maps, playback, audio/subtitles or hosted ChatGPT MCP iframe issues, load [Preview Troubleshooting](references/preview-troubleshooting.md). Treat native playback, MCP compilation and hosted iframe rendering as separate verification gates.

## MCP Video Preview and Human Review (Player v24)

Use the model-visible `markcut.preview({path})` tool when a human needs to **watch and review a Markcut video** in ChatGPT. It is a video player, **not** a generic Markdown renderer and not the same as the local `npx @lalalic/markcut preview <file>` command.

- **Early review:** Visioner, Director or another upstream agent may create a **temporary**
  Markcut `video.md` from permitted source clips to preview candidate material or a rough
  sequence before the canonical edit exists. Keep it separate from final production files;
  feedback guides the current agent and does not approve the eventual final video.
- Supply an absolute `.md` path (or a supported NeoY mounted HTTPS Markdown URL). An optional `relay` object correlates an Agents Relay task but is not needed for standalone review.
- The MCP call returns promptly with an asynchronous compilation operation. The hosted iframe shows actual compilation stages, then loads a published immutable compiled JSON and media snapshot. There is no persistent player-manager process.
- Player controls include Play/Pause, Seek, volume/audio, fullscreen and a **horizontal clickable scene list** sourced from compiled scene metadata. The title bar displays **Markcut · video title**, a **Browser TTS** switch, and the player version at right.
- **Browser TTS** is an optional preview playback mode (default on when subtitle VTT exists). It speaks existing caption/script text in the browser; it does **not** use STT. Toggle off for generated audio and the original subtitle renderer. This switch does not currently skip compilation-time TTS or affect final renders. Playback timing and seeking are approximate for browser speech.
- Google Maps `map` streams (route/cinematic) can be prerendered by Remotion into MP4 during MCP compilation. The published compiled JSON then references video streams, not live map tiles or a browser-exposed API key. If the render key is unavailable or prerendering fails, the original live Google Maps stream is preserved as a fallback. Native Map support remains available.
- **Send feedback** (formerly Request changes) requires text and sends `ui/message` with `decision: "changes_requested"`, the source path, revision/content hash, and `playbackContext` (current `sceneId`, `sceneName`, `timeSeconds`) when available. The calling agent must interpret the feedback, edit the supplied video Markdown, and invoke `markcut.preview` again for the next turn. The player does not edit files.
- **Approve** sends `decision: "approved"` via `ui/message` for the specific revision. Do not approve a different/newer revision on the basis of an old review.
- Earlier previews are read-only once superseded; the submitted revision is checked against the latest published hash.
- **Verification boundary:** compilation, static MP4 publication, and focused tests have passed, but complete real-hosted ChatGPT feedback → agent edit → re-preview → approval E2E still requires acceptance testing. Do not claim it is verified based on tool metadata alone.

See [docs/mcp-static-preview.md](../../docs/mcp-static-preview.md) for the lifecycle and [./review.md](./review.md) for content-quality review guidance.

## review
use the review contract defined in [./review.md](./review.md) to guide the review process.
review as early as possible in the video production process to catch issues before they propagate.
* review md file with `markcut.preview({ path })` when the MCP tool is available
* review compiled.json
* review the rendered video

## Reference

| Topic | File |
|-------|------|
| Markdown descriptive format (primary authoring format) | [docs/markdown-descriptive.md](docs/markdown-descriptive.md) |
| Route / vlog map clips (effects, spots, examples) | [docs/map-dynamic-camera.md](docs/map-dynamic-camera.md) |
| Built-in components & common npm packages | [docs/components.md](docs/components.md) |
| Sound effects | [docs/sound-effects.md](docs/sound-effects.md) |
| Review contract | [./review.md](./review.md) |

## Built-in Components

Built-in components available via `@lalalic/markcut/components`. See [docs/components.md](docs/components.md) for full reference.


## Golden rule
- put all manual assets in `assets` folder, such as bgm, logo, watermark, etc. don't put them in `.markcut` folder, which is auto generated and will be deleted when `markcut clean` command is run.

### Don'ts
- **don't** set duration for script or stream's duration depending on audio script
  - markcut resolver will automatically calculate the duration based on the audio script length
- **don't** rm `.markcut` directory, which served as cache for all generated content. cache will auto update 
- **don't** set timeout for `preview`, `vision`, `render` markcut commands, which may take long time to generate medias.
- **don't** use skill to understand vision media. use `npx @lalalic/markcut vision <folder>`.