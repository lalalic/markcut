# Markdown Strict Descriptive (Agent Contract)

Complete reference for deterministic LLM video generation. No inference.

## Output Contract

A markdown document compiled into a renderable scene tree.

- Top heading `# video`
- Optional YAML-style frontmatter block `---\n...\n---\n` at the very top
- Root config line: `width:<n> height:<n> fps:<n> layout:<mode>` (key:value pairs on the line after `# video`)
- Scenes via `##`/`###`/`####` headings
- Leaf nodes via `- typeToken ...` bullets
- Component registrations via `` ~~~js imports `` code fence

## Frontmatter

An optional YAML-ish block at the top of the document, delimited by `---`. Use for **root configuration only** — widths croot attrs, and pipeline config (tts/stt). **Do not put imports here** — use a `` ~~~js imports `` code block instead (see below).

Supported root keys: `width`, `height`, `fps`, `tts` (JSON), `stt` (JSON), `layout`.

```yaml
---
width: 1080
height: 1920
fps: 30
tts:
  voice: zh-CN-XiaoxiaoNeural
  rate: +10%
stt:
  model: whisper-1
---
```

### Imports block (recommended)

Use a `` ~~~js imports `` code fence at end of the document (or anywhere in the body). The block contains real JavaScript module code with `import` and `export` statements that register components. This is simpler for LLMs to generate and avoids YAML syntax issues.

```
~~~js imports
import { PieChart } from "npm:recharts"
import { BarChart, LineChart } from "npm:recharts"
import { StatCounter as Counter } from "npm:stat-counter"

export function Hello({ name }) {
  return <div style={{color: '#fff'}}>Hello {name}</div>;
}
~~~
```

The imports block is the **primary** way to register components. The legacy YAML `imports:` array in frontmatter is still supported as a fallback, but the code block is preferred.

Supported patterns inside the block:

| Pattern | Effect |
|---|---|
| `import { Name } from "spec"` | Registers `Name` from the resolved source |
| `import { Name as Alias } from "spec"` | Registers under `Alias` instead |
| `import { N1, N2 } from "spec"` | Registers multiple from the same source |
| `import Default from "spec"` | Registers default import |
| `export function Name(...) { ... }` | Inline component definition |
| `export default function Name(...) { ... }` | Inline component definition (default) |

The `export { Name }` lines are optional — the `import` already registers the name. They're useful for readability.

`from:` spec forms:

| Prefix | Resolves to |
|---|---|
| `npm:pkg` | `https://esm.sh/pkg` |
| `npm:pkg@1.2.3` | `https://esm.sh/pkg@1.2.3` |
| `npm:pkg#module/path` | `https://esm.sh/pkg/module/path` — internal module |
| `npm:@scope/pkg#module` | `https://esm.sh/@scope/pkg/module` |
| `git:user/repo` | `https://esm.sh/gh/user/repo` |
| `git:user/repo@br/path` | `https://esm.sh/gh/user/repo@br/path` |
| `github:user/repo@br/...` | same as `git:` |
| `https://...`, `http://...`, path | used as-is |

The `#module` suffix separates the package name from an internal module path. It works with all prefixes: `npm:pkg#sub/path`, `git:user/repo#src/Comp.tsx`, etc. The `#` is replaced with `/` in the resolved URL.

## Key Reference (use these names)

| Key | Means | Applies to | Note
|---|---|---|
| `width` | canvas width | root |
| `height` | canvas height | root |
| `fps` | frame rate | root |
| `theme` | *removed — use `style` on root* | root |
| `tts` | `{cli:"..", voice:"..", options:{..}}` JSON TTS config | root |
| `stt` | `{model:"..", language:".."}` JSON STT config | root |
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
| `animation` | builtin name or `custom` | effect |
| `animationTimingFunction` | `linear\|ease\|ease-in\|ease-out\|ease-in-out` | effect |
| `animationIterationCount` | int (default 1) | effect |
| `customKeyframes` | `{...}` JSON `{"0":{opacity:"0"},"100":{opacity:"1"}}` | effect |
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
| `script` | narration/dialogue text; TTS source; NOT rendered directly | scene |
| `tts` | `{cli:"..", voice:"..", options:{..}}` JSON; per-scene TTS override | root, scene |
| `metadata` | arbitrary metadata string | root |
| `stylesheet` | global CSS string; selectors use `.type` and `.name` | root |
| `style` | inline CSS applied to the node's container div e.g. `"border-radius:12px"` | any |
| `visible` | bool default true; `false` hides without removing | any |
| `isBackground` | bool; loops to fill parent duration; does NOT count toward container duration — use for BGM or looping bg imagery | any |
| `id` | unique string within parent scope | any |

## Type Catalog

Each type below shows: when to use, required keys, markdown syntax.

### `scene` (heading) — organizer (preferred)

