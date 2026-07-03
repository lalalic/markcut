# Markdown Strict Descriptive (Agent Contract)

Complete reference for deterministic LLM video generation. No inference.

## Output Contract

A markdown document compiled into a renderable scene tree.

- Top heading `# video`
- Root config line: `width height fps layout [theme]`
- Scenes via `##`/`###`/`####` headings
- Leaf nodes via `- typeToken ...` bullets

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
| `src` | media path/URL | leaves |
| `duration` | seconds | leaves |
| `start` | parallel-only offset | parallel children |
| `startFrom` | trim from source start | video, audio |
| `endAt` | trim at source position | video, audio |
| `volume` | 0–1 | video, audio, rhythm |
| `spots` | number[] beat timestamps | rhythm |
| `fit` | `contain\|cover\|fill` | image |
| `loop` | int >1 | audio |
| `playbackRate` | number | video |
| `componentName` | registry key | component |
| `props` | `{...}` JSON | component |
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

When: charts, headlines, mockups. Required: `componentName`, `duration`.

Built-in names: `AnimatedHeadline`, `TypewriterText`, `GlitchReveal`, `TextCard`, `CalloutBox`, `EndTag`, `DeviceMockup`, `CursorFlyover`, `ComparisonSlider`, `StatCounter`, `ProgressBar`, `BarChart`, `LineChart`, `PieChart`, `ComparisonCard`, `GradientBackground`, `ParticleField`, `LightLeak`, `SplitScreen`, `SpotlightReveal`.

`- component componentName:StatCounter duration:2 props:{value:42,label:"Growth"}`

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

## Self-Check

- [ ] Root has width, height, fps, layout.
- [ ] Every scene has ≥1 child.
- [ ] No bare values; all explicit `key:value`.
- [ ] No `start` outside parallel.
- [ ] All `componentName` from the built-in list (or host-registered).

## Example

```md
# video
width:1080 height:1920 fps:30 layout:series theme:neon script:"A short memory film"

## Hook
layout:parallel script:"Set location and emotional tone"
- image src:cover.jpg duration:2

## Journey
layout:transitionSeries transition:fade transitionTime:0.4 script:"Move through moments"
- video src:clips/arrival.mp4 startFrom:0 endAt:3.5
- video src:clips/fire.mp4 startFrom:1 endAt:4

## Stat
- component componentName:StatCounter duration:2 props:{value:42,label:"S'mores"}

## Route
- map duration:3 travelMode:DRIVING waypoints:[37.7749,-122.4194,"SF";34.0522,-118.2437,"LA"]
```
