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

## AI Media Generation (TTS / STT / TTI / TTV)

All four pipelines are configured via a **single CLI string** in frontmatter. The user/LLM embeds every tool-specific parameter directly in the string — only `{input}` and `{output}` are substituted by the engine.

| Pipeline | Field | Default CLI | Prerequisite |
|----------|-------|-------------|--------------|
| **Text-to-Speech** | `tts` | `edge-tts --voice "en-US-GuyNeural" --text "{input}" --write-media "{output}"` | [`edge-tts`](https://github.com/rany2/edge-tts) (`pip install edge-tts`) |
| **Speech-to-Text** | `stt` | `whisper "{input}" --output_format vtt --output_dir "{output}"` | [`openai-whisper`](https://github.com/openai/whisper) (`pip install openai-whisper`) |
| **Text-to-Image** | `tti` | `pi --model agnes-2.0-flash --print "generate image: {input}" --output "{output}"` | [`pi` CLI](https://pi.dev) (`pip install pi-sdk`) |
| **Text-to-Video** | `ttv` | `pi --model agnes-2.0-flash --print "generate video: {input}" --output "{output}"` | [`pi` CLI](https://pi.dev) (`pip install pi-sdk`) |

Set any field in YAML frontmatter to override the default. Example:

```yaml
tts: edge-tts --voice "zh-CN-XiaoxiaoNeural" --text "{input}" --write-media "{output}"
stt: whisper "{input}" --model tiny --language zh --output_format vtt --output_dir "{output}"
```

> **Important**: Only the three built-in variables listed above are substituted. All other parameters (voice, model, rate, size, style, etc.) must be written verbatim into the CLI string by the LLM at generation time.

### Built-in Variables

| Variable | Applies To | Description |
|----------|-----------|-------------|
| `{input}` | TTS, TTI, TTV | Input content: narration text (TTS), generation prompt (TTI, TTV), audio file path (STT) |
| `{output}` | All | Output location: file path for TTS/TTI/TTV, directory for STT VTT files |

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
| `verify <file>` | Verify  video stream validity |

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
