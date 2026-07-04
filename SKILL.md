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
| Label system (browse, label, export labels.json) | [docs/label-mode.md](docs/label-mode.md) |
| Dynamic components (remote, custom, effects) | [docs/dynamic-components.md](docs/dynamic-components.md) |
| Player servers (label + edit mode) | [docs/edit-mode.md](docs/edit-mode.md) |
