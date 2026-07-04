# Markdown Strict Descriptive (Agent Contract)

Complete reference for deterministic LLM video generation. No inference.

## Output Contract

A markdown document compiled into a renderable scene tree.

- Top heading `# video`
- Optional YAML-style frontmatter block `---\n...\n---\n` at the very top
- Root config line: `width height fps layout [theme]`
- Scenes via `##`/`###`/`####` headings
- Leaf nodes via `- typeToken ...` bullets
- Inline JSX component definitions via ```jsx Name code fences

## Frontmatter

An optional YAML-ish block at the top of the document, delimited by `---`. Supports:

- **Scalar root keys**: `width`, `height`, `fps`, `theme`, `tts`, `stt`, `layout`, etc.
- **`imports:`** array: each entry defines a component's origin (name + from/jsx/exports)

```yaml
---
width: 1080
height: 1920
fps: 30
theme: neon
imports:
  - StatCounter:
      from: npm:stat-counter
  - Logo:
      from: github:foo/bar/src/Logo.tsx
  - Banner:
      from: https://cdn.example.com/banner.js
  - InlineBadge:
      jsx: |
        export default ({text}) => <span style={{...}}>{text}</span>
---
```

Each import entry has:
- **`name`** — component name (used as JSX tag and lookup key)
- **`from:`** — source spec (see below)
- **`exports:`** — named export to pick (default: `"default"`)
- **`jsx:`** — inline component definition source (alternative to `from:`)

### Imports block (preferred)

Instead of YAML `imports:` in frontmatter, use a `` ```imports `` code block anywhere in the document. The block contains JavaScript `export` statements that register components. This is simpler for LLMs to generate and avoids YAML syntax issues.

````
```imports
export { PieChart } from "npm:recharts"
export { BarChart, LineChart } from "npm:recharts"
export { StatCounter as Counter } from "npm:stat-counter"
export function Hello({ name }) {
  return <div style={{color: '#fff'}}>Hello {name}</div>;
}
```
````

If an imports block is present, it **takes precedence** over the frontmatter `imports:` array.

Supported patterns inside the block:

| Pattern | Effect |
|---|---|
| `export { Name } from "spec"` | Registers `Name` from the resolved source |
| `export { Name as Alias } from "spec"` | Registers under `Alias` instead |
| `export { N1, N2 } from "spec"` | Registers multiple from the same source |
| `export function Name(...) { ... }` | Inline component definition |
| `export default function Name(...) { ... }` | Inline component definition (default) |

`from:` spec forms:

| Prefix | Resolves to |
|---|---|
| `npm:pkg` | `https://esm.sh/pkg` |
| `npm:pkg@1.2.3/Comp.js` | `https://esm.sh/pkg@1.2.3/Comp.js` |
| `git:user/repo` | `https://esm.sh/gh/user/repo` |
| `git:user/repo@br/path` | `https://esm.sh/gh/user/repo@br/path` |
| `github:user/repo@br/...` | same as `git:` |
| `https://...`, `http://...`, path | used as-is |

Body-level JSON `imports:[...]` is also supported:

## Key Reference (use these names)

| Key | Means | Applies to | Note
|---|---|---|
| `width` | canvas width | root |
| `height` | canvas height | root |
| `fps` | frame rate | root |
| `theme` | preset name (string) | root |
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
| `spots` | number[] beat timestamps | rhythm |
| `fit` | `contain\|cover\|fill` | image |
| `loop` | int >1 | audio |
| `playbackRate` | number | video |
| `componentName` | *removed — use `jsx:` instead* | component |
| `props` | `{...}` JSON | component |
| `jsx` | usage JSX expression (`"<ComA value={42} />"`); compiled at runtime with frontmatter imports in scope | component |
| `animation` | builtin name or `custom` | effect |
| `customKeyframes` | `{...}` JSON | effect |
| `waypoints` | `[lat,lng,"label";...]` | map |
| `travelMode` | `DRIVING\|WALKING\|BICYCLING\|TRANSIT` | map |
| `title` | display title | scene |
| `instruction` | visual intent / style / any prompt; NOT rendered | any |
| `script` | narration/dialogue text; TTS source; NOT rendered directly | scene |
| `tts` | `{cli:"..", voice:"..", options:{..}}` JSON; per-scene TTS override | root, scene |
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

Scene metadata (layout, instruction, script, transition) goes on the line(s) immediately below the heading, before any child bullets. This keeps the heading clean. `name` comes from the heading text; `title` optionally follows ` - ` in the heading. Only `scene` nodes carry `script` (TTS narration) — leaf nodes ignore it. When scenes nest, the **innermost** scene's `script` wins; parent scenes with a nested `script` child are skipped to prevent overlapping narration.

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

When: JSX expression rendered at runtime with frontmatter imports in scope. Required: `jsx`, plus `duration`.

All external components must be registered in frontmatter `imports:`. Component nodes use `jsx:"<TagName ... />"` to reference them.

Two ways to register components:

1. **Frontmatter `imports:`** — declare origin (`from:`, `jsx:`, `exports:`)
2. **```jsx Name** code fences — shorthand for `{ name, jsx: "..." }` entries

```md
# Frontmatter: declares origins
---
imports:
  - StatCounter:
      from: npm:stat-counter
  - Logo:
      from: github:myorg/design/src/Logo.tsx
  - Greeting:
      jsx: |
        export default ({name}) => <h1>Hello {name}</h1>
---

# JSX usage (references frontmatter components as tags)
- component dr:1 jsx:"<StatCounter value={42} />"

# JSX block (registers inline component)
\`\`\`jsx Greeting
export default ({name}) => <h1 style={{color:"#fff"}}>Hello {name}</h1>
\`\`\`
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

1. Root: `# video` + `width height fps layout`.
2. Scenes via `##` with `layout:` + `script:`.
3. Leaves as `- type ...` bullets under scenes.
4. Verify each leaf has resolvable duration.

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

- [ ] Root has width, height, fps, layout.
- [ ] Every scene has ≥1 child.
- [ ] No bare values; all explicit `key:value`.
- [ ] No `start` outside parallel.
- [ ] No `src` on component nodes.
- [ ] Every component `jsx:` references a name in frontmatter `imports:` or a ```jsx code block.
- [ ] Every `jsx:` on a component node is a usage expression (JSX tag), not a definition.

## Example

```md
---
width: 1080
height: 1920
fps: 30
theme: neon
imports:
  - StatCounter:
      from: npm:stat-counter
  - Logo:
      from: github:myorg/design-system/src/Logo.tsx
---
# video

## Hook
layout:parallel script:"Set location and emotional tone"
- image src:cover.jpg duration:2

## Journey
layout:transitionSeries transition:fade transitionTime:0.4 script:"Move through moments"
- video src:clips/arrival.mp4 startFrom:0 endAt:3.5
- video src:clips/fire.mp4 startFrom:1 endAt:4

## Stat
- component duration:2 jsx:"<StatCounter value={42} label='S-mores' />"

## Logo
- component dr:1 jsx:"<Logo />"

## JSX usage
- component duration:1 jsx:"<StatCounter value={99} />"

## Route
- map duration:3 travelMode:DRIVING waypoints:[37.7749,-122.4194,"SF";34.0522,-118.2437,"LA"]

\`\`\`jsx Greeting
export default function Greeting({ name }) {
  return <h1 style={{fontSize: 80, color: "#fff"}}>Hello {name}</h1>;
}
\`\`\`
```
