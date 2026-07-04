# JSON Descriptive (Canonical IR)

Complete reference for LLM-driven video generation. Emit valid JSON only.

## Output Contract

A single root object describing a renderable video:

- Required at root: `width`, `height`, `fps`, `layout`, `children`
- `children` is an array of nodes (see Type Catalog)
- Every `scene` / container must have non-empty `children`
- Timing is resolved bottom-up; containers derive duration from children

## Type Catalog

### `scene` — storyboard organizer (preferred top-level node)

When to use: always. Scenes are the default organizational unit. They render as folders but carry narrative metadata.

> **`scene` is a container.** It supports nesting: a scene can hold other scenes, containers, or leaves. Use nested scenes for chapters, acts, or grouped beats.

Example of nested scenes:

```json
{
  "type": "scene",
  "name": "Chapter2",
  "layout": "series",
  "children": [
    { "type": "scene", "name": "Feature1", "layout": "parallel", "children": [ ... ] },
    { "type": "scene", "name": "Feature2", "layout": "parallel", "children": [ ... ] }
  ]
}
```

### `video`

When to use: any moving footage (.mp4, .mov, etc.).

| Field | Required | Type | Notes |
|---|---|---|---|
| `type` | yes | `"video"` | |
| `src` | yes | string | path/URL |
| `duration` | cond | number | required if no `endAt` |
| `startFrom` | opt | number | trim from source start (sec) |
| `endAt` | opt | number | trim at source position; effective length = `endAt − startFrom` |
| `start` | opt | number | parallel only |
| `volume` | opt | number 0–1 | default 1 |
| `playbackRate` | opt | number | |
| `width`,`height` | opt | number | default 1080×1920 |
| `instruction`,`script`,`style` | opt | | metadata |

### `audio`

When to use: voiceover, BGM, SFX.

| Field | Required | Type | Notes |
|---|---|---|---|
| `type` | yes | `"audio"` | |
| `src` | yes | string | |
| `duration` | cond | number | required if no `endAt` |
| `startFrom`,`endAt` | opt | number | trim |
| `volume` | opt | number 0–1 | |
| `loop` | opt | int | loop count >1 |
| `foreground` | opt | bool | ducks parent video audio |
| `start` | opt | number | parallel only |

### `image`

When to use: photos, stills, title cards.

| Field | Required | Type | Notes |
|---|---|---|---|
| `type` | yes | `"image"` | |
| `src` | yes | string | |
| `duration` | yes | number | no intrinsic duration |
| `fit` | opt | `"contain"\|"cover"\|"fill"` | default `contain` |
| `start` | opt | number | parallel only |

### `subtitle`

When to use: captions, on-screen text, karaoke.

| Field | Required | Type | Notes |
|---|---|---|---|
| `type` | yes | `"subtitle"` | |
| `src` | opt | string | inline text, VTT URL, or raw VTT body |
| `cues` | opt | cue[] | `{startFrom,endAt,text,className?,words?}` |
| `duration` | cond | number | required if no cues/src |
| `fontSize`,`fontStyle`,`captionType` | opt | | styling |

If `cues` omitted and `src` is plain text, renders as a single caption for `duration`.

### `component`

When to use: JSX expression rendered at runtime with frontmatter imports in scope.

| Field | Required | Type | Notes |
|---|---|---|---|
| `type` | yes | `"component"` | |
| `jsx` | yes | string | JSX usage expression, e.g. `"<BarChart data={...} />"` |
| `duration` | yes | number |

### `rhythm`

When to use: beat-synced audio (music drops, music-reactive reveals). Duration is derived from `spots` — no explicit `duration` needed.

| Field | Required | Type | Notes |
|---|---|---|---|
| `type` | yes | `"rhythm"` | |
| `src` | yes | string | audio file |
| `spots` | yes | number[] | beat timestamps (sec); must have ≥2 entries |
| `children` | yes | node[] | one child per beat slot; child[i] starts at spots[i], ends at spots[i+1] |
| `volume` | opt | number 0–1 | default 1 |

Duration = `spots[last] + average_gap`. Equivalent to how long the last child plays.

### `effect`

When to use: CSS keyframe animation wrapper around children. Wraps children in an animated div.

