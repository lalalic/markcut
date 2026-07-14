# markcut — AGENT.md

> Markdown-to-video engine. Describe scenes in markdown, get a rendered video with TTS narration.

## Quick Start

```bash
npm run render storyboard.md      # render markdown → MP4 (9x16 default)
npm run preview storyboard.md --edit  # live preview with auto-reload
npm test                           # unit + integration tests
npm run typecheck                  # TypeScript type check
```

## Input formats

| Format | CLI | Description |
|---|---|---|
| Markdown | `markcut render storyboard.md` | `## Scene` headings, `- image src:...` bullets, `script:"narration"` |
| Descriptive JSON | `markcut render video.json` | Same schema as markdown, JSON syntax |
| Compiled JSON | `markcut render tree.json` | Pre-compiled stream tree (no pipeline needed) |

See [docs/markdown-strict-descriptive.md](docs/markdown-strict-descriptive.md) for the complete markdown syntax reference.

## Key concepts

- **Scene** — narrative unit with `name`, `script` (TTS), `instruction` (visual intent), `children`
- **Layout** — `parallel` (simultaneous), `series` (sequential), `transitionSeries` (sequential with transitions)
- **Script → TTS → STT** — `script` field generates edge-tts audio, whisper transcribes to VTT subtitles
- **Theme** — preset colors/fonts/effects: `cinematic`, `neon`, `minimal`, `corporate`
- **TTL config** — root-level `tts.cli`, `tts.voice`, `tts.rate` with per-scene `tts` overrides
- **Subtitle** — root-level VTT overlay from merged per-clip STT. Not a tree node. Supports animated caption types (`typewriter`, `fade`, `bounce`, `glowing`, etc.) via `remotion-subtitle`, HTML in cue text, and per-cue `<Sequence>` rendering for zero CPU when inactive.

## Stream types

| Type | Purpose |
|---|---|
| `root` | Canvas config: width, height, fps, theme, subtitle, stylesheet |
| `scene` | Storyboard container: name, layout, script, children |
| `folder` | Internal container (series/parallel) |
| `image` | Still photo with fit mode |
| `video` | Video clip with startFrom/endAt trimming, playbackRate |
| `audio` | Soundtrack/SFX with foreground ducking, loop |
| `component` | External React component by componentName + props |
| `effect` | CSS keyframe animation wrapper (fadeIn, zoomIn, bounceIn, etc.) |
| `include` | Embed external video JSON (file, URL, or data URI) |

## CLI

```bash
markcut render <file.json|.md> [--aspect 16x9|9x16|1x1|all] [--output path]
markcut preview <file.json|.md> [--edit] [--label] [--port 3001]
```

## Project structure

```
src/
├── entry.tsx              → MarkCut + DescriptiveComposition
├── descriptive/           → Compiler, markdown parser, resolve pipeline
├── types/                 → React renderers (one per stream type)
├── schema/                → Zod stream tree schemas
├── themes/                → Theme presets + ThemeProvider
├── render/cli.mjs         → CLI entry
├── render/tts.ts          → TTS via CLI template + variable substitution
├── player/pipeline.mjs    → Bundled pipeline (server imports this)
├── player/server.mjs      → Unified server (--edit, --label, preview)
├── player/ui/              → Mode-specific UI control components
│   ├── index.mjs
│   ├── base.mjs
│   ├── label.mjs
│   ├── edit.mjs
│   └── preview.mjs
└── tests/                 → Vitest integration tests
```

## External component contract

Register components at render time:

```tsx
<MarkCut
  root={descriptiveJson}
  compose={{ components: { AnimatedHeadline, StatCounter } }}
/>
```

In descriptive markdown:

```md
- component componentName:StatCounter duration:3 props:{value:42}
```

Components receive props as defined in the descriptive JSON. No eval, no JSX parsing — just `React.createElement(registry[name], props)`.
```

## Stream Tree Architecture

### Core Concept

Everything is a **stream tree** — nested JSON nodes keyed by `type`.
The tree is validated by Zod and rendered by Remotion via recursive React components.

```json
{ "id":"root", "type":"root", "width":1080, "height":1920, "fps":30,
  "isSeries":true, "transition":"fade", "children":[...] }