When: always. `scene` is a container — scenes can nest inside other scenes via deeper headings (`##` → `###` → `####`).

Syntax:

```md
## <title>
layout:<x> [transition:<t> transitionTime:<n>] [script:".." tts:{voice:".."}] [instruction:..]
- <children>
```

Scene metadata (layout, instruction, script, transition) goes on the line(s) immediately below the heading, before any child bullets. This keeps the heading clean. `name` comes from the heading text (must be a single token — no spaces). For multi-word titles, use key-value `title:"Long Title"` on the metadata line. `title` optionally follows ` - ` in the heading (e.g. `## Chapter1 - The Beginning` splits to name=`Chapter1`, title=`The Beginning`). Only `scene` nodes carry `script` (TTS narration) — leaf nodes ignore it. When scenes nest, the **innermost** scene's `script` wins; parent scenes with a nested `script` child are skipped to prevent overlapping narration.

### `image`

When: photos, stills, title cards. Required: `src`, `duration`.

`- image src:cover.jpg duration:2 fit:cover`

### `video`

When: moving footage. Required: `src` + (`duration` or `endAt`).

`- video src:clip.mp4 startFrom:1 endAt:4 volume:0.8`

### `audio`

When: voiceover, BGM, SFX. Required: `src` + (`duration` or `endAt`).

`- audio src:bgm.mp3 duration:6 volume:0.4 loop:2`

### `subtitle`

Subtitles are configured at the root level as a VTT overlay, not as tree nodes. Set `root.subtitle` in JSON, or provide a VTT file path via the pipeline. See [JSON Descriptive](json-descriptive.md) for details.

### `component`

When: JSX expression rendered at runtime with registered imports in scope. Required: `jsx`, plus `duration`.

All external components must be registered via a `` ~~~js imports `` code block. Component nodes use `jsx:"<TagName ... />"` to reference them.

Components must be registered via a `` ~~~js imports `` code block. Usage is via `jsx:"<TagName ... />"` on the component node.

```md
~~~js imports
import { StatCounter } from "npm:stat-counter"
import { Logo } from "github:myorg/design/src/Logo.tsx"
~~~

# JSX usage (references registered components as tags)
- component duration:1 jsx:"<StatCounter value={42} />"
```

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

## Timing Rules

1. `duration` authoritative for non-trimmed leaves.
2. `video`/`audio` with `startFrom`+`endAt`: clip = `endAt − startFrom`.
3. `start` only in `parallel`.
4. `transitionTime` subtracted between `transitionSeries` items.
5. Containers derive duration from children (parallel=max, series=sum, ts=sum−overlap).

## Generation Workflow

1. Root: `# video` + `width:<n> height:<n> fps:<n> layout:<mode>` on the next line.
2. Frontmatter (optional): `---` block for root attrs + tts/stt pipeline config.
3. Component registrations: `` ~~~js imports `` block near the end (or anywhere).
4. Scenes via `##` with `layout:` + `script:` metadata on the line below.
5. Leaves as `- type key:value ...` bullets indented under scenes.
6. Verify each leaf has resolvable `duration`.

## Tween Animation

Animate numeric props over time by using `tween(from?, to, easing?)` expressions inside JSX usage expressions. Tweens resolve at render time using Remotion's `interpolate()`.

### Usage

Call `tween(from, to)` directly as a function inside the usage expression — it's available in the compiled scope:

```md
- component duration:4 jsx:"<BarChart data={[{name:'A',value:tween(0,80)},{name:'B',value:tween(0,60)}]} keys={['value']} indexBy='name' />"
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
- [ ] Every scene has ≥1 child.
- [ ] All values use explicit `key:value` syntax (no bare tokens).
- [ ] `start` only used inside `parallel` containers.
- [ ] No `src` on component nodes (use `jsx:` instead).
- [ ] Component registrations use `` ~~~js imports `` block — the ONLY supported method.
- [ ] Every component `jsx:` references a name registered in `` ~~~js imports ``.
- [ ] Every `jsx:` on a component node is a usage expression (JSX tag), not a definition.
- [ ] Inline component definitions go inside `` ~~~js imports `` as `export function Name(...) { ... }`.
- [ ] Scene names are single tokens (no spaces) — use `title:"..."` for multi-word titles.

## Example

```md
---
width: 1080
height: 1920
fps: 30
---
# video
layout:series

## Hook
layout:parallel script:"Set location and emotional tone"
- image src:cover.jpg duration:2

## Journey
layout:transitionSeries transition:fade transitionTime:0.4 script:"Move through moments"
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

~~~js imports
import { StatCounter } from "npm:stat-counter"
import { Logo } from "github:myorg/design-system#Logo.tsx"

export function Greeting({ name }) {
  return <div style={{color: '#fff', fontSize: 28, textAlign: 'center'}}>Hello {name}!</div>
}
~~~
```
