# markcut Markdown Descriptive Spec
markcut Markdown Descriptive is a markdown-based authoring format for markcut. It is designed to be human-readable and writable, while also being machine-parsable. It is the primary authoring format for markcut, and is used for both interactive and non-interactive workflows.


## DSL — Complete Grammar Reference

This section defines the markcut Markdown Descriptive grammar. An agent should read this to understand the exact syntax rules for constructing or parsing a `.md` video document.

### 1. Document Structure (top to bottom)

```
┌─ YAML Frontmatter (optional)
├─ ───...───
│   hook: My Video
│   emotion: ...
│   ───...───
├─ # video                    ← Root node (REQUIRED, heading level 1)
│   width:1080 height:1920 fps:30 layout:series
│   subtitle:{src:"captions.vtt",type:"Typewriter"}
│   ~~~css stylesheet           ← root.stylesheet
│   .bg { background: #000; }
│   ~~~
├─  ~~~js imports                ← Imports block
│   export { PieChart } from "recharts"
│   ~~~
├─ ## scene1                  ← Scene nodes (heading level 2+)
│   layout:parallel
│   - image src:bg.jpg duration:3
│   - script "Hello world"
│   ### sub-scene             ← Nested scene (heading level 3)
│       - component duration:2 jsx:"<Title />"
├─ ## scene2
│   - video src:clip.mp4 effects:[fadeIn]
├─ # zh                       ← Variant sections (h1 headings OTHER than `video`)
│   tts:"edge-tts --voice zh-CN-YunxiNeural..."  ← override root.tts for zh variant
├─ # youtube                  ← Variant sections
    width:1920 height:1080
```

### 2. Heading Levels & Their Roles

| Level | Pattern | Role | Rules |
|---|---|---|---|
| H1 | `# video` | **Root** — video canvas definition | Exactly one `# video` required. Everything else is nested inside this section. |
| H1 | `# zh`, `# youtube`, `# portrait` etc. | **Variant** — override section for alternate versions | Any `# <name>` other than `video`. Only contains override configs + variant-prefixed overrides on base nodes. |
| H2 | `## <name>` | **Scene** — top-level scene container | `name` = single word (no spaces).|
| H3 | `### <name>` | **Nested scene** — sub-scene inside parent | Same rules as H2. Creates nesting: parent scene's children array includes this as a sub-container. |
| H4+ | `#### <name>` | **Deeply nested** — further nesting | Works identically; depth reflects nesting level. |

### 3. Leaf Nodes — Bullet Syntax

Every leaf (media, component, rhythm, map, effect, include) is a **markdown bullet** (`- `) containing space-separated tokens:

```
- <typeToken> [key:value ...] [bareFlag ...]
```

Where:
- **`typeToken`** — the node type (see table below). Required as first token.
- **`key:value`** — property assignments. Space-separated. Values with spaces must be quoted: `title:"Long Title"`, `instruction:"make it cinematic"`.
- **`bareFlag`** — boolean property that defaults to `true` when present (no `:value` needed). Examples: `isBackground`, `foreground`, `visible`.

#### Type Token Reference

| Token | Stream Type | When | Required Keys |
|---|---|---|---|
| `image` | `image` | Still photos, title cards | `src`, `duration` |
| `video` | `video` | Video clips | `src` + (`duration` or `endAt`) |
| `audio` | `audio` | Voiceover, BGM, SFX | `src` + (`duration` or `endAt`) |
| `script "..."` | `audio` | Narration/TTS (shorthand for audio with script) | `script` text (the `"..."` is the primary content) |
| `component` | `component` | JSX React component | `jsx` (inline or code fence) + `duration` (unless `isBackground`) |
| `rhythm` | `rhythm` | Beat-synced audio with timed children | `src`, `spots`, `children` |
| `map` | `map` | Animated route visualization | `duration`, `waypoints` |
| `include` | `include` | Embed external `.md` sub-video | `src` (path to another `.md` file) |
| `parallel` | *container* | Parallel layout container | `children` (indented bullets below) |
| `series` | *container* | Sequential layout container | `children` (indented bullets below) |
| `transitionSeries` | *container* | Sequential with transitions | `children`, `transition` (e.g. `transition:fade`) |

### 4. Property Value Formats