| Field | Required | Type | Notes |
|---|---|---|---|
| `type` | yes | `"effect"` | |
| `animation` | opt | string | builtin name (see list below) or `"custom"` |
| `animationTimingFunction` | opt | enum | `linear\|ease\|ease-in\|ease-out\|ease-in-out` |
| `animationIterationCount` | opt | int | default 1 |
| `customKeyframes` | opt | object | `{"0":{"opacity":"0"},"100":{"opacity":"1"}}` |
| `children` | yes | node[] | content to animate |
| `duration` | cond | number | falls back to children max |

Built-in `animation` names:

- **Fades**: `fadeIn`, `fadeOut`, `fadeInDown`, `fadeInUp`, `fadeInLeft`, `fadeInRight`, `fadeOutDown`, `fadeOutUp`, `fadeOutLeft`, `fadeOutRight`
- **Slides in**: `slideInDown`, `slideInUp`, `slideInLeft`, `slideInRight`
- **Slides out**: `slideOutDown`, `slideOutUp`, `slideOutLeft`, `slideOutRight`
- **Zooms**: `zoomIn`, `zoomOut`, `zoomInDown`, `zoomInUp`, `zoomInLeft`, `zoomInRight`
- **Bounces**: `bounce`, `bounceIn`
- **Rotations**: `rotateIn`, `rotateOut`, `rotateInDownLeft`, `rotateInDownRight`, `rotateInUpLeft`, `rotateInUpRight`
- **Flips**: `flipInX`, `flipInY`
- **Attention**: `pulse`, `flash`, `heartBeat`, `rubberBand`, `shakeX`, `shakeY`, `swing`, `tada`, `wobble`, `jello`
- **Specials**: `rollIn`, `rollOut`, `jackInTheBox`, `lightSpeedIn`, `lightSpeedOut`

### `map`

When to use: animated route visualization (Google Maps).

| Field | Required | Type | Notes |
|---|---|---|---|
| `type` | yes | `"map"` | |
| `waypoints` | yes | `{lat,lng,label?,media?}[]` | min 2 for routing |
| `duration` | yes | number | |
| `travelMode` | opt | `"DRIVING"\|"WALKING"\|"BICYCLING"\|"TRANSIT"` | |
| `mapType` | opt | `"roadmap"\|"satellite"\|"hybrid"\|"terrain"` | |
| `routeMarker`,`routeColor`,`routeWeight`,`zoom`,`center` | opt | | styling |

### `include`

When to use: embed an external video JSON (stream tree or scene-based).

| Field | Required | Type | Notes |
|---|---|---|---|
| `type` | yes | `"include"` | |
| `src` | cond | string | path/URL to JSON |
| `children` | opt | node[] | inline fallback if no `src` |
| `duration` | cond | number | required if `src` set |
| `volume` | opt | number | |

## Imports

External React components are registered via `root.imports`. Each entry defines the component's name and origin (`from:` URL or `jsx:` inline definition).

### Root-level imports array

```json
{
  "imports": [
    { "name": "BarChart", "from": "npm:@nivo/bar" },
    { "name": "Logo", "from": "git:myorg/assets/src/Logo.tsx" },
    { "name": "Greeting", "jsx": "export default ({name}) => <h1 style={{color:'#fff'}}>Hello {name}</h1>" }
  ]
}
```

### Import entry fields

| Field | Required | Type | Notes |
|---|---|---|---|
| `name` | yes | string | component name — used as JSX tag in usage expressions |
| `from` | cond | string | source spec (see below); alternative to `jsx` |
| `jsx` | cond | string | inline component definition source (e.g. `"export default ({text}) => <span>{text}</span>"`) |
| `exports` | opt | string | named export to pick from the module (default: `"default"`) |

### `from:` spec forms

| Pattern | Resolves to |
|---|---|
| `npm:pkg` | `https://esm.sh/pkg` |
| `npm:pkg@1.2.3` | `https://esm.sh/pkg@1.2.3` |
| `git:user/repo` | `https://esm.sh/gh/user/repo` |
| `git:user/repo@branch/path` | `https://esm.sh/gh/user/repo@branch/path` |
| `github:user/repo` | same as `git:` |
| `https://...`, `http://...`, local path | used as-is |

### Imports block (markdown only)

