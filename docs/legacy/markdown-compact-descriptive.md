# Markdown Compatible Descriptive (Agent Drafting)

Complete reference for token-efficient LLM video generation with controlled inference.

## Output Contract

A markdown document compiled via the compatible parser.

- Top heading `# video`
- Root config line (short keys allowed)
- Scenes via headings
- Leaves via `- ...` bullets (type optional when src infers it)

## Key Aliases (short ⇄ full)

Both forms accepted. Short forms save tokens.

| Short | Full |
|---|---|
| `w` | `width` |
| `h` | `height` |
| `lo` | `layout` |
| `n` | `name` |
| `t` | `title` |
| `dsc` | `description` |
| `q` | `script` |
| `dr` | `duration` |
| `st` | `start` |
| `sf` | `startFrom` |
| `ea` | `endAt` |
| `vol` | `volume` |
| `tr` | `transition` |
| `tt` | `transitionTime` |
| `p` | `props` |
| `wp` | `waypoints` |
| `tm` | `travelMode` |
| `rm` | `routeMarker` |
| `bg` | `isBackground` | true = loops to fill parent; excludes from container duration |

Meaning of important keys:

| Key | Purpose |
|---|---|
| `q` / `script` | narration/dialogue for TTS; not rendered directly |
| `dsc` / `description` | visual intent or style guide; not rendered |
| `style` | inline CSS applied to node container div, e.g. `"opacity:0.8; border-radius:8px"` |
| `visible` | bool, default true; `false` hides without deleting |
| `isBackground` / `bg` | loops to fill parent duration; does **not** contribute to container duration — use for BGM, looping bg video/image |

## Type Tokens (short ⇄ full)

| Short | Full | Type |
|---|---|---|
| `i` | `image` | image |
| `v` | `video` | video |
| `a` | `audio` | audio |
| `t` | `subtitle` | subtitle |
| `c` | `component` | component |
| `r` | `rhythm` | rhythm |
| `in` | `include` | include |
| `fx` | `effect` | effect |
| `m` | `map` | map |
| `ser`/`par`/`ts` | `series`/`parallel`/`transitionSeries` | container |

## Inference Rules (compatible only)

1. **Type from src**: omit token when extension is unambiguous.
   - `.png/.jpg/.jpeg/.webp/.gif` → image
   - `.mp4/.mov/.mkv/.webm` → video
   - `.mp3/.wav/.m4a/.aac/.flac` → audio
   - `.vtt` → subtitle
   - `.json` → include
2. **Enum from value**: bare `par`/`ser`/`ts`/`series`/`parallel`/`transitionSeries` → `layout`; bare `fade`/`slide`/`wipe`/`flip`/`clockWipe` → `transition`; following number → `transitionTime`.
3. **Bare quoted string → `script`** when no key prefix.

Precedence: explicit key > enum > src/type > bare string.

## Type Catalog

### `scene` (heading)

When: always. Organizer with narrative metadata. `scene` is a container — scenes nest via deeper headings (`##` → `###` → `####`).

```md
## <name>
lo:<x> [tr:<t> tt:<n>] [t:.. dsc:.. q:..]
- <children>
```

Scene metadata (layout, script, transition, etc.) goes on the line(s) immediately below the heading, before any child bullets. This keeps the heading clean.

### `image` (`i`)

When: photos, stills. Required: src, `dr`.

`- cover.jpg dr:2` (type inferred) or `- i cover.jpg dr:2 fit:cover`

### `video` (`v`)

When: footage. Required: src + (`dr` or `ea`).

`- clip.mp4 sf:1 ea:4 vol:0.8`

### `audio` (`a`)

When: voiceover, BGM, SFX. Required: src + (`dr` or `ea`).

`- bgm.mp3 dr:6 vol:0.4`

### `subtitle` (`t`)

When: captions. Required: `dr` or src.

`- t "Hello world" dr:2`

### `component` (`c`)

When: charts, headlines, mockups. Required: `componentName`, `dr`.

Built-ins: `AnimatedHeadline`, `TypewriterText`, `GlitchReveal`, `TextCard`, `CalloutBox`, `EndTag`, `DeviceMockup`, `CursorFlyover`, `ComparisonSlider`, `StatCounter`, `ProgressBar`, `BarChart`, `LineChart`, `PieChart`, `ComparisonCard`, `GradientBackground`, `ParticleField`, `LightLeak`, `SplitScreen`, `SpotlightReveal`.

`- c StatCounter dr:2 p:{value:42,label:"Growth"}`

### `rhythm` (`r`)

When: beat-synced audio (music drops, music-reactive reveals). Required: `src`, `spots`, `children`.

Each child is assigned to a beat slot: child[i] starts at `spots[i]`, ends at `spots[i+1]` (last child ends at the final beat). No `dr` field — it is derived from `spots` and children count.

```md
- r beat.mp3 spots:[0.5,1.2,1.9]
  - a.jpg
  - b.jpg
  - c.jpg
```

### `effect` (`fx`)

When: CSS keyframe wrapper around children. Duration falls back to children max.

`- fx fadeIn dr:2` + indented children.

Built-in `animation` names:
`fadeIn fadeOut fadeInDown fadeInUp fadeInLeft fadeInRight fadeOutDown fadeOutUp fadeOutLeft fadeOutRight slideInDown slideInUp slideInLeft slideInRight slideOutDown slideOutUp slideOutLeft slideOutRight zoomIn zoomOut zoomInDown zoomInUp zoomInLeft zoomInRight bounce bounceIn rotateIn rotateOut rotateInDownLeft rotateInDownRight rotateInUpLeft rotateInUpRight flipInX flipInY pulse flash heartBeat rubberBand shakeX shakeY swing tada wobble jello rollIn rollOut jackInTheBox lightSpeedIn lightSpeedOut`

### `map` (`m`)

When: animated route. Required: `dr`, `wp`.

`- m dr:3 tm:DRIVING wp:[37.77,-122.41,"SF";34.05,-118.24,"LA"]`

### `include` (`in`)

When: external video JSON. Required: src + `dr`, or inline children.

`- in ./child.json dr:4`

## Timing Rules

1. `dr` authoritative for non-trimmed leaves.
2. `video`/`audio` with `sf`+`ea`: clip = `ea − sf`.
3. `st` only in `par`.
4. `tt` subtracted between `ts` items.
5. Containers derive duration (par=max, ser=sum, ts=sum−overlap).

## Generation Workflow

1. `# video` + `w h fps lo`.
2. Scenes via headings with `q` (script).
3. Leaves via bullets; prefer inference for speed.
4. Verify each leaf has resolvable `dr`.

## Self-Check

- [ ] Root line present.
- [ ] Every scene has ≥1 child.
- [ ] No `st` outside `par`.
- [ ] All `componentName` from built-in list.
- [ ] Ambiguous lines rewritten explicitly before final compile.

## Example

```md
# video
w:1080 h:1920 fps:30 lo:ser
n:"camping-2026" q:"A short memory film"

## Hook
dsc:"Set location and emotional tone"
- cover.jpg dr:2 n:"cover"
- t "Camping with my kid" dr:1.6 st:0.2

## Journey
ts fade 0.4 "Move through moments"
- clips/arrival.mp4 sf:0 ea:3.5 t:"Arrival"
- clips/fire.mp4 sf:1 ea:4 t:"Campfire"

## Stat
- c StatCounter dr:2 p:{value:42,label:"S'mores"}

## Route
- m dr:3 tm:DRIVING wp:[37.7749,-122.4194,"SF";34.0522,-118.2437,"LA"]
```
