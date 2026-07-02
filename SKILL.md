---
name: remotion-engine
description: >-
  Compose and render videos from JSON stream trees. CLI renders stream tree JSON
  to MP4. Run via `npx lalalic/remotion-engine` — no install, no code.
---

## Overview

Three authoring levels:
1. **Label** — browse media folder, label best clips, export labels.json. See [docs/labels.md](docs/labels.md).
2. **Storyboard** — `scene` nodes with high-level structure. See [docs/storyboard.md](docs/storyboard.md).
3. **Assemble** — full stream tree with all types, render to MP4.

---

## Stream Tree Rules

Everything is a **stream tree**: nested JSON nodes typed by `type`.

```json
{ "id":"root", "type":"root", "width":1080, "height":1920, "fps":30,
  "isSeries":true, "transition":"fade", "children":[...] }
```

### Composition

| Concept | Rule |
|---------|------|
| **Series** (`isSeries:true`) | Sequential children. Optional `transition` (fade/slide/wipe/flip/clockWipe) + `transitionTime` (default 0.5s). |
| **Parallel** (`isSeries:false`) | Simultaneous children. durationInSeconds = max child duration. |
| **Background** (`isBackground:true`) | Loops for parent duration, excluded from duration calc. |
| **Actions** | Every leaf: `actions[{start,end, volume?, loop?, effectId?, style?}]` — seconds relative to parent. |

### Types

| Type | Scenario | Key Fields |
|------|----------|------------|
| `root` | Canvas container | `width`, `height`, `fps`, `isSeries`, `transition`, `stylesheet` |
| `folder` | Group children | `isSeries`, `transition`, `children[]` |
| `scene` | **Storyboard node** — UI renders as collapsible card, engine treats as folder | `name`, `description`, `script`, `children[]` |
| `image` | Still image | `src` (URL/staticFile), `fit` (contain/cover/fill) |
| `video` | Video clip | `src`, `volume`, `playbackRate` |
| `audio` | Soundtrack/SFX. `isBackground:true` loops. `foreground:true` ducks parent | `src`, `volume` |
| `subtitle` | Text overlay. 3 input modes: inline text (supports HTML), VTT string/file, or explicit `cues[]` | `src` or `cues[]`, `fontSize`, `fontStyle`, `style`, `actions[]` |
| `component` | Registered React component | `componentName` (registry key), `props` (JSON), `src` (remote URL) |
| `effect` | CSS keyframe wrapper. 25+ built-in animations + custom keyframes | `animation` (name or `"custom"`), `customKeyframes`, `animationTimingFunction` |
| `rhythm` | Beat-synced audio with timed children | `src`, `volume`, `spots[]` |
| `map` | Canvas route visualization, no API key | `waypoints[{lat,lng,label}]`, `routeColor`, `routeWeight` |
| `include` | Embed external video JSON | `src` (path/URL/data URI), `volume` |

### Built-in Components (20)

`{ type:"component", componentName:"...", props:{...} }`

**Text**: `AnimatedHeadline`, `TypewriterText`, `GlitchReveal`, `TextCard`, `CalloutBox`, `EndTag`
**Media**: `DeviceMockup` (browser/phone frame), `CursorFlyover`, `ComparisonSlider`
**Data**: `StatCounter`, `ProgressBar`, `BarChart`, `LineChart`, `PieChart`, `ComparisonCard`
**Atmosphere**: `GradientBackground`, `ParticleField`, `LightLeak`
**Layout**: `SplitScreen`, `SpotlightReveal`

### Dynamic Content

3 ways without rebuilding:
1. **Effect wrapper** — `effect` node with 25+ built-in animations (fadeIn, bounceIn, pulse, etc.) or custom keyframes
2. **Remote component** — `{ type:"component", src:"https://...", componentName:"X" }` — fetched at render time
3. **Custom component** — add `.tsx` to `src/components/`, register in `builtinComponents`. See [docs/dynamic-components.md](docs/dynamic-components.md)

### Subtitle Styling

3 input modes: inline text (HTML supported), VTT file/string, or `cues[]` array.
Karaoke: `className:"karaoke"` or explicit `words[{text,start,end}]`.
Style cascade: `style` field → `fontSize/fontStyle` → cue className → root `stylesheet`.

---

## Video Design Best Practice (How-To)

The engine supports four authoring phases. Each has a dedicated doc with full detail.

### 1. Label — annotate scenes in a stream tree

Load a stream tree JSON, preview each scene, and attach descriptive labels.

```bash
npx lalalic/remotion-engine preview labels.json --label
```

Labels save to `labels.json`. See [docs/labels.md](docs/labels.md) for:
- Label player UI (thumbnails, player, label input)
- Labels persistence format
- Full workflow diagram

### 2. Storyboard — plan video structure with scene nodes

Use `scene` nodes to organize your video. Each scene has `name`, `description`, `script` (narration), and `children`.

```json
{ "type": "scene", "name": "Intro", "script": "Welcome...", "children": [...] }
```

See [docs/storyboard.md](docs/storyboard.md) for:
- Scene node schema and nesting
- Storyboard JSON format
- Script → TTS → STT → VTT pipeline
- Best practices for agents writing storyboards
- How to transition from storyboard to assembly

### 3. Assemble — final renderable video JSON

Replace `scene` containers with the full stream tree (or keep scenes — they render as folders). Add effects, transitions, rhythm, maps, subtitles, components.

```bash
npx lalalic/remotion-engine preview video.json --edit   # live agent loop
npx lalalic/remotion-engine render video.json --aspect all  # MP4 output
```

### 4. Script → TTS → STT → VTT Pipeline

Every node can carry a `script` field with narration/dialogue text:
1. **Storyboard phase** — agent writes `script` on scene/folder/leaf nodes
2. **TTS phase** — walk the tree, collect scripts with timing, run TTS to WAV
3. **STT phase** — transcribe audio to VTT
4. **Subtitle phase** — attach VTT as `subtitle` child nodes

See [docs/storyboard.md](docs/storyboard.md#script--tts--stt--vtt-pipeline) for pipeline details.

---

## 3. CLI

```bash
npx lalalic/remotion-engine <command> [options]
```

### Commands

| Command | Description |
|---------|-------------|
| `render <file.json>` | Render stream tree to MP4 |
| `render --template <id> --data <data.json>` | Resolve template with data, render |
| `preview <file.json>` | Open Remotion Studio |
| `preview <file.json> --label` | Label scenes in a stream tree JSON |
| `preview <file.json> --edit` | Live editing loop (auto-reload on file change) |
| `templates` | List all templates |

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
npx lalalic/remotion-engine preview draft.json --edit --port 3001 &

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
| Label system (browse, label, export labels.json) | [docs/labels.md](docs/labels.md) |
| Storyboard system (scene nodes, script pipeline) | [docs/storyboard.md](docs/storyboard.md) |
| Dynamic components (remote, custom, effects) | [docs/dynamic-components.md](docs/dynamic-components.md) |
| Template system (slots, categories, resolution) | [docs/templates.md](docs/templates.md) |
| Theme system (presets, customization) | [docs/themes.md](docs/themes.md) |
| Player servers (label + edit mode) | [docs/edit-mode.md](docs/edit-mode.md) |
| Full architecture | `DESIGN.md` |
