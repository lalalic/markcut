---
name: markcut
description: >-
  Compose and render videos from streamline trees. CLI renders stream tree
  to MP4. Run via `npx markcut` — no install, no code.
---

## Stream Tree Specs

Everything video is a **stream tree**. see [docs/markdown-descriptive.md](docs/markdown-descriptive.md) for full details.

## .markcut/ Directory Layout

When you run `preview` or `render`, all generated artifacts live under `.markcut/` next to the source file:

```
.markcut/
  generated/                    ← shared, content-addressed
    tts/                        ← TTS audio (content-hash filenames)
    media/                      ← TTI/TTV media (content-hash filenames)
    includes/                   ← compiled sub-video JSON (content-hash)
  <basename>/                   ← per-source-file artifacts
    components/                 ← component bundles (per-file: imports differ)
```

- `generated/` — shared artifacts using content-hash filenames, so identical scripts/prompts across different source files reuse the same cached file
- `<basename>/components/` — per-file component bundles; each source file has its own `imports` block, so bundles live under its basename
- The server serves `.markcut/` as a document root, so components at `.markcut/slides/components/abc.js` are served as `/slides/components/abc.js`

## Include (Sub-Video Embedding)

The `include` node embeds an external `.md` file as a sub-video. The pipeline fully resolves it recursively:

1. **`resolveIncludes()`** (step 0 of `resolveAll`): reads the referenced `.md`, parses it, resolves its own includes/TTS/media, compiles to a stream tree, writes the compiled JSON to `.markcut/generated/includes/<hash>.json`
2. **`resolveIncludeImports()`** (server post-compile): if the sub-video has a ` ```js imports ``` ` block, bundles its components independently and writes the bundle URL into the compiled JSON
3. **`IncludeLeaf`** (render): loads the compiled JSON, dynamically imports the sub-video's component bundle, creates a nested `ComposeContext` with the sub-video's registry merged, and renders via `FolderLeaf`

The sub-video's own components are isolated from the parent's — naming conflicts are resolved by "sub-video wins" priority.

```markdown
# video
## Main
- component duration:3 jsx:"<MainTitle />"
## Embedded
- include src:./sub-video.md
## End
- component duration:2 jsx:"<Outro />"
```

```markdown
# sub-video
- component duration:3 jsx:"<SubSlide scene='1' />"

```js imports
export function SubSlide({ scene }) {
  return <div style={{background:'#667eea', ...}}>Scene {scene}</div>;
}
```
```
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

## AI Media Generation (TTS / STT / TTI(text-to-image) / TTV(text-to-video))

All four pipelines are configured via a **single CLI string** in frontmatter. The user/LLM embeds every tool-specific parameter directly in the string — only `{input}` and `{output}` are substituted by the engine.

The default clis are same as below. You can override them in the frontmatter of your stream tree file.

```yaml
tts: uvx edge-tts --voice "en-US-GuyNeural" --text "{input}" --write-media "{output}"
stt: uvx --from openai-whisper whisper "{input}" --output_format vtt --output_dir "{output}"
tti: uvx --from mflux mflux-generate-flux2 --model flux2-klein-4b --steps 5 --prompt "{input}" --output "{output}"
ttv: ##use tti cli to create an image then use ffmpeg to create a video showing the image 5s
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
| `preview <file> --label` | Label clips in a simplified stream tree |
| `preview <file> --edit` | Live editing loop (auto-reload on file change) |
| `verify <file>` | Validate descriptive file + check imports |
### Options

| Flag | Values | Default |
|------|--------|---------|
| `--aspect` | `16x9` / `9x16` / `1x1` / `all` | `16x9` |
| `--output` | path | `out/video-{aspect}.mp4` |
| `--port` | number | `3001` |
| `--verbose` | flag | `false` (compact progress) |
| `--compile` | flag | `false` (resolve only) |
| `--script-output-dir` | dir | `.markcut/generated/tts/` |
| `--media-output-dir` | dir | `.markcut/generated/media/` |

> Default output dirs auto-resolve to `.markcut/<basename>/<type>/` relative to the source file. You only need `--script-output-dir` / `--media-output-dir` to override.

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
| **Video Templates** — ready-to-use markdown for common scenarios | **[docs/templates/](docs/templates/)** |
| ┣ Courseware / 课件 | [docs/templates/courseware.md](docs/templates/courseware.md) |
| ┣ Product Ad / 产品广告 | [docs/templates/product-ad.md](docs/templates/product-ad.md) |
| ┣ Movie Review / 影视讲解 | [docs/templates/movie-review.md](docs/templates/movie-review.md) |
| ┣ Audiobook / 有声图书 | [docs/templates/audiobook.md](docs/templates/audiobook.md) |
| ┣ Story Video / 故事视频 | [docs/templates/story-video.md](docs/templates/story-video.md) |
| ┣ Travel Log / 旅行日志 | [docs/templates/travel-log.md](docs/templates/travel-log.md) |
| Label system (browse, label, export labels.json) | [docs/label-mode.md](docs/label-mode.md) |
| Player servers (label + edit mode) | [docs/edit-mode.md](docs/edit-mode.md) |
| Template overview and TTI/TTV config | [docs/templates.md](docs/templates.md) |