The `` ```imports `` code block is a markdown-only feature. See [Markdown Strict Descriptive](markdown-strict-descriptive.md#frontmatter) for the full reference.

### Using imports in component nodes

Components reference imports by name as JSX tags in the usage expression. The compiler passes the resolved `imports` map through to the stream node for runtime resolution:

```json
{
  "type": "component",
  "jsx": "<BarChart data={[{name:'A',value:80},{name:'B',value:60},{name:'C',value:40}]} keys={['value']} indexBy='name' />",
  "duration": 4
}
```

Inline `jsx:` definitions in the imports array are also available as JSX tags in usage expressions:

```json
{
  "imports": [
    { "name": "Greeting", "jsx": "export default ({name}) => <h1 style={{color:'#fff'}}>Hello {name}</h1>" }
  ]
}
// ...
{ "type": "component", "jsx": "<Greeting name='World' />", "duration": 2 }
```

> Components defined via `jsx:` inline definitions are compiled at runtime with Babel and loaded as blob URLs. They have access to `useCurrentFrame()`, `interpolate()`, and other Remotion hooks.

### Imports in markdown

The markdown descriptive format supports the same `imports:` array in YAML frontmatter, plus ` ```jsx Name ` code fence blocks for inline definitions. See [Markdown Strict Descriptive](markdown-strict-descriptive.md#component) for details.

## Common Metadata Fields

Available on every node:

| Field | Type | Purpose |
|---|---|---|
| `id` | string | unique within parent scope; required for referencing |
| `instruction` | string | visual intent or style guide; not rendered |
| `script` | string | narration/dialogue text — TTS source; only meaningful on `scene` nodes |
| `style` | string | inline CSS (semicolon-separated); applied to the node's container div, e.g. `"border-radius:16px; opacity:0.9"` |
| `visible` | bool | default `true`; set `false` to hide without removing |
| `isBackground` | bool | when `true`, node loops to fill parent duration and does **not** contribute to container duration calculation — use for BGM, looping background imagery |

> **`style` tip:** applies to the wrapping container, not the inner media element. Use for positioning, sizing, and opacity overrides.
> **`isBackground` tip:** use for audio tracks, looping video overlays, or any element that should play across the full parent duration.

## Timing Rules

1. `duration` is authoritative for non-trimmed leaves.
2. For `video`/`audio`: if `startFrom`+`endAt` present, clip length = `endAt − startFrom`.
3. `start` allowed only inside `parallel`.
4. `transitionTime` subtracted between items in `transitionSeries`.
5. `isBackground` children do not contribute to parent duration.

## Style

Each node accepts a `style` string for inline CSS on its container div. Available on every node:

| Field | Type | Purpose |

TTS (text-to-speech) and STT (speech-to-text) can be configured globally at root level, and TTS can be overridden per scene.

**Root level** — sets defaults for all scenes:
```json
{
  "tts": {
    "cli": "edge-tts --voice \"{voice}\" --text \"{text}\" --rate \"{rate}\" --write-media \"{output}\"",
    "voice": "en-US-JennyNeural",
    "rate": "+10%"
  },
  "stt": { "model": "tiny", "language": "en" }
}
```

**Per scene** — overrides root TTS settings:
```json
{
  "type": "scene",
  "script": "Hello world",
  "tts": { "voice": "en-US-GuyNeural" }
}
```

**Precedence:** scene-level `tts` → root-level `tts` → CLI flags → hardcoded defaults.

### CLI template variables

| Variable | Source | Example |
|---|---|---|
| `{text}` | `scene.script` (required) | `"Hello world"` |
| `{output}` | output path (required) | `/tmp/tts/scene-1.wav` |
| `{voice}` | `tts.voice` | `en-US-GuyNeural` |
| `{rate}` | `tts.rate` | `+20%` |
| `{refAudio}` | `tts.refAudio` | `./voice-sample.wav` |
| any custom | `tts.options` | `{ "model": "speecht5" }` |

### Examples

**edge-tts** (default):
```json
{ "tts": { "cli": "edge-tts --voice \"{voice}\" --text \"{text}\" --write-media \"{output}\"" } }
```

**mlx-audio with voice cloning:**
```json
{ "tts": {
  "cli": "mlx-audio tts --model \"{voice}\" --text \"{text}\" --ref-audio \"{refAudio}\" --output \"{output}\"",
  "voice": "speecht5",
  "refAudio": "./my-voice.wav"
} }
```

**Pre-recorded audio** (copy only, no generation):
```json
{ "tts": { "cli": "copy", "refAudio": "./voice.wav" } }
```

### STT

Whisper models: `tiny` (fastest, default), `base`, `small`, `medium`, `large`.

### CLI flags

```
--tts-cli "edge-tts --voice {voice} --text {text} --write-media {output}"
--voice en-US-GuyNeural
--rate +20%
--ref-audio ./voice-sample.wav
--tts-options '{"model":"speecht5"}'
--stt-model tiny
--stt-language en

## Tween Animation

Animate numeric props over time using `tween(from?, to, easing?)` expressions in component props. Tweens resolve at render time using Remotion's `interpolate()`, producing smooth frame-by-frame animation.

### Syntax

```
tween(to)                     — 0 → to, linear
tween(from, to)               — from → to, linear
tween(from, to, easeOut)      — from → to, with easing
tween(from, to, spring)       — from → to, spring animation
tween(from, to, spring(damping:12)) — spring with custom params
tween(#000, #FFF)             — color hex → hex
tween(#000, #FFF, easeInOut)  — color hex with easing
```

### Usage in JSX expressions

Place `tween(...)` expressions inside JSX usage expressions. The engine compiles the JSX at runtime and resolves each `tween()` call to an animated number at each frame:

```json
{
  "type": "component",
  "jsx": "<BarChart data={[{name:'A',value:tween(0,80)},{name:'B',value:tween(0,60)},{name:'C',value:tween(0,40)}]} keys={['value']} indexBy='name' />",
  "duration": 4
}
```

This animates the bars from 0 to their target heights over 4 seconds. At frame 0 all values are 0; they interpolate linearly to 80, 60, 40 by the end.

You can also use `tween()` in inline SVG expressions:

```json
{
  "type": "component",
  "jsx": "<svg viewBox='0 0 400 300'><rect y={260 - tween(0, 200)} width={80} height={tween(0, 200)} fill='#E38627' /></svg>",
  "duration": 4
}
```

### Supported easings

| Name | Remotion mapping |
|---|---|
| `linear` (default) | identity |
| `ease`, `easeIn` | `Easing.in(Easing.ease)` |
| `easeOut` | `Easing.out(Easing.ease)` |
| `easeInOut` | `Easing.inOut(Easing.ease)` |
| `spring` | `spring()` from remotion |
| `spring(damping:N, mass:N)` | spring with custom config |

### Color tween

Hexadecimal colors can be interpolated:

```json
{ "fill": "tween(#000000, #ff0000)" }
```

### Important notes

- Tween values only work inside `component` nodes (not on `image`, `video`, `audio`, etc.).
- The frame range is derived from the **action duration** (the `duration` field for the component minus its `start` offset).
- The `tween()` function uses Remotion's `interpolate()` under the hood, with the frame range set to the component's action duration.
- At frame 0, `tween(from, to)` returns `from`. The component receives the initial value immediately.

## Generation Workflow

1. Choose `width`/`height`/`fps`/`layout`/`theme`.
2. Break the video into 3–7 `scene` nodes.
3. For each scene: write `script` (narration, TTS source) and `instruction` (visual intent). Only `scene` nodes carry `script` — leaf nodes ignore it. When scenes nest, the **innermost** scene's `script` wins; parent scenes with nested `script` children are skipped to prevent overlapping narration.
4. Add leaf nodes inside scenes.
5. Add transitions only between scene-grouped sequences.
6. Verify every leaf has resolvable duration.

## Validation Checklist

- [ ] Root has width, height, fps, layout, children.
- [ ] Every scene/container has non-empty children.
- [ ] Every video/audio/image/map/component has duration or trim.
- [ ] No `start` outside parallel.
- [ ] No duplicate `id` within the same parent.
- [ ] All JSON is valid (no comments, no trailing commas).

## Example

```json
{
  "width": 1080,
  "height": 1920,
  "fps": 30,
  "layout": "series",
  "theme": "neon",
  "script": "A short memory film",
  "children": [
    {
      "type": "scene",
      "title": "Hook",
      "layout": "parallel",
      "script": "Set location and emotional tone",
      "children": [
        { "type": "image", "src": "cover.jpg", "duration": 2 },
        { "type": "image", "src": "intro.jpg", "duration": 1.6, "start": 0.2 }
      ]
    },
    {
      "type": "scene",
      "title": "Journey",
      "layout": "transitionSeries",
      "transition": "fade",
      "transitionTime": 0.4,
      "script": "Move through moments",
      "children": [
        { "type": "video", "src": "clips/arrival.mp4", "startFrom": 0, "endAt": 3.5 },
        { "type": "video", "src": "clips/fire.mp4", "startFrom": 1, "endAt": 4 }
      ]
    },
    {
      "type": "scene",
      "title": "Stat",
      "layout": "parallel",
      "children": [
        { "type": "component", "jsx": "<StatCounter value={42} label='S-mores' />", "duration": 2 }
      ]
    }
  ]
}
```
