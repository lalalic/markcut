---
name: markcut
description: use markdown to describe stream trees, provide CLI to render stream trees to video via `npx @lalalic/markcut`. use it to structure video scenes, and generate TTS, TTI, TTV, STT media automatically.
---

## Stream Tree Specs

Everything video is a **stream tree** described with markdown. see [docs/markdown-descriptive.md](docs/markdown-descriptive.md) for full details.


## Video Design Utilities

### User labels — label media with text, time ranges
- `npx @lalalic/markcut preview --label` provides tool to label video and images with text.

### Storyboard — plan video structure with scene nodes

- Use `scene` nodes to organize your video. Scenes can nest inside other scenes.
- Use `description`, `scene.instruction`, `script`, `image|video.prompt` to structure your video content.

see [docs/markdown-descriptive.md](docs/markdown-descriptive.md) for full details.

### Video Variants
- define variants for different video configurations, such as different languages, aspects, platforms

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
npx @lalalic/markcut render <file> # render the video to mp4
npx @lalalic/markcut vision <folder> # vision understanding medias in folder
npx @lalalic/markcut vision <folder> --label # an extra step to provide UI to label the medias with text, time ranges

```

---

## self verification
some common issues (photo or video can't be displayed, audio missing), take below actions to verify
### preview
- take screenshot for some key frames in player, and understand image to verify intent

### final video
- screenshot some key frames, and understand image to verify intent
- stt the final video audio, and verify if vtt result is correct


## Reference

| Topic | File |
|-------|------|
| Markdown descriptive format (primary authoring format) | [docs/markdown-descriptive.md](docs/markdown-descriptive.md) |


## common used components
- `react-markdown` — render markdown content, use plugins to extend functionality
  - `remark-gfm` — support GitHub Flavored Markdown (tables, strikethrough, task lists)
  - `remark-toc` — generate table of contents
  - `remark-math` — support math formulas
  - `rehype-katex` — render math formulas with KaTeX

- `@remotion/shapes` — render shapes like arrows, circles, rectangles, etc
- `@remotion/starburst` — render starburst animations

## Golden rule
- always check stream start and duration to avoid
  - audio cut off
  - video cut off
  - subtitle mismatch
  - sync issues between audio, video, and subtitles
- don't set duration for script or stream's duration depending on audio script
  - markcut resolver will automatically calculate the duration based on the audio script length
- **don't** rm `.markcut` directory, which served as cache for all generated content. cache will auto update according to the content change. rm `.markcut` will cause all content to be regenerated, which is time consuming and wasteful.
- put all manual assets in `assets` folder, such as bgm, logo, watermark, etc. don't put them in `.markcut` folder, which is auto generated and will be deleted when `markcut clean` command is run.
- `npx @lalalic/markcut preview` stuck until user close the preview window.