| Format | Example | Description |
|---|---|---|
| `key:number` | `duration:3`, `width:1080`, `volume:0.8` | Numeric values (int or float). Seconds for time values. |
| `key:string` | `src:cover.jpg`, `fit:cover`, `animation:fadeIn` | Unquoted single-word string. |
| `key:"quoted string"` | `title:"Long Title"`, `jsx:"<StatCounter value={42} />"` | Quoted string for values containing spaces or special chars. Supports double `"` and single `'` quotes. |
| `bareFlag` | `isBackground`, `foreground` | Boolean flag — sets the key to `true` when present. |
| `key:JSON` | `spots:[0.5,1.2,1.9]`, `on:(start, slide.current=0)`, `effects:[fadeIn, bounceIn]` | Structured values using brackets/parens. See subsections below. |
| `key:<mode>` | `layout:series` | Enum-like mode selection. |
| `~~~<lang> [propName=lang]` | `~~~jsx jsx`, `~~~script script` | Indented code fence for long-form property values (JSX, script, prompt, etc.). See section 6. |

### 5. Structured Property Patterns

#### Effects — `effects:[name, name(params...)]`

Apply animations on any leaf or container. No wrapper node needed.
Built-in `animation` values:
`fadeIn fadeOut fadeInDown fadeInUp fadeInLeft fadeInRight fadeOutDown fadeOutUp fadeOutLeft fadeOutRight slideInDown slideInUp slideInLeft slideInRight slideOutDown slideOutUp slideOutLeft slideOutRight zoomIn zoomOut zoomInDown zoomInUp zoomInLeft zoomInRight bounce bounceIn rotateIn rotateOut rotateInDownLeft rotateInDownRight rotateInUpLeft rotateInUpRight flipInX flipInY pulse flash heartBeat rubberBand shakeX shakeY swing tada wobble jello rollIn rollOut jackInTheBox lightSpeedIn lightSpeedOut`

`- effect animation:fadeIn duration:2` then indented children.

```
- image src:hero.jpg duration:3 effects:[fadeIn(1.5, ease-out, 2)]
- image src:hero.jpg duration:3 effects:[fadeIn, bounceIn(1, ease-out)]
```

Params: `(duration=1s, timingFunction=linear, iterationCount=1)` — all optional, comma-separated.

#### Events — `on:(when, state)`

Fire JS expression at a specific frame to mutate component state.

```
- script "Narration" on:(start, slide.current=0)
- script "Beat" on:(50%, slide.current++)
```

`when`: `start`/`end`/`50%` (percent) / `2.5s` (seconds value). `state`: any JS expression.

#### Lists — `spots:[n,n,n]`, `start:n`

```
- rhythm src:beat.mp3 spots:[0.5,1.2,1.9]
```

#### Waypoints — `waypoints:[lat,lng,"label"; lat,lng,"label"]`

Semicolons separate waypoints, commas separate fields within one waypoint.

```
- map duration:3 waypoints:[37.77,-122.41,"SF";34.05,-118.24,"LA"]
```

#### Duration shorthand

`duration:n` is syntactic sugar for `end:start+duration` (both `start` and `end` default to 0 when absent). If `end` is set explicitly, `duration` is ignored.

### 6. Long-Form Properties — Indented Code Fences

When a property value is too long for a single line (JSX, prompts, scripts, markdown source), use an **indented code fence** under the bullet:

```md
- component duration:4
  ~~~jsx jsx
  <StatCounter value={42} />
  ~~~
- video start:5 volume:0
  ~~~prompt prompt
  animation of a robot learning to walk, cinematic lighting
  ~~~
- audio src:bg.mp3 duration:10
  ~~~script
  This is a longer narration that spans multiple lines.
  ~~~
```

**Syntax**: `~~~<lang> [propertyName=lang]`. If `propertyName` is omitted, it defaults to `lang`.

| Fence | Sets property | Use case |
|---|---|---|
| `~~~jsx jsx` or `~~~jsx` | `jsx` | Component JSX expression |
| `~~~prompt prompt` | `prompt` | TTI/TTV generation prompt |
| `~~~script script` or `~~~script` | `script` | Narration text on audio nodes |
| `~~~css stylesheet` | `stylesheet` | Global CSS (only valid at root level) |
| `~~~md <key>` | arbitrary | Markdown content for a specific key (e.g., `source` for `react-markdown`) |

