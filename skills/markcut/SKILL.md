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


### Templates
- Templates in ``docs/templates/`` provide ready-to-use video structures for `orchestrator` agents, use them as starting point to create your own videos.


## 3. CLI

```bash
npx @lalalic/markcut <command> [options]
npx @lalalic/markcut --help # get overall information
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
| Label system (browse, label, export labels.json) | [docs/label-mode.md](docs/label-mode.md) |
| Player servers (label + edit mode) | [docs/edit-mode.md](docs/edit-mode.md) |
| How to make video template | [docs/template.md](docs/template.md) |
| Templates | [docs/templates/](docs/templates/) |


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