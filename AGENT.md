# Remotion Engine — AGENT.md

> Render-only Remotion engine. Compose and render videos from JSON stream trees.
> Stream-typed timeline kernel with 12 node types, 20 built-in React components,
> 4 theme presets, 15 templates, and a CLI/player server.

## Quick Start

```bash
npm install
npm run render          # renders sample.json → out/preview.mp4
npm run studio          # open Remotion Studio
npm test                # run all tests
npm run test:integration  # run render integration tests only
```

## Project Structure

```
markcut/
├── src/
│   ├── schema/index.ts      — Zod schemas for all 12 stream types
│   ├── types/               — React renderers (one per stream type)
│   │   ├── Folder.tsx       — Series/Parallel/TransitionSeries container
│   │   ├── Video.tsx        — OffthreadVideo with startFrom/endAt trimming
│   │   ├── Image.tsx        — Still images with fit modes
│   │   ├── Audio.tsx        — Audio playback (background loops, foreground ducking)
│   │   ├── Subtitle.tsx     — Text overlay (inline, VTT, karaoke cues[])
│   │   ├── Component.tsx    — Registered/built-in components + remote ESM
│   │   ├── Effect.tsx       — CSS keyframe animation wrapper
│   │   ├── Include.tsx      — Embed external video JSON (data URI/file/URL)
│   │   ├── Map.tsx          — Canvas route visualization
│   │   ├── Rhythm.tsx       — Beat-synced audio + timed children
│   │   └── Scene.tsx        — Scene alias (pass-through to FolderLeaf)
│   ├── components/          — 20 built-in React components
│   │   ├── text/            — AnimatedHeadline, TypewriterText, GlitchReveal, TextCard, CalloutBox, EndTag
│   │   ├── media/           — DeviceMockup, CursorFlyover, ComparisonSlider
│   │   ├── data/            — StatCounter, ProgressBar, BarChart, LineChart, PieChart, ComparisonCard
│   │   ├── atmosphere/      — GradientBackground, ParticleField, LightLeak
│   │   └── layout/          — SplitScreen, SpotlightReveal
│   ├── themes/              — Theme system (cinematic/minimal/neon/corporate)
│   │   ├── schema.ts        — Zod theme schema (colors, fonts, timing, effects)
│   │   ├── presets.ts       — 4 theme presets
│   │   └── index.tsx        — ThemeContext + resolveTheme() + ThemeProvider
│   ├── templates/           — 15 pre-built video templates with slot system
│   │   ├── schema.ts        — Template slot schema + resolver
│   │   ├── marketing/       — product-hero, feature-showcase, before-after, social-clip, cinematic-intro
│   │   ├── demo/            — demo-walkthrough
│   │   ├── social/          — announcement, glow-up, quote-card, roast-list, stat-reveal, top5-countdown, year-recap, beat-drop
│   │   └── presentation/    — journey-map
│   ├── context/index.tsx    — ComposeContext (Container + components registry) + AudioContext
│   ├── utils/index.ts       — Pure helpers: getDurationInSeconds, cssJS, toPlaybackRate, walkDown, VTT parser
│   ├── render/
│   │   ├── cli.mjs          — CLI: render, templates, preview commands
│   │   ├── pipeline.ts      — ASPECTS constant + adaptAspect()
│   │   ├── tts.ts           — edge-tts wrapper for TTS narration
│   │   └── sfx.ts           — Sound effect presets
│   ├── player/              — Preview/label/edit server
│   │   ├── server.mjs       — Express server for Remotion Player
│   │   ├── browser.tsx      — Browser-based player entry
│   │   └── label-server.mjs — Label editing server
│   ├── lite.entry.tsx       — Lite bundle entry (core renderer)
│   ├── full.entry.tsx       — Full bundle (lite + components + themes + templates)
│   ├── player.entry.tsx     — Player bundle for app embedding
│   └── Root.tsx             — Remotion Composition root (parses props, computes duration)
├── tests/
│   ├── render.test.ts       — 30 integration tests
│   ├── utils.ts             — Test helpers: renderFixture, extractFrame, isFrameNonBlank, STT
│   ├── vitest.config.ts     — Long timeouts, non-parallel, verbose reporter
│   └── fixtures/            — 12 JSON test fixtures
├── public/                  — Static assets (video clips, audio, bgm)
├── docs/                    — Documentation
│   ├── dynamic-components.md
│   ├── edit-mode.md
│   ├── templates.md
│   └── themes.md
├── SKILL.md                 — Agent skill: 3-level workflow (Label → Storyboard → Assemble)
├── DESIGN.md                — Full architecture design doc
└── remotion.config.ts       — Remotion config
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
| **Actions** | Every leaf has `actions[{start, end, startFrom?, endAt?, loop?, volume?, style?}]` — seconds relative to parent. |
| **Scene** (`type:"scene"`) | UI storyboard card; engine treats as folder. Has `name` + `description` + `script`. |

### Duration Calculation

Computed by `getDurationInSeconds()` in `src/utils/index.ts`:
- **Leaf nodes**: duration = last action's `end` value
- **Series**: sum of children durations minus transition overlaps
- **Parallel**: max of children durations
- **Background children**: excluded from calculation
- **Include with `src`**: treated as leaf (duration from action end)
- Sets `durationInSeconds` on every node as a side effect

### 12 Stream Types

All types share base fields from `BaseShape`: `id`, `name`, `title`, `description`, `script`, `src`, `style`, `visible`, `isBackground`, `durationInSeconds`.

| Type | Purpose | Key Fields |
|------|---------|------------|
| `root` | Canvas container | `width`, `height`, `fps`, `isSeries`, `transition`, `stylesheet` |
| `folder` | Group children | `isSeries`, `transition`, `children[]` |
| `scene` | Storyboard node (alias for folder) | `name`, `description`, `script`, `children[]` |
| `image` | Still photo | `src`, `fit` (contain/cover/fill) |
| `video` | Video clip | `src`, `volume`, `playbackRate` |
| `audio` | Soundtrack/SFX | `src`, `volume`, `foreground` (ducks parent) |
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
- `startFrom` / `endAt` on actions trim the source video (in seconds)
- `playbackRate` is capped at 1 (`Math.min(1, ...)`) so source longer than timeline plays at normal speed and is truncated by the Sequence
- **Critical formula**: `OffthreadVideo endAt = startFrom_frames + ((endAt_source - startFrom_source) * fps / playbackRate)`
  This sets `endAt` beyond the actual source end when `playbackRate < 1`, which prevents Remotion from rendering blank frames before the Sequence ends.
- `endAt` without explicit value falls back to `stream.durationInSeconds ?? end - start`

### Rendering Pipeline

1. `Root.tsx` reads `getInputProps()` → parses via Zod `rootSchema`
2. `getDurationInSeconds()` stamps `durationInSeconds` on every node
3. `Composition.durationInFrames` is set to total duration
4. `RemotionEngine` wraps everything in `ComposeContext` + `ThemeProvider` + `AbsoluteFill`
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
- Two implementations: `server.mjs` (Remotion Player) and `label-server.mjs` (label input overlay)

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
2. **Subvideo internal actions**: Should use `start:0` when placed in a series parent (series handles positioning).
3. **Video endAt formula**: Must be `startFrom_frames + ((endAt_source - startFrom_source) * fps / playbackRate)` — changing to `endAt_source * fps` breaks slow-motion playback.
4. **`signalstats` ffmpeg filter**: Doesn't output YAVG on all systems; use file size as proxy for visual content.
5. **Asset paths**: Local files are resolved via `staticFile()` — files go in `public/` and are referenced without the `public/` prefix.
6. **Map rendering**: Depends on external tile availability; may produce blank frames offline.

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

## Dependencies

- **Remotion 4.0.469** — core rendering engine
- **React 19** — component model
- **Zod 4** — schema validation
- **@remotion/transitions** — scene transitions (fade, slide, wipe, flip, clockWipe)
- **@vis.gl/react-google-maps** — map visualization
- **immer** — state management (player app)
- **vitest** — test runner
- **TypeScript 5.6** — strict mode with `noUncheckedIndexedAccess`