### 7. Scene Metadata Block

Scene properties go on the **line(s) immediately below the heading**, before any child bullets:

```md
## MyScene
layout:parallel transition:fade transitionTime:1.2
title:"My Scene Title" instruction:"Cinematic intro"
- image src:bg.jpg duration:3
- script "Narration here"
```

Multiple metadata lines are allowed. They're parsed as space-separated key:value pairs per line.

### 8. Imports Block — Component Registry

A `` ~~~js imports `` code fence (typically at the end of the document) registers external React components for use in `jsx:` expressions:

```md
~~~js imports
export { PieChart } from "recharts"
export { StatCounter as Counter } from "stat-counter"
export function Hello({ name }) {
  return <div style={{color: '#fff'}}>Hello {name}</div>;
}
~~~
```

Patterns: `export { Name } from "spec"`, `export { Name as Alias } from "spec"`, `export function Name(...) { ... }`, `import { Name } from "spec"` (also works).

### 9. Variant Overrides Syntax

Variant sections (`# zh`, `# portrait`, etc.) provide root-level overrides. Leaf nodes use **variant-prefixed keys** or **bare variant keys** to override content per variant:

```md
# video
- script "English text"            ← base value
  zh:"中文文本"                     ← bare variant key: replaces "script" (primary key for audio)
- component jsx:"<Slide>{source}</Slide>"
  ~~~md source                     ← base value for key "source"
  ## English title
  ~~~
  ~~~md zh-source                  ← variant-prefixed: replaces "source" when variant=zh
  ## 中文标题
  ~~~
```

| Override type | Syntax | What it replaces |
|---|---|---|
| **Bare variant key** | `zh:"value"` | Node's primary content key (`script` for audio, `jsx` for component, `src` for image/video) |
| **Variant-prefixed key** | `zh-src:path` | Specific key matching the suffix (`zh-src` → replaces `src`) |
| **Variant-prefixed code fence** | `~~~md zh-source` | Same as above, for code-fence-backed properties |

### 10. Root Config Line

The line after `# video` holds canvas-level config as space-separated `key:value` pairs:

```markdown
# video
width:1920 height:1080 fps:30 layout:series transition:fade transitionTime:1.2
subtitle:{src:"captions.vtt",type:"Typewriter",fontSize:48}
```

Supported root keys: `width`, `height`, `fps`, `layout`, `tts`, `stt`, `tti`, `ttv`, `transition`, `transitionTime`, `instruction`, `metadata`, `stylesheet`, `subtitle`, `voices`.

Values containing spaces (like JSON for `subtitle:` or `voices:`) must be quoted with double or single quotes, or wrapped in `{...}`/`[...]` brackets which the parser handles natively.

### 11. Frontmatter (Metadata Only)

Optional YAML block at the very top, delimited by `---`. **Does NOT affect video config** — only for metadata:

```yaml
---
title: My Campaign
description: Q4 product launch
hook: ...
conflict: ...
emotion: ...
ending: ...
---
```

All video configuration comes from the root config line (section 10), NOT from frontmatter.

### 12. Minimal Valid Document

```markdown
# video
width:1080 height:1920 fps:30 layout:series

## Scene1
- image src:bg.jpg duration:3
- script "Hello world"
```

### 13. `src` Path Resolution — Context Root
all src paths are resolved relative to the markdown file's location. For example, if your markdown file is at `./videos/course.md`, then `src:./assets/bg.jpg` resolves to `./videos/assets/bg.jpg`. Absolute paths (starting with `/`) are resolved relative to the project root.


### 14. verify
- all assets path are resolved relative to the markdown file's location. 
- `npx @lalalic/markcut verify book.md` to verify the markdown document is valid and can be rendered. It will check for missing required fields, invalid values, and other common issues.


## Template Variables

`${width}`, `${height}`, `${fps}`, and `${variant}` can be used in `src`,
`prompt`, and `stylesheet` values. They are resolved at compile time using
the root config values.

```markdown
# video
width:1920 height:1080
```

- `src:photo_${width}x${height}.jpg` → `photo_1920x1080.jpg`
- `prompt:"generate an image at ${width}x${height}"` → `generate an image at 1920x1080`
- `stylesheet:".hero { width: ${width}px; }"` → `.hero { width: 1920px; }`

