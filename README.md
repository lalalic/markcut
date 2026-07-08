# markcut — Markdown-to-Video Engine

Write a storyboard in markdown, get a rendered video with TTS narration and subtitles.

```bash
# Render a storyboard to MP4
npx markcut render storyboard.md --aspect 9x16

# Preview with live edit (edit .md file, player auto-reloads)
npx markcut preview storyboard.md --edit

# Label clips in a stream tree
npx markcut preview labels.json --label --port=3031
```

## How it works

```
storyboard.md  ──[parse]──▶  DescriptiveRoot  ──[compile]──▶  Stream Tree  ──[Remotion]──▶  MP4
                                  │                                  │
                             resolveMediaDurations()             <Sequence>
                             resolveScripts() → TTS              <Series>
                             resolveSubtitles() → VTT            <Img>, <OffthreadVideo>
```

1. **Write** a storyboard in markdown (scenes with `## headings`, media with `-` bullets)
2. **Parse** the markdown into a descriptive tree
3. **Resolve** media durations (ffprobe), generate TTS narration (edge-tts), transcribe to VTT (whisper)
4. **Compile** the descriptive tree into a stream tree (the low-level Remotion JSON)
5. **Render** with Remotion — no React code needed

## Features

| Feature | Description |
|---|---|
| **Markdown input** | Write `## Scene` headings, `- bullet` leaves. Components via `jsx:"<Tag />"` syntax |
| **JS imports block** | `` ```js imports `` code fence with real ESM `import` statements instead of YAML |
| **Dynamic components** | Load any React component from npm, GitHub, or any URL via `import { X } from "pkg"` |
| **Tween animation** | `tween(from, to)` function calls in JSX for frame-accurate numeric animation |
| **Compiled input** | Pre-compiled stream tree for direct Remotion rendering |
| **TTS narration** | `script` field → edge-tts CLI → WAV audio. Configurable engine (mlx-audio, custom) |
| **STT subtitles** | TTS audio → whisper → VTT → root subtitle overlay with animated caption types (typewriter, fade, bounce, etc.) |
| **Tween animation** | `tween(from, to)` function calls in JSX for frame-accurate numeric animation |
| **Styling** | Inline `style` strings on any node for CSS. JSX components use inline React styles |
| **Live edit** | `--edit` watches the input file, re-runs pipeline, auto-reloads player |
| **Label mode** | `--label` interactive player with per-scene label input, saves to labels.json |
| **CLI** | `render`, `preview` commands for MP4 export and Remotion Studio |
| **Programmatic** | `MarkCut` / `DescriptiveComposition` React components for embedding |

## Example

```md
# video
width:1080 height:1920 fps:30 layout:series

## Hook
layout:parallel script:"Set the mood with a beautiful landscape"
- image src:cover.jpg duration:3

## Features
layout:transitionSeries transition:fade transitionTime:0.4 script:"Show what we built"
- component duration:6 jsx:"<DeviceMockup src='screenshot.png' />"
- component duration:4 jsx:"<StatCounter value={100} suffix='K' label='Users' />"
```

Components are registered via frontmatter `imports:` or a `` ```js imports `` code block:

````
```js imports
import { DeviceMockup } from "mockup-component"
import { StatCounter } from "stat-counter"

// Inline component definition
export function Greeting({ name }) {
  return <h1 style={{color: '#fff'}}>Hello {name}</h1>;
}
```
````

### Dynamic Components

Any React component from npm, GitHub, or any URL can be imported and used directly in JSX expressions. The engine loads them at render time via esm.sh — no build step required.

```markdown
- component duration:3 jsx:"<PieChart data={[{value:40,color:'#E38627'}]} />"
```

Inline components can be defined entirely in the imports block using `export function`, making the video self-contained with no external files.

## Docs

| Document | What it covers |
|---|---|
| [docs/json-descriptive.md](docs/json-descriptive.md) | Full JSON descriptive schema reference |
| [docs/markdown-strict-descriptive.md](docs/markdown-strict-descriptive.md) | Markdown descriptive syntax reference |
| [docs/label-mode.md](docs/label-mode.md) | Label mode player and workflow |
| [docs/edit-mode.md](docs/edit-mode.md) | Live edit mode with SSE reload |


## Architecture

```
src/
├── entry.tsx              ← Library entry: MarkCut + DescriptiveComposition
├── index.ts               ← Remotion registerRoot (for studio/render CLI)
├── Root.tsx               ← Remotion Composition wrapper
├── schema/                ← Zod schemas for all stream types
├── types/                 ← React renderers (Folder, Video, Image, Audio, etc.)
├── descriptive/           ← Compiler, markdown parser, resolve pipeline
├── themes/                ← Theme presets + ThemeProvider
├── render/
│   ├── cli.mjs            ← CLI entry point
│   └── tts.ts             ← TTS via CLI template + variable substitution
├── player/
│   ├── server.mjs         ← --edit player server
│   ├── label-server.mjs   ← --label player server
│   ├── pipeline.ts        ← Pipeline entry (bundled to pipeline.mjs)
│   └── browser.tsx        ← Browser player (bundled with esbuild)
├── utils/                 ← Duration calc, VTT parser, helpers
└── tests/                 ← Vitest integration tests
```

## Scripts

```bash
npm run render      # render a JSON stream tree to MP4
npm run preview     # open Remotion Studio
npm run typecheck   # TypeScript type check
npm test            # run unit + integration tests
```
