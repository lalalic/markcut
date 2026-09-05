---
name: markcut
description: use markdown to describe stream trees, provide CLI to render stream trees to video via `npx @lalalic/markcut`. use it to structure video scenes, and generate TTS, TTI, TTV, STT media automatically.
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

## review
use the review contract defined in [./review.md](./review.md) to guide the review process.
review as early as possible in the video production process to catch issues before they propagate.
* review md file
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