```

### Composition Rules

| Concept | Rule |
|---------|------|
| **Series** (`isSeries:true`) | Children play sequentially. Optional `transition` (fade/slide/wipe/flip/clockWipe) + `transitionTime` (default 0.5s). |
| **Parallel** (`isSeries:false`) | Children play simultaneously. Duration = max child duration. |
| **Background** (`isBackground:true`) | Loops for parent duration. Excluded from duration calculation. |
| **Timing** | Every leaf carries base fields `start`/`end` (seconds, relative to parent) + optional `startFrom`/`endAt` (source trim) + `duration` (convenience). `end` is the source of truth; `duration` normalizes to `end = start + duration` when `end` is absent. Inside series parents `start` is 0 (positioning is implicit). |
| **Scene** (`type:"scene"`) | UI storyboard card; engine treats as folder. Has `name` + `description` + `script`. |

### Duration Calculation

Computed by `getDurationInSeconds()` in `src/utils/index.ts`:
- **Leaf nodes**: duration = `leafEnd(stream)` = `end ?? (start + duration)` (single deterministic read; `start`/`end`/`duration` live on the base node)
- **Series**: sum of children durations minus transition overlaps
- **Parallel**: max of children durations
- **Background children**: excluded from calculation
- **Include with `src`**: treated as leaf (duration from base `end`)
- Sets `durationInSeconds` on every node as a side effect

### 12 Stream Types

All types share base fields from `BaseShape`: `id`, `name`, `title`, `description`, `script`, `src`, `style`, `visible`, `isBackground`, `start`, `end`, `duration`, `startFrom`, `endAt`, `durationInSeconds`.

| Type | Purpose | Key Fields |
|------|---------|------------|
| `root` | Canvas container | `width`, `height`, `fps`, `isSeries`, `transition`, `stylesheet` |
| `folder` | Group children | `isSeries`, `transition`, `children[]` |
| `scene` | Storyboard node (alias for folder) | `name`, `description`, `script`, `children[]` |
| `image` | Still photo | `src`, `fit` (contain/cover/fill) |
| `video` | Video clip | `src`, `volume`, `playbackRate`, `loop` |
| `audio` | Soundtrack/SFX | `src`, `volume`, `foreground` (ducks parent), `loop` |
| `subtitle` | Text overlay | `src` (text/VTT) or `cues[]`, `fontSize`, `style` |
| `component` | React component | `componentName`, `props`, `src` (remote ESM) |
| `effect` | CSS animation wrapper | `animation`, `customKeyframes`, `children[]` |
| `rhythm` | Beat-synced loop | `src`, `spots[]`, `children[]` |
| `map` | Route visualization | `waypoints[{lat,lng,label}]`, `routeColor` |
| `include` | Embed sub-tree | `src` (path/URL/data URI), `children[]` |

## Key Implementation Details

### Folder.tsx — Series/Parallel Engine

- `FolderLeaf` is the recursive workhorse that renders all stream types
- For `isSeries:true`: uses Remotion `<Series>` or `<TransitionSeries>` (if transition set)
- For `isSeries:false`: renders children as parallel `<Sequence>` elements
- Each child's duration comes from `child.durationInSeconds` (set by `getDurationInSeconds`)
- Transition elements are interleaved between series children
- Background children are wrapped in `<Loop>`
- Scene nodes delegate to `SceneLeaf` → `FolderLeaf` (identity)
- Effect nodes delegate to `EffectWrapper` → `FolderLeaf`

### Video.tsx — startFrom/endAt Trimming

- Uses Remotion `<OffthreadVideo>` for CPU-efficient video decoding
- `startFrom` / `endAt` on the base node trim the source video (in seconds)
- `playbackRate` is capped at 1 (`Math.min(1, ...)`) so source longer than timeline plays at normal speed and is truncated by the Sequence
- **Critical formula**: `OffthreadVideo endAt = startFrom_frames + ((endAt_source - startFrom_source) * fps / playbackRate)`
  This sets `endAt` beyond the actual source end when `playbackRate < 1`, which prevents Remotion from rendering blank frames before the Sequence ends.
- `endAt` without explicit value falls back to `stream.durationInSeconds ?? end - start`

### Rendering Pipeline

1. `Root.tsx` reads `getInputProps()` → parses via Zod `rootSchema`
2. `getDurationInSeconds()` stamps `durationInSeconds` on every node
3. `Composition.durationInFrames` is set to total duration
4. `MarkCut` wraps everything in `ComposeContext` + `ThemeProvider` + `AbsoluteFill`
5. `FolderLeaf` recursively renders the tree

### CLI Usage

```bash
node src/render/cli.mjs render <file.json> [--aspect 16x9|9x16|1x1|all] [--output path]
node src/render/cli.mjs render --template <id> --data <data.json>
node src/render/cli.mjs preview <file.json> [--edit] [--label] [--port 3001]
node src/render/cli.mjs templates
```

### Player Server (Edit Mode)

- `--edit` flag starts a live-reload loop: edit JSON → player auto-refreshes
- `--label` flag starts a labeling UI for selecting and annotating media
- `--port` flag sets the server port (default 3001)
- Unified server: `server.mjs` serves all modes (preview, edit, label). UI control components in `ui/`.

## Testing

### Test Framework
- **Vitest** with custom config in `tests/vitest.config.ts`
- Non-parallel (`pool: "forks", fileParallelism: false`)
- 600s timeout per test (integration tests render real MP4s)

### Key Test Utilities (`tests/utils.ts`)

| Function | Purpose |
|----------|---------|
| `renderFixture(path, opts)` | Render a stream tree JSON → MP4 using `npx remotion render` |
| `renderScenes(path, opts)` | Render scene-based video.json using `Main16x9` composition |
| `getVideoInfo(path)` | Extract metadata via ffprobe (duration, dimensions, FPS, audio) |
| `extractFrame(video, time, out)` | Extract PNG frame at timestamp via ffmpeg |
| `isFrameNonBlank(path)` | Check center pixel isn't black (>10 in any RGB channel) |
| `getFrameFileSize(path)` | Get PNG file size (proxy for visual content) |
| `extractAudio(video, out)` | Extract audio track to WAV |
| `transcribeAudio(path)` | Run whisper STT on audio |

### Test Categories (30 tests)

1. Basic Rendering — empty composition, dimension verification
2. Image + Subtitle — image rendering, inline/VTT/karaoke subtitles
3. Built-in Components — AnimatedHeadline, StatCounter, GradientBackground
4. Effects — fadeIn, bounceIn, custom keyframes
5. Map Rendering — canvas route visualization
6. Audio Rendering — audio track, non-silent verification
7. Include — nested composition via include
8. Full Feature Combination — multiple features
9. Scene Node — scene-based rendering
10. Audio STT — speech-to-text verification via whisper
11. Multiple Aspect Ratios — 16x9, 9x16, 1x1
12. Cross-Stream Types — parallel rendering, effect-wrapped children
13. Frame-Accurate — timeline consistency, frame count
14. Description Field — schema validation, render preservation
15. Scene as Folder Alias — scene/folder interchangeability
16. **Video startFrom/endAt Trimming** — video trimming + photo in series

### Running Tests

```bash
npm test                    # all tests
npm run test:integration    # render integration tests only
npx vitest run tests/render.test.ts -t "Test Name"  # single test
```

## Known Issues & Gotchas

1. **TransitionSeries + isBackground**: `TransitionSeries` from `@remotion/transitions` rejects non-Sequence/Transition children. Don't mix `isBackground:true` children with `isSeries:true, transition:"..."` at the same level.
2. **Video endAt formula**: Must be `startFrom_frames + ((endAt_source - startFrom_source) * fps / playbackRate)` — changing to `endAt_source * fps` breaks slow-motion playback.
3. **`signalstats` ffmpeg filter**: Doesn't output YAVG on all systems; use file size as proxy for visual content.
4. **Asset paths**: Local files are resolved via `staticFile()` — files go in `public/` and are referenced without the `public/` prefix.
5. **Map rendering**: Depends on external tile availability; may produce blank frames offline.
6. **CLI md render needs three things preview gets for free**: (a) `parseMarkdownVariants(raw)` (returns `{base, variants}`) — `parseMarkdownDescriptive` returns the root directly; (b) bundling the ` ```js imports ``` ` block via `bundleFromEntries` and setting `root.imports` (otherwise jsx components are unregistered → slides render as unstyled black frames); (c) staging `.markcut/` assets into `public/.render-assets/` and rewriting srcs to relative paths (remotion render only serves its publicDir). All three live in `src/render/cli.mjs`; the import-map shim for shared react/remotion instances is `src/utils/component-import-map.ts` (must stay in sync with `player/browser.tsx` + `bundler.mjs getSharedExternals`).
7. **Publishing**: verify `npx @lalalic/markcut render <md>` from a clean temp dir before/after publish — v1.1.1 shipped with cli.mjs/pipeline.mjs out of sync and md rendering was completely broken. Also beware stale npx caches (`~/.npm/_npx`) silently running old code.
8. **Clean break from `actions[]`**: leaf timing is now flat base fields (`start`/`end`/`duration`/`startFrom`/`endAt`). Old compiled JSON carrying `actions:[{...}]` no longer parses into a duration — re-compile from markdown/descriptive JSON, or migrate `actions[0]` → flat fields (drop `id`/`volume`/`style`/`effectId`; keep `start`/`end`/`startFrom`/`endAt`/`loop`).

## 3-Level Authoring Workflow (see SKILL.md)

| Level | Format | Purpose |
|-------|--------|---------|
| **Label** | `labels.json` | Browse media, label clips, add descriptions |
| **Storyboard** | `storyboard.json` | `scene` nodes with high-level structure + script |
| **Assemble** | `video.json` | Full stream tree with all types, render to MP4 |

### Script → TTS → STT → VTT Pipeline

Every node carries an optional `script` field for narration/dialogue text. The pipeline:
1. **Storyboard** — agent writes `script` on any node (scene, folder, leaf) as narrative text
2. **TTS** — walk the tree, collect all `script` values with node id + timing, generate WAV audio per segment via `edge-tts`
3. **STT** — transcribe each TTS audio or concatenated audio to VTT via whisper
4. **Subtitle** — attach resulting VTT as a `subtitle` child node for final rendering

This separates concerns: `script` = authoring text (human/agent-friendly), `subtitle` = rendered output (timed VTT cues).

### Multi-turn Dialogue

When `script` text contains multiple `SpeakerName: text` lines (2+), the pipeline auto-expands it into a multi-turn dialogue. Each line becomes a separate audio node with `speaker` field, wrapped in a `series` container for sequential playback.

```md
- script "Ray: Hello everyone
Alice: Good day to you
Ray: Let's begin"
```

Per-speaker voices are configured via `voices` on root. Each value is extra CLI flags appended to the TTS template:

```md
voices:{"Ray":"--voice en-US-GuyNeural","Alice":"--voice en-US-JennyNeural"}
```

The speaker name is matched against `voices` map and the extra flags are appended to the TTS CLI template, naturally supporting voice cloning or edge-tts features (rate, pitch, etc.). Subtitles include the speaker prefix (`Ray: Hello everyone`).

## Dependencies

- **Remotion 4.0.469** — core rendering engine
- **React 19** — component model
- **Zod 4** — schema validation
- **@remotion/transitions** — scene transitions (fade, slide, wipe, flip, clockWipe)
- **@vis.gl/react-google-maps** — map visualization
- **immer** — state management (player app)
- **vitest** — test runner
- **TypeScript 5.6** — strict mode with `noUncheckedIndexedAccess`
