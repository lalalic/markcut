# Markdown Descriptive (Agent Contract)

Complete reference for LLM-driven video generation. The parser uses **remark** (`unified` + `remark-parse` + `remark-frontmatter`) for structural parsing (headings, lists, code fences) and extracts raw text from source positions, so JSX values with `<`/`>` are preserved correctly.

## Output Contract

A markdown document compiled into a renderable scene tree.

- Top heading `# video`
- Optional YAML frontmatter block `---\n...\n---\n` at the very top
- Root config line: `width:<n> height:<n> fps:<n> layout:<mode>` (key:value pairs on the line after `# video`)
- Scenes via `##`/`###`/`####` headings
- Leaf nodes via `- typeToken ...` bullets
- Component registrations via `` ~~~js imports `` code fence (or inline JSX definitions)
- Properties via indented code fences (`~~~<lang> <propName>`); `~~~script` only valid on audio nodes

## Frontmatter

A YAML block at the top of the document, delimited by `---`. Supports root configuration, pipeline config (tts/stt/tti/ttv), and metadata.

```yaml
---
width: 1080
height: 1920
fps: 30
title: My Video
description: A demo video
tts: edge-tts --voice "zh-CN-YunxiNeural" --text "{input}" --write-media "{output}"
stt: whisper --model "base" --language "zh" "{input}" --output_format vtt --output_dir "{output}"
tti: pi --model agnes-2.0-flash --print \"generate image: {input}\" --output \"{output}\"
ttv: pi --model agnes-2.0-flash --print "generate video: {input}" --output "{output}"
stylesheet: |
  .slide h1 { color: #667eea; font-size: 64px; }
  .slide li  { font-size: 32px; }
---
```

Supported root keys: `width`, `height`, `fps`, `tts`, `stt`, `tti`, `ttv`, `title`, `description`, `stylesheet`, `subtitle`.

### Subtitle

Configure a global VTT caption overlay via the `subtitle` frontmatter key. Supports an object with `src`, `type`, `fontSize`, `fontFamily`, `fontStyle`, and `style`:

```yaml
subtitle:
  src: captions.vtt
  type: Typewriter
  fontSize: 48
  fontFamily: "Helvetica Neue"
  fontStyle: bold
  style: "color: yellow;"
```

| Field | Required | Type | Notes |
|---|---|---|---|
| `src` | yes | string | VTT path/URL, inline VTT body, or plain text |
| `type` | opt | string | caption animation: `Bounce`, `Fade`, `Typewriter`, `Colorful`, etc. Default: plain static caption |
| `fontSize` | opt | number | default 56 |
| `fontFamily` | opt | string | font family |
| `fontStyle` | opt | string | `normal`, `italic`, `bold`, etc. |
| `style` | opt | string | inline CSS for the overlay container |

> **HTML in cue text**: Cue text supports HTML tags with inline CSS, so you can style individual words:
> ```vtt
> 00:00:01.000 --> 00:00:03.000
> Hello <span style="color:#ff6b6b">world</span>, welcome to <b>our show</b>!
> ```
> The engine renders cue text via `dangerouslySetInnerHTML`, making `<span>`, `<b>`, `<i>`, `<br>`, and inline `style` attributes all work.

If `src` is plain text (no `-->` markers), it renders as a single caption for the full video duration. The `type` field maps to a `remotion-subtitle` animation component — omit for a plain static caption.


### Imports block (recommended)

Use a `` ~~~js imports `` code fence at end of the document (or anywhere in the body). The block acts as a **component registry** — it re-exports components from external packages or defines them inline, making them available to JSX expressions throughout the video.

```
~~~js imports
export { PieChart } from "recharts"
export { BarChart, LineChart } from "recharts"
export { StatCounter as Counter } from "stat-counter"

export function Hello({ name }) {
  return <div style={{color: '#fff'}}>Hello {name}</div>;
}
~~~
```

Think of this block as the **index file** for the video's component scope. `export { Name } from "spec"` re-exports an external component (conceptually correct — the block is the public API of available components). `export function Name()` defines an inline component directly.

The imports block is the **primary** way to register components. The legacy YAML `imports:` array in frontmatter is still supported as a fallback, but the code block is preferred.

> **How it works**: The server extracts the imports block from the raw source, parses it with `parseImportsBlock`, then runs `bundleFromEntries` which creates a temp npm project, installs packages, and bundles everything into a single ESM file with esbuild. The resulting bundle URL is set on `root.imports` (e.g. `/.component-cache/be710e5c.js`). At render time, `MarkCut.useComponentRegistry` dynamically imports this URL and feeds the named exports to react-jsx-parser.

