---
name: markcut
description: >-
  Compose and render videos from streamline trees. CLI renders stream tree
  to MP4. Run via `npx markcut` — no install, no code.
---

## Stream Tree Specs

Everything video is a **stream tree**. it support 2 formats, markdown and json. 
- markdown: see [docs/markdown-descriptive.md](docs/markdown-descriptive.md) for full details.
- json: see [docs/json-descriptive.md](docs/json-descriptive.md) for full details.

---

## Video Design Best Practice (How-To)

The engine supports four authoring phases. Each has a dedicated doc with full detail.

### Label — annotate clips in a stream tree

Load a stream tree, preview each clip, and attach descriptive labels.

```bash
npx markcut preview <flat stream tree file> --label
```

Labels save to `labels.json`. See [docs/label-mode.md](docs/label-mode.md) for:
- Label player UI (thumbnails, player, label input)
- Labels persistence format
- Full workflow diagram

### Storyboard — plan video structure with scene nodes

Use `scene` nodes to organize your video. Each scene has `title`, `instruction`, `script` (TTS narration), `children`. Scenes can nest inside other scenes.

```bash
see [docs/markdown-descriptive.md](docs/markdown-descriptive.md) for full details.

### 3. Assemble — render stream tree to MP4

```bash
npx markcut render <stream tree file> --aspect all  # MP4 output
```

---

## 3. CLI

```bash
npx markcut <command> [options]
```

### Commands

| Command | Description |
|---------|-------------|
| `render <file>` | Render stream tree to MP4 |
| `preview <file>` | Open Remotion Studio |
| `preview <file> --label` | Label clips in a simplified stream tree |
| `preview <file> --edit` | Live editing loop (auto-reload on file change) |

### Options

| Flag | Values | Default |
|------|--------|---------|
| `--aspect` | `16x9` / `9x16` / `1x1` / `all` | `16x9` |
| `--output` | path | `out/video-{aspect}.mp4` |
| `--port` | number | `3001` |
| `--verbose` | flag | `false` (compact progress) |

### Edit Mode for Agents

```bash
# Start player in background
npx markcut preview <stream tree file> --edit --port 3001 &

# Player auto-opens browser. Agent edits JSON → player auto-reloads.
# User clicks ✕ → server exits → agent regains control.
# Browser feedback input writes to feedback.txt.
```

---

## self verification
some common issues (photo or video can't be displayed, audio missing), take below actions to verify
### preview or render mode
- screenshot some key frames, and understand image to verify if the image is correct
### final video
- screenshot some key frames, and understand image to verify if the image is correct
- stt the final video audio, and verify if vtt result is correct


## Reference

| Topic | File |
|-------|------|
| Markdown descriptive format (primary authoring format) | [docs/markdown-descriptive.md](docs/markdown-descriptive.md) |
| JSON descriptive format (canonical IR) | [docs/json-descriptive.md](docs/json-descriptive.md) |
| **Video Templates** — ready-to-use markdown for common scenarios | **[docs/templates/](docs/templates/)** |
| ┣ Courseware / 课件 | [docs/templates/courseware.md](docs/templates/courseware.md) |
| ┣ Product Ad / 产品广告 | [docs/templates/product-ad.md](docs/templates/product-ad.md) |
| ┣ Movie Review / 影视讲解 | [docs/templates/movie-review.md](docs/templates/movie-review.md) |
| ┣ Audiobook / 有声图书 | [docs/templates/audiobook.md](docs/templates/audiobook.md) |
| ┣ Story Video / 故事视频 | [docs/templates/story-video.md](docs/templates/story-video.md) |
| ┣ Travel Log / 旅行日志 | [docs/templates/travel-log.md](docs/templates/travel-log.md) |
| Dynamic components (remote, custom, effects) | [docs/dynamic-components.md](docs/dynamic-components.md) |
| Label system (browse, label, export labels.json) | [docs/label-mode.md](docs/label-mode.md) |
| Player servers (label + edit mode) | [docs/edit-mode.md](docs/edit-mode.md) |
| Template overview and TTI/TTV config | [docs/templates.md](docs/templates.md) |
| Missing components & packages tracker | [docs/missing-components.md](docs/missing-components.md) |