> Template variables are NOT resolved in root config keys, jsx, script, style,
> or other string fields — only in `src`, `prompt`, and `stylesheet`.

### Subtitle

Subtitles are configured at the root level as a VTT overlay. Set via `subtitle:` on the root config line, or `root.subtitle` in JSON.

| Field | Required | Type | Notes |
|---|---|---|---|
| `type` | opt | string | caption animation: `Bounce`, `Fade`, `Typewriter`, `Colorful`, `Glowing`, `Neon`, `Zoom`. Default: plain static caption |
| `fontSize` | opt | number \| string | default 56 (accepts CSS value like `"2em"` or number) |
| `fontFamily` | opt | string | font family |
| `fontStyle` | opt | string | `normal`, `italic`, `bold`, `bold italic` |
| `style` | opt | string | inline CSS for the overlay container |

## Key Reference (use these names)

| Key | Means | Applies to | Note
|---|---|---|
| `width` | canvas width | root |
| `height` | canvas height | root |
| `fps` | frame rate | root |
| `theme` | *removed — use `style` on root* | root |
| `tts` | text-to-speech CLI template string  | root |
| `stt` | speech-to-text CLI template string  | root |
| `tti` | text-to-image CLI template string  | root |
| `ttv` | text-to-video CLI template string  | root |
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
| `speaker` | speaker name for multi-turn dialogue; set automatically by dialogue expansion | audio | Used for per-speaker voice lookup and subtitle prefix |
| `voices` | JSON object mapping speaker names to extra TTS CLI flags e.g. `{"Ray":"--voice en-US-GuyNeural"}` | root | Flags are appended to the resolved TTS CLI template |
| `metadata` | arbitrary metadata string | root |
| `stylesheet` | global CSS string; selectors use `.className` on elements | root |
| `style` | inline CSS applied to the node's container div e.g. `"border-radius:12px"` | any |
| `visible` | bool default true; `false` hides without removing | any |
| `isBackground` | bool; loops to fill parent duration; does NOT count toward container duration — use for BGM or looping bg imagery | any |
| `on` | `on:(when, state)` event spec; fires JS expression at a specific frame, mutating registered component state | any | See [Events](#events) section |
| `id` | unique string within parent scope | any |

## Type Catalog

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
- script "Voiceover" volume:0.8 start:2 foreground:true
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

#### Multi-turn Dialogue

When a `script` contains multiple lines matching `SpeakerName: text` format, the pipeline automatically expands it into a multi-turn dialogue where each line becomes a separate audio node with its own TTS generation. This allows different speakers to have different voices.

```md
- script 
  ~~~script
  Ray: Hello everyone and welcome
  Alice: Good day to you all
  Ray: Let's get started
  ~~~
```

The dialogue lines play sequentially. Each line is transcribed separately, and subtitles include the speaker prefix (e.g., `Ray: Hello everyone and welcome`).

##### Per-Speaker Voices

Configure different TTS voices for each speaker via the root `voices` config. Each value is **extra CLI flags** appended to the TTS template:

```md
# video
voices:{"Ray":"--voice en-US-GuyNeural","Alice":"--voice en-US-JennyNeural"}
- script "Ray: Tell us about your project
Alice: I'm working on something exciting"
```

Since values are raw CLI flags, they naturally support voice cloning, rate, pitch:

```md
voices:{"Ray":"--voice en-US-GuyNeural --rate +20%","Clone":"--voice clone-xxx --pitch +5Hz"}
```

The final TTS command for a speaker: `<root tts cli> <speaker voice flags>`.

### `rhythm`

When: beat-synced audio (music drops, music-reactive reveals). Required: `src`, `spots`, `children`.

Each child is assigned to a beat slot: child[i] starts at `spots[i]`, ends at `spots[i+1]` (last child ends at the final beat). No `duration` field — it is derived from `spots` and children count.

```md
- rhythm src:beat.mp3 spots:[0.5,1.2,1.9]
    - image src:flash1.jpg
    - image src:flash2.jpg
    - image src:flash3.jpg
```

### `map`

When: animated route. Required: `duration`, `waypoints`.

`- map duration:3 travelMode:DRIVING waypoints:[37.77,-122.41,"SF";34.05,-118.24,"LA"]`

### `include`

When: embed an external markdown file as a sub-video. The sub-video is
fully resolved by the pipeline (TTS, media, includes, component imports).

The sub-video can have its own ` ```js imports ``` ` block — components
are bundled independently and available in an isolated `ComposeContext`
at render time (nested context, "sub-video wins" priority).

`- include src:./sub-video.md`

> **Note:** `duration` is optional — the pipeline compiles the sub-video
> to determine its real duration. The compiled JSON is cached at
> `.markcut/generated/includes/<hash>.json` so repeated runs are fast.
>
> Component imports from the sub-video are bundled to
> `.markcut/<sub-basename>/components/<hash>.js`.

## Events

Fire a JavaScript expression at a specific frame to mutate a registered component's state. Useful for syncing UI state with narration beats.

### Registering a component for events

Add an `id` attribute to a `component` node to register it in the global event context:

```md
- component id:slide1 duration:4 jsx:"<Slide current={current}>{source}</Slide>"
```

The `id` becomes the variable name available in event expressions.

### Firing an event

Use `on:(when, state)` on any node (audio, video, image, component, scene, etc.):

```md
- script "Narration 1" on:(start, slide1.current=0)
- script "Narration 2" on:(start, slide1.current++)
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
- script "Narration" on:(start, slide1.current=0)
- script "Beat2" on:(start, slide1.current++)
- script "Done" on:(end, slide1.visible=false)
```

The expression is evaluated with all registered component IDs as scope variables. Each component variable is a Proxy whose property setter triggers a React re-render.

## Variants (Language / Platform / Any Override)

Produce different versions of the same video from a single markdown file
— for example, Chinese and English narration, portrait and landscape layouts,
or TikTok and YouTube versions.

### How it works

The document has a **base section** (`# video`) that defines the default video.
Additional **variant sections** (`# zh`, `# portrait`, `# tiktok`) contain
root-level config overrides. Leaf nodes in the base section carry
variant-prefixed keys to override specific fields per variant.

### 1. Define a variant section

A variant is a top-level `# <name>` heading. It can override root config
keys (like `tts`, `width`, `height`):

```markdown
# video
layout:series width:1920 height:1080 fps:30
tts:"edge-tts --voice 'en-US-GuyNeural' --text '{input}' --write-media '{output}'"

## Hook
- image prompt:"..."

## Title
- script "Welcome to the course"
- component jsx:"<Slide>{source}</Slide>"
  ~~~md source
  # Hello
  ~~~

# zh
tts:"edge-tts --voice 'zh-CN-YunxiNeural' --text '{input}' --write-media '{output}'"
```

The `# zh` section only needs the keys that differ from the base —
here the TTS voice is switched to Chinese. The video's width, height, fps,
scenes and all content remain inherited from `# video`.

### 2. Override leaf values

Always write variant overrides on a **new indented line** under the bullet,
never inline on the same line. This keeps the base declaration clean and
makes variants easy to scan:

```markdown
# video
- script "Welcome to the course"
  zh:"欢迎来到本课程"
- component jsx:"<Slide>{source}</Slide>"
  ~~~md source
  ## English title
  ~~~
  ~~~md zh-source
  ## 中文标题
  ~~~
```

Two mechanisms for overriding content per-variant on individual nodes:

**Variant-prefixed keys** (`zh-<key>`) — replace a specific field.
The prefix (`zh-`) matches the variant section name (`# zh`):

```markdown
- component jsx:"<Slide>{source}</Slide>"
  ~~~md source      ← base value for key "source"
  ## English title
  ~~~
  ~~~md zh-source   ← overrides "source" when --variant zh is used
  ## 中文标题
  ~~~
```

Here `zh-source` replaces `source` when the `zh` variant is active.
Code-fence-backed props (`~~~md source`, `~~~js jsx`) use variant-prefixed
keys the same way as inline attributes: the code fence's prop name gets
the variant prefix.

**Bare variant keys** (`zh`) — replaces the node's "primary content" field
(meaning depends on node type):

| Node type | Primary key | `zh` replaces |
|---|---|---|
| `audio` / `- script` | `script` | narration text |
| `component` | `jsx` | JSX expression |
| `image` | `src` | image path |
| `video` | `src` | video path |

```markdown
- script "Welcome to the course"
  zh:"欢迎来到本课程"
```

Here `zh` replaces `script` on the audio node, switching the narration text
to Chinese when the variant is active.

### 3. Run with a variant

```bash
# Preview Chinese version
npx markcut preview courseware.md --variant zh

# Preview with multiple variants (e.g. Chinese + TikTok portrait)
npx markcut preview courseware.md --variant zh --variant tiktok

# Render Chinese version
npx markcut render courseware.md --variant zh --output zh-video.mp4
```

### Combined variants

`--variant` value support multiple variants joined by `-` to merge multiple override sections. For example, `--variant zh-tiktok` merges the `# zh` and `# tiktok` sections into the base config.

```bash
npx markcut preview courseware.md --variant zh-tiktok
# Uses .markcut/courseware/zh-tiktok/ for variant artifacts
```

### Root config override priority

When a variant section provides a root-level key (e.g., `tts`), it merges
into the base config. Scene-level `tts` overrides root-level `tts`,
and the `ttsCli` option (if provided) overrides both.

TTS audio files are content-addressed (hash of `script + CLI`), so
identical scripts across variants produce the same file. The merged
`subtitles.vtt` is per-variant because script content and timing offsets
differ.

## Timing Rules

1. `duration` authoritative for non-trimmed leaves.
2. `video`/`audio` with `startFrom`+`endAt`: clip = `endAt − startFrom`.
3. `start` only in `parallel`.
4. `transitionTime` subtracted between `transitionSeries` items.
5. Containers derive duration from children (parallel=max, series=sum, ts=sum−overlap).

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

# Common used components
- `react-markdown` — render markdown content, use plugins to extend functionality
  - `remark-gfm` — support GitHub Flavored Markdown (tables, strikethrough, task lists)
  - `remark-toc` — generate table of contents
  - `remark-math` — support math formulas
  - `rehype-katex` — render math formulas with KaTeX
  - `remark-mermaidjs` — render mermaid diagrams in 
- `react-markdown-mermaid` — render mermaid diagrams in standalone mode (no need to install mermaid separately)

- `@remotion/shapes` — render shapes like arrows, circles, rectangles, etc
- `@remotion/starburst` — render starburst animations

# Best practices
- Markcut engine will automatically determine the duration of background streams, video, script audio. Don't set duration for them if no special requirements (e.g., speed up/down on purpose).
- global streams (BGM, Logo, Lip-sync video,...) should be set on root level, and set `isBackground:true` to let it loop to fill the whole video duration.
- Set `isBackground:true` for static vision content, such as image, when audio is playing
- adjust audio start time with `start` property to avoid audio cut when transition effect is applied on vision scene


~~~ example - avoid audio cut
- parallel
  - image|video isBackground:true
  - audio|script 
~~~

~~~ example - global streams
#video
- audio isBackground:true src:bgm.mp3
- component isBackground:true jsx:"<Logo />" style:"position:fixed;top:10px;left:10px;width:100px;height:100px;"
- parallel title:"lip sync" style:"position:fixed;bottom:100px;right:100px;width:100px;height:100px;"
  - video src:background.mp4 isBackground:true
  - video src:lip_sync.mp4
~~~

~~~ example - styling VTT captions
```vtt
000:00:00.000 --> 00:00:05.000
It's a <span style="color:#ff6b6b;font-weight:bold">Bear</span>.

000:00:05.000 --> 00:00:10.000
And now it's <span class="emoji-dead">dead</span>.

000:00:10.000 --> 00:00:15.000
<span class="bong">Bong!</span>
```

#root
```css stylesheet
.emoji-dead {
  font-family: "Funny Emoji", sans-serif;
  font-size: 48px;
}
.bong {
  color: #ff6b6b;
  font-weight: bold;
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  animation: bong 1s ease-in-out infinite;
}
```
~~~

~~~ example - sync vision and audio, taking care of transition timing, dynamic audio duration
#video
layout:series transition:fade transitionTime:1.2

## hello layout:parallel
  - image src:vision.jpg isBackground:true  # set vision as background let script/audio play in front determine the duration of the scene
  - script "..."                            # don't set duration for script/audio, markcut resolver will determine the duration of the scene based on the final audio length
    start:1.2                               # let vision play for 1.2s before the script/audio start, so that the transition effect can be completed

~~~