Supported patterns inside the block:

| Pattern | Effect |
|---|---|
| `export { Name } from "spec"` | Re-exports `Name` from the resolved source (recommended) |
| `export { Name as Alias } from "spec"` | Re-exports under `Alias` instead |
| `export { N1, N2 } from "spec"` | Re-exports multiple from the same source |
| `export default Name from "spec"` | Re-exports default export |
| `export function Name(...) { ... }` | Inline component definition |
| `export default function Name(...) { ... }` | Inline component definition (default) |

For compatibility, `import { Name } from "spec"` also works and produces the same result — both syntaxes register the name identically.

`from:` spec forms:

| Prefix | Resolved by bundler as |
|---|---|
| `pkg` or `npm:pkg` | npm package — `npm install pkg`, then `esbuild` re-exports it |
| `pkg@1.2.3` or `npm:pkg@1.2.3` | npm package with pinned version |
| `@scope/pkg` or `npm:@scope/pkg` | npm scoped package |
| `git:user/repo/path` | Raw specifier passed to esbuild; requires resolvable module |
| `github:user/repo/path` | Same as `git:` |
| `https://...`, `http://...`, path | Used as-is by esbuild |

## Key Reference (use these names)

| Key | Means | Applies to | Note
|---|---|---|
| `width` | canvas width | root |
| `height` | canvas height | root |
| `fps` | frame rate | root |
| `theme` | *removed — use `style` on root* | root |
| `tts` | CLI template string (e.g. `edge-tts --voice "en-US-GuyNeural" --text "{input}" --write-media "{output}"`) | root |
| `stt` | CLI template string (e.g. `whisper "{input}" --output_format vtt --output_dir "{output}"`) | root |
| `layout` | `series\|parallel\|transitionSeries` | root, scene | 
| `transition` | `fade\|slide\|wipe\|flip\|clockWipe` | transitionSeries |
| `transitionTime` | seconds | transitionSeries |
| `src` | media path/URL (for image/video/audio/include) | leaves (not component) |
| `duration` | seconds | leaves |
| `start` | parallel-only offset | parallel children |
| `startFrom` | trim from source start | video, audio |
| `endAt` | trim at source position | video, audio |
| `volume` | 0–1 | video, audio, rhythm |
| `foreground` | bool; ducks parent video audio while playing | audio |
| `spots` | number[] beat timestamps | rhythm |
| `fit` | `contain\|cover\|fill` | image |
| `loop` | int >1 | audio |
| `playbackRate` | number | video |
| `jsx` | usage JSX expression (`"<ComA value={42} />"`); compiled at runtime with registered imports in scope | component |
| `effects` | `[name, name(params...)]` e.g. `[fadeIn, bounceIn(1, ease-out, 2)]` | any leaf/container | Apply animations directly — no wrapper node needed |
| `waypoints` | `[lat,lng,"label";...]` | map |
| `travelMode` | `DRIVING\|WALKING\|BICYCLING\|TRANSIT` | map |
| `routeColor` | hex color e.g. `"#FF5733"` | map |
| `routeWeight` | int (default 4) | map |
| `zoom` | int (default 10) | map |
| `center` | `{lat:n,lng:n}` JSON | map |
| `mapType` | `roadmap\|satellite\|hybrid\|terrain` | map |
| `routeMarker` | emoji string e.g. `"🚗"` | map |
| `title` | display title | scene |
| `instruction` | visual intent / style / any prompt; NOT rendered | any |
| `script` | narration/dialogue text; TTS source; NOT rendered directly | audio | Only on audio nodes — see Narration section below |
| `tts` | CLI template string; per-scene TTS override (overrides root `tts`) | root, scene |
| `metadata` | arbitrary metadata string | root |
| `stylesheet` | global CSS string; selectors use `.className` on elements | root |
| `style` | inline CSS applied to the node's container div e.g. `"border-radius:12px"` | any |
| `visible` | bool default true; `false` hides without removing | any |
| `isBackground` | bool; loops to fill parent duration; does NOT count toward container duration — use for BGM or looping bg imagery | any |
| `on` | `on(when, state)` event spec; fires JS expression at a specific frame, mutating registered component state | any | See [Events](#events) section |
| `id` | unique string within parent scope | any |

## Type Catalog

Each type below shows: when to use, required keys, markdown syntax.

### `scene` (heading) — organizer (preferred)

When: always. `scene` is a container — scenes can nest inside other scenes via deeper headings (`##` → `###` → `####`).

Syntax:

```md
## <title>
layout:<x> [transition:<t> transitionTime:<n>] [instruction:..]
- <children>
```

Scene metadata (layout, instruction, transition) goes on the line(s) immediately below the heading, before any child bullets. This keeps the heading clean. `name` comes from the heading text (must be a single token — no spaces). For multi-word titles, use key-value `title:"Long Title"` on the metadata line. `title` optionally follows ` - ` in the heading (e.g. `## Chapter1 - The Beginning` splits to name=`Chapter1`, title=`The Beginning`).

For narration, use the `- script "..."` audio alias as a child of the scene (see [Narration / TTS](#narration--tts) below).

### `image`

When: photos, stills, title cards. Required: `src`, `duration`.

`- image src:cover.jpg duration:2 fit:cover`

### `video`

When: moving footage. Required: `src` + (`duration` or `endAt`).

`- video src:clip.mp4 startFrom:1 endAt:4 volume:0.8`

### `audio`

When: voiceover, BGM, SFX, TTS narration. Required: `src` + (`duration` or `endAt`).

`- audio src:bgm.mp3 duration:6 volume:0.4 loop:2`

### Narration / TTS

Narration text is set via the `script` field on audio nodes. There are three ways to provide it:

**1. Inline `script:` attribute on an audio node**

```md
- audio src:bg.mp3 duration:5 script:"Welcome to the course"
```

**2. Standalone `- script "..."` bullet (alias for audio)**

This is a shorthand that creates an audio node with the `script` field. Supports all standard audio keys:

```md
- script "Welcome to the course"
- script "Voiceover" volume:0.8 start:2 duration:5 foreground:true
```

**3. Code fence `~~~script` on an audio node**

For longer text, use an indented code fence:

```md
- audio src:bg.mp3 duration:10
  ~~~script
  This is a longer narration
  that spans multiple lines.
  ~~~
```

All three patterns produce an `audio` node with a `script` field. The pipeline's TTS resolver (`resolveScripts`) picks up these nodes, generates speech audio files, and sets the `src` field to the output path. The `script` field is consumed by the resolver and is not present in the compiled stream tree.

### `subtitle` (root-level overlay)

Subtitles are configured at the root level as a VTT overlay, not as tree nodes. Set via YAML frontmatter `subtitle:` or `root.subtitle` in JSON.

The `type` field selects an animated caption component from `remotion-subtitle`:

| Value | Component |
|---|---|
| *(omit)* | `Caption` — plain static text |
| `Bounce` | `BounceCaption` — bouncing entrance |
| `Fade` | `FadeCaption` — fade in |
| `Typewriter` | `TypewriterCaption` — typewriter reveal |
| `Colorful` | `ColorfulCaption` — rainbow text |
| `Glowing` | `GlowingCaption` — glow effect |
| `Neon` | `NeonCaption` — neon sign |
| `Zoom` | `ZoomCaption` — zoom in |

> **HTML in cue text**: Each cue's text is rendered via `dangerouslySetInnerHTML`, so you can use HTML tags with inline CSS to style individual words:
> ```vtt
> 00:00:01.000 --> 00:00:03.000
> The <span style="color:#ff6b6b;font-weight:bold">quick</span> brown <span style="font-style:italic">fox</span> jumps over the lazy dog
> ```
> The `Typewriter` caption animation correctly respects HTML tag boundaries (character reveal skips over tags, only animates visible text).

Each cue is rendered as a separate `<Sequence>` for optimal performance — inactive cues consume zero CPU.

See [JSON Descriptive](json-descriptive.md#subtitle-root-level-overlay) for the full field reference.

## Effects on Any Node

Apply animations directly via the `effects` key on **any** node (leaf or container). No wrapper node needed.

```md
- image src:hero.jpg duration:3 effects:[fadeIn]
- component duration:2 jsx:"<Title />" effects:[bounceIn]
- video src:clip.mp4 duration:4 effects:[fadeIn, slideInLeft]
```

### Parameterized syntax

Add positional parameters in parentheses — comma-separated.

```md
- image src:card.jpg duration:3 effects:[fadeIn(1.5)]
- image src:card.jpg duration:3 effects:[fadeIn(1.5, ease-out)]
- image src:card.jpg duration:3 effects:[fadeIn(1.5, ease-out, 2)]
```

Order: `(duration, timingFunction, iterationCount)`

| Position | Parameter | Example |
|---|---|---|
| 1st | `duration` (seconds) | `fadeIn(1.5)` |
| 2nd | `timingFunction` | `fadeIn(1.5, ease-out)` |
| 3rd | `iterationCount` | `fadeIn(1.5, ease-out, 2)` |

All parameters are optional — omit trailing ones.

### Multiple effects

Effects are applied outermost-first (first in the array is the outermost wrapper):

```md
- image src:hero.jpg duration:3 effects:[fadeIn, bounceIn]
```

### `component`

When: JSX expression rendered at runtime with registered imports in scope. Required for non-background components: `duration` . The `jsx` value can come from an inline attribute or an indented code fence.

Components must be registered via a `` ~~~js imports `` code block. Usage is via `jsx:"<TagName ... />"` on the component node.

```md
~~~js imports
import { StatCounter } from "stat-counter"
import { Logo } from "github:myorg/design#Logo"
~~~

# JSX usage (references registered components as tags)
- component duration:1 jsx:"<StatCounter value={42} />"
```

### Code fence properties

Properties that are too long for a single line can be provided via an indented code fence under the bullet item. The fence language (`~~~<lang> <propName>`) specifies which property to set:

```md
- component duration:4 isBackground:true
  ~~~jsx jsx
  <div style={{color:'#fff'}}>Hello</div>
  ~~~

- video start:5 volume:0
  ~~~prompt prompt
  animation of a robot learning to walk, cinematic lighting
  ~~~
```

The fence syntax is `~~~<lang> <propName>`. If `propName` is omitted, it defaults to `lang`. Common patterns:

| Fence | Sets property | Use case |
|---|---|---|
| `~~~jsx jsx` or `~~~jsx` | `jsx` | Component JSX expression |
| `~~~prompt prompt` | `prompt` | TTI/TTV generation prompt |
| `~~~script script` or `~~~script` | `script` | Narration text on audio nodes |

### `rhythm`

When: beat-synced audio (music drops, music-reactive reveals). Required: `src`, `spots`, `children`.

Each child is assigned to a beat slot: child[i] starts at `spots[i]`, ends at `spots[i+1]` (last child ends at the final beat). No `duration` field — it is derived from `spots` and children count.

```md
- rhythm src:beat.mp3 spots:[0.5,1.2,1.9]
    - image src:flash1.jpg
    - image src:flash2.jpg
    - image src:flash3.jpg
```

### `effect`

When: CSS keyframe animation wrapper. Required: `children`. `duration` falls back to children max.

`- effect animation:fadeIn duration:2` then indented children.

Built-in `animation` values:
`fadeIn fadeOut fadeInDown fadeInUp fadeInLeft fadeInRight fadeOutDown fadeOutUp fadeOutLeft fadeOutRight slideInDown slideInUp slideInLeft slideInRight slideOutDown slideOutUp slideOutLeft slideOutRight zoomIn zoomOut zoomInDown zoomInUp zoomInLeft zoomInRight bounce bounceIn rotateIn rotateOut rotateInDownLeft rotateInDownRight rotateInUpLeft rotateInUpRight flipInX flipInY pulse flash heartBeat rubberBand shakeX shakeY swing tada wobble jello rollIn rollOut jackInTheBox lightSpeedIn lightSpeedOut`

### `map`

When: animated route. Required: `duration`, `waypoints`.

`- map duration:3 travelMode:DRIVING waypoints:[37.77,-122.41,"SF";34.05,-118.24,"LA"]`

### `include`

When: external video JSON. Required: `src` + `duration`, or inline `children`.

`- include src:./child.json duration:4`

## Events

Fire a JavaScript expression at a specific frame to mutate a registered component's state. Useful for syncing UI state with narration beats.

### Registering a component for events

Add an `id` attribute to a `component` node to register it in the global event context:

```md
- component id:slide1 duration:4 jsx:"<Slide current={current}>{source}</Slide>"
```

The `id` becomes the variable name available in event expressions.

### Firing an event

Use `on(when, state)` on any node (audio, video, image, component, scene, etc.):

```md
- script "Narration 1" on(start, slide1.current=0)
- script "Narration 2" on(start, slide1.current++)
```

The `when` argument selects the target frame, and `state` is a JavaScript expression evaluated with all registered component proxies in scope.

### Supported `when` values

| Value | Fires at |
|---|---|
| `start` | Frame 0 (beginning of the node's timeline) |
| `end` | Last frame (end of the node's duration) |
| `50%` | 50% through the node's duration |
| `2.5s` | 2.5 seconds into the node (multiplied by root `fps`) |

Any percentage (`0%`–`100%`) or seconds value (`0s`, `1.5s`, `10s`) works.

### `state` expression

Any valid JavaScript expression — assign values, increment counters, toggle booleans:

```md
- script "Narration" on(start, slide1.current=0)
- script "Beat2" on(start, slide1.current++)
- script "Done" on(end, slide1.visible=false)
```

The expression is evaluated with all registered component IDs as scope variables. Each component variable is a Proxy whose property setter triggers a React re-render.

### JSON form

In the compiled stream tree, events are represented as an `on` field on any node:

```json
{
  "type": "audio",
  "src": "narration.mp3",
  "duration": 3,
  "on": { "when": "start", "state": "slide1.current=0" }
}
```

## Timing Rules

1. `duration` authoritative for non-trimmed leaves.
2. `video`/`audio` with `startFrom`+`endAt`: clip = `endAt − startFrom`.
3. `start` only in `parallel`.
4. `transitionTime` subtracted between `transitionSeries` items.
5. Containers derive duration from children (parallel=max, series=sum, ts=sum−overlap).

## Generation Workflow

1. Root: `# video` + `width:<n> height:<n> fps:<n> layout:<mode>` on the next line.
2. Frontmatter (optional): `---` block for root attrs + tts/stt pipeline config + `stylesheet`.
3. Component registrations: `` ~~~js imports `` block for external components.
4. Scenes via `##` with `layout:` metadata on the line below.
5. Leaves as `- type key:value ...` bullets indented under scenes.
6. Long values (JSX, prompts, scripts) use indented `~~~<lang> <propName>` code fences.
7. Verify each leaf has resolvable `duration`.

## Tween Animation

Animate numeric props over time by using `tween(from?, to, easing?)` expressions inside JSX usage expressions. Tweens resolve at render time using Remotion's `interpolate()`.

### Usage

Call `tween(from, to)` directly as a function inside the usage expression — it's available in the compiled scope:

```md
- component duration:4 jsx:"<BarChart data={[{name:'A',value:tween(0,80)},{name:'B',value:tween(0,60)}]}/>"
```

You can also use `tween()` in inline SVG:

```md
- component duration:4 jsx:"<svg viewBox='0 0 400 300'><rect y={260-tween(0,200)} width={80} height={tween(0,200)} fill='#E38627' /></svg>"
```

### Supported syntax

```
tween(to)                     — 0 → to, linear
tween(from, to)               — from → to, linear
tween(from, to, easeOut)      — with easing
tween(from, to, spring)       — spring animation
tween(#000, #FFF)             — color interpolation
```

### Important notes

- Tween values only work on `component` nodes.
- Frame range is derived from the component's `duration` (minus `start` offset).
- `tween()` uses Remotion's `interpolate()` with the component's action duration.
- At frame 0, `tween(from, to)` returns `from`.

## Self-Check

- [ ] Root has `width`, `height`, `fps`, `layout`.
- [ ] Every scene has ≥1 child or `script`.
- [ ] All values use explicit `key:value` syntax (no bare tokens).
- [ ] `start` only used inside `parallel` containers.
- [ ] No `src` on component nodes (use `jsx:` instead).
- [ ] Component registrations use `` ~~~js imports `` block — the ONLY supported method.
- [ ] Every component `jsx:` references a name registered in `` ~~~js imports ``.
- [ ] Every `jsx:` on a component node is a usage expression (JSX tag), not a definition.
- [ ] Inline component definitions go inside `` ~~~js imports `` as `export function Name(...) { ... }`.
- [ ] Scene names are single tokens (no spaces) — use `title:"..."` for multi-word titles.
- [ ] Code fence properties are indented under their parent bullet.
- [ ] Event targets (`id:name` on component) match the `id` used in `on(when, id.prop=value)` expressions.

## Validation with CLI

Use `markcut verify` to parse and validate a descriptive markdown file without rendering:

```bash
markcut verify courseware.md
```

## Example

```md
---
width: 1080
height: 1920
fps: 30
---
# video
layout:series
~~~js imports
export { StatCounter } from "stat-counter"
export { Logo } from "github:myorg/design-system#Logo"

export function Greeting({ name }) {
  return <div style={{color: '#fff', fontSize: 28, textAlign: 'center'}}>Hello {name}!</div>
}
~~~

## Hook
layout:parallel
- script "Set location and emotional tone"
- image src:cover.jpg duration:2

## Journey
layout:transitionSeries transition:fade transitionTime:0.4
- script "Move through moments"
- video src:clips/arrival.mp4 startFrom:0 endAt:3.5
- video src:clips/fire.mp4 startFrom:1 endAt:4

## Stat
layout:parallel
- component duration:2 jsx:"<StatCounter value={42} label='S-mores' />"

## Logo
layout:parallel
- component duration:1 jsx:"<Logo />"

## Route
layout:parallel
- map duration:3 travelMode:DRIVING waypoints:[37.7749,-122.4194,"SF";34.0522,-118.2437,"LA"]
```
