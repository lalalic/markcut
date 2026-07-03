# Remotion Engine — Full Architecture Design

> Infrastructure for marketing videos, demo videos, and app-embedded template rendering.

## Vision

One engine. Three surfaces.

| Surface | Example | Input | Output |
|---------|---------|-------|--------|
| **Marketing CLI** | `render marketing/01-describe-it-done.json` | stream tree JSON | MP4 (16x9, 9x16, 1x1) |
| **Demo Recorder** | Live demo → CDP capture → stream tree | screenshots + recordings | MP4 with device mockups |
| **App Template** | User fills template in CCM Harness UI | template + data bindings | Embedded Remotion Player / rendered MP4 |

## Current State (implemented)

```
markcut/src/
  schema/index.ts          — 7 stream types (root, folder, video, audio, image, subtitle, component)
  types/*.tsx               — React renderers per type
  context/index.tsx         — ComposeContext (Container + components registry) + AudioContext
  utils/index.ts            — duration math, CSS parser, VTT parser, tree walk
  lite.entry.tsx            — RemotionEngine component (parse → stamp durations → render)
  full.entry.tsx            — re-exports lite + components + themes + templates
  player.entry.tsx          — Player bundle for app embedding (exports RemotionEngine + all registries)
  Root.tsx                  — Remotion root with builtinComponents + theme resolution
  demo-components.json      — 5-scene demo stream tree (verified: renders in ~7s)
  components/               — 13 built-in components across 5 categories
    text/                     AnimatedHeadline, TypewriterText, GlitchReveal
    media/                    DeviceMockup, CursorFlyover, ComparisonSlider
    data/                     StatCounter, ProgressBar
    atmosphere/               GradientBackground, ParticleField, LightLeak
    layout/                   SplitScreen, SpotlightReveal
  themes/                   — Theme system
    schema.ts                 Zod theme schema (colors, fonts, timing, effects)
    presets.ts                4 presets: cinematic, minimal, neon, corporate
    index.tsx                 ThemeContext + useTheme() + resolveTheme()
  templates/                — Template system
    schema.ts                 Slot schema + resolveTemplate() + validateSlots()
    index.ts                  Template registry + getTemplate() + listTemplates()
    marketing/                product-hero, feature-showcase, before-after, social-clip
    demo/                     demo-walkthrough
  render/                   — Rendering pipeline
    cli.mjs                   CLI: render, templates, preview commands
    pipeline.ts               ASPECTS constant + adaptAspect()
    tts.ts                    TTS integration (edge-tts wrapper)
    sfx.ts                    Sound effects config + presets
    demo.ts                   CDP capture scaffold (Phase 4)
```

**What works**: Everything above. Stream tree → Remotion render. 13 themed components. 5 templates with slot resolution. CLI renders to MP4 in 16x9, 9x16, 1x1. Studio preview. Player bundle for embedding.

**Remaining**: Template gallery UI, Slot editor form, CCM Harness integration, Demo automation implementation.

---

## Architecture

```
@neox/markcut/
├── core/                    ← EXISTING (refined)
│   ├── schema/              Zod schemas for stream types
│   ├── types/               React renderers per stream type
│   ├── context/             ComposeContext, AudioContext, ThemeContext (NEW)
│   └── utils/               Duration math, CSS, VTT, tree walk
│
├── components/              ← NEW: Built-in component library
│   ├── text/                Text animation components
│   │   ├── AnimatedHeadline.tsx    Word-by-word kinetic typography
│   │   ├── TypewriterText.tsx      Typing simulation
│   │   ├── GlitchReveal.tsx        Glitch-in text effect
│   │   └── MorphText.tsx           Text morphing between strings
│   ├── media/               Media presentation components
│   │   ├── DeviceMockup.tsx        Browser/phone frame around content
│   │   ├── ScreenCapture.tsx       Screenshot with smart zoom
│   │   ├── CursorFlyover.tsx       Animated cursor over screenshot
│   │   ├── VideoPlayer.tsx         Video in device frame
│   │   └── ComparisonSlider.tsx    Side-by-side comparison
│   ├── data/                Data visualization components
│   │   ├── StatCounter.tsx         Animated number counter
│   │   ├── ProgressBar.tsx         Animated progress bars
│   │   └── StepTimeline.tsx        Step-by-step timeline
│   ├── atmosphere/          Background & atmosphere
│   │   ├── GradientBackground.tsx  Animated gradient interpolation
│   │   ├── ParticleField.tsx       Physics-based particle system
│   │   ├── NoiseGrid.tsx           Perlin noise dot grid
│   │   └── LightLeak.tsx           Cinematic light leak overlay
│   ├── layout/              Layout & composition
│   │   ├── SplitScreen.tsx         Side-by-side layout
│   │   ├── LetterboxReveal.tsx     Cinematic bars open
│   │   └── SpotlightReveal.tsx     Circular light reveal
│   └── index.ts             Registry export (all components by name)
│
├── themes/                  ← NEW: Theming system
│   ├── schema.ts            Theme Zod schema (colors, fonts, spacing, timing)
│   ├── presets/
│   │   ├── cinematic.ts     Dark, warm, orange/pink accents (current design.ts)
│   │   ├── minimal.ts       Clean white, sans-serif
│   │   ├── neon.ts          Dark with electric blue/green
│   │   └── corporate.ts    Professional, navy/gold
│   └── context.tsx          ThemeContext provider
│
├── templates/               ← NEW: Pre-built video templates
│   ├── schema.ts            Template schema (slots, defaults, constraints)
│   ├── marketing/
│   │   ├── product-hero.json        Hero intro (logo + tagline + demo)
│   │   ├── feature-showcase.json    3-feature walkthrough
│   │   ├── before-after.json        Problem → Solution comparison
│   │   ├── demo-walkthrough.json    Screen recording with annotations
│   │   └── social-clip.json         Short-form social content
│   ├── demo/
│   │   ├── screen-capture.json      Screen recording in device mockup
│   │   └── step-by-step.json        Multi-step tutorial
│   └── index.ts             Template registry
│
├── render/                  ← NEW: Rendering pipeline
│   ├── pipeline.ts          Render pipeline (validate → resolve assets → render)
│   ├── aspects.ts           Aspect ratio adapters (16x9, 9x16, 1x1)
│   ├── tts.ts               TTS integration (edge-tts)
│   └── cli.ts               CLI entry point: `markcut render <template>`
│
├── lite.entry.tsx           Lite bundle (core + utils)
├── full.entry.tsx           Full bundle (core + components + themes)
└── player.entry.tsx         ← NEW: Browser player bundle (for app embedding)
```

---

## Core Refinements

### 1. Theme System

Replace `design.ts` with a structured theme flowing through React context.

```typescript
// themes/schema.ts
import { z } from "zod";

export const themeSchema = z.object({
  name: z.string(),
  colors: z.object({
    background: z.string().default("#050505"),
    surface: z.string().default("#161618"),
    primary: z.string().default("#f97316"),      // accent 1
    secondary: z.string().default("#ec4899"),     // accent 2
    text: z.string().default("#fafafa"),
    textMuted: z.string().default("#a1a1aa"),
    gradient: z.tuple([z.string(), z.string()]).default(["#f97316", "#ec4899"]),
  }),
  fonts: z.object({
    heading: z.string().default("'SF Pro Display', 'Inter', sans-serif"),
    body: z.string().default("'SF Pro Text', 'Inter', sans-serif"),
    mono: z.string().default("'SF Mono', 'JetBrains Mono', monospace"),
  }),
  timing: z.object({
    /** Default spring config for text reveals */
    spring: z.object({
      damping: z.number().default(12),
      stiffness: z.number().default(180),
      mass: z.number().default(0.8),
    }),
    /** Stagger delay between animated items (frames) */
    stagger: z.number().default(4),
    /** Default transition duration between scenes (seconds) */
    transitionDuration: z.number().default(0.5),
  }),
  effects: z.object({
    /** Enable particle background */
    particles: z.boolean().default(true),
    /** Enable gradient background animation */
    gradientBg: z.boolean().default(true),
    /** Enable motion blur on moving elements */
    motionBlur: z.boolean().default(false),
    /** Film grain overlay opacity (0 = off) */
    grain: z.number().min(0).max(1).default(0),
  }),
});

export type Theme = z.infer<typeof themeSchema>;
```

### 2. Extended Root Schema

```typescript
// Root gains theme + template + data fields
export const root = folder.extend({
  // ...existing fields...
  theme: z.string().optional().describe("theme preset name or inline theme JSON"),
  template: z.string().optional().describe("template name for slot-based rendering"),
  data: z.record(z.unknown()).optional().describe("data bindings for template slots"),
  captions: z.object({
    enabled: z.boolean().default(false),
    style: z.enum(["karaoke", "subtitle", "none"]).default("karaoke"),
    position: z.enum(["bottom", "top", "center"]).default("bottom"),
  }).optional(),
  audio: z.object({
    bgm: z.string().optional().describe("background music URL"),
    bgmVolume: z.number().min(0).max(1).default(0.15),
    sfx: z.record(z.string()).optional().describe("sound effects: {transition: url, impact: url}"),
  }).optional(),
});
```

### 3. New Stream Types for Full Bundle

```typescript
// Additional stream types for full.entry.tsx

// Effect overlay (light leak, film grain, vignette)
export const effect = base.extend({
  type: z.literal("effect").default("effect"),
  effectType: z.enum(["lightLeak", "filmGrain", "vignette", "bokeh", "noise"]),
  intensity: z.number().min(0).max(1).default(0.5),
  actions: z.array(action).min(1).default(() => [action.parse({})]),
});

// Rhythm stream — audio-reactive timing
export const rhythm = base.extend({
  type: z.literal("rhythm").default("rhythm"),
  src: z.string().describe("audio URL to analyze"),
  sensitivity: z.number().min(0).max(1).default(0.5),
  actions: z.array(action).min(1).default(() => [action.parse({})]),
});
```

---

## Component Library Design

### Design Principles
1. **Theme-aware**: All components read from `ThemeContext`, no hardcoded colors
2. **Spring-first**: Use `spring()` for all motion, never linear interpolation for entrances
3. **Blur reveals**: Text appears with `blur(10px) → blur(0)` + position, not just opacity
4. **Stagger from center**: Multi-item animations radiate from center outward
5. **Atmosphere layers**: Every scene has background → content → overlay layers

### Component Contract
```typescript
interface EngineComponent<P = {}> {
  (props: P & {
    action: Action;            // timing from stream tree
    theme: Theme;              // resolved theme
    frame: number;             // current frame (from useCurrentFrame)
    fps: number;               // fps (from useVideoConfig)
  }): React.ReactNode;
}
```

### Key Components

#### AnimatedHeadline
```
Replaces: BigStatement
Inspired by: remotion-bits AnimatedText
Features:
  - Word-by-word with blur+scale+position stagger
  - Each word from different direction (not all from bottom)
  - Impact flash when word lands
  - Pulsing glow orb behind
  - Configurable: split (word|char|line), stagger direction
Props:
  text: string
  subtext?: string
  split?: "word" | "char" | "line"
  gradient?: boolean  // text gradient or solid
  glow?: boolean      // background glow
```

#### DeviceMockup
```
Replaces: raw screenshot on dark bg
Inspired by: Mockoops, SuperMotion
Features:
  - Browser frame (Chrome/Safari) or phone frame (iPhone/Android)
  - Realistic shadow and reflection
  - Optional 3D angle (perspective transform)
  - Content can be image, video, or live component
  - Entrance animation (slide up + fade + scale)
Props:
  device: "browser" | "phone" | "tablet" | "laptop"
  content: string  // URL or component ref
  angle?: number   // 3D perspective angle (0 = flat)
  shadow?: boolean
```

#### CursorFlyover
```
Replaces: crude circle cursor in ScreenCapture
Inspired by: remotion-bits Cursor Flyover
Features:
  - Scene3D camera moves to different regions of screenshot
  - Cursor SVG follows with smooth repositioning
  - Click ripple effect at cursor position
  - Highlight/annotation overlay at cursor target
Props:
  screenshot: string  // URL
  steps: Array<{
    region: { x: number, y: number, zoom: number }
    cursor: { x: number, y: number }
    annotation?: string
    duration: number  // seconds
  }>
```

#### GradientBackground
```
Replaces: flat #050505
Inspired by: remotion-bits GradientTransition
Features:
  - Smooth interpolation between gradient keyframes
  - Supports linear/radial/conic
  - Optional noise overlay for texture
  - Theme-aware colors
Props:
  type: "linear" | "radial" | "conic"
  keyframes?: string[]  // CSS gradient values
  animated?: boolean
  noise?: boolean
```

#### ComparisonSlider
```
Replaces: ComparisonSplit
Inspired by: RVE Image Comparison Slider
Features:
  - Draggable divider (animated in video)
  - Before/After labels
  - Match percentage counter animation
  - Optional overlay highlighting differences
Props:
  before: string  // image URL
  after: string   // image URL
  matchPercent?: number
  dividerPosition?: number  // 0-1, animated
```

---

## Template System

### Template Schema
```typescript
// templates/schema.ts
export const templateSlot = z.object({
  name: z.string(),
  type: z.enum(["text", "image", "video", "number", "color", "boolean"]),
  label: z.string(),
  default: z.unknown().optional(),
  required: z.boolean().default(false),
  constraints: z.object({
    maxLength: z.number().optional(),    // text
    aspectRatio: z.string().optional(),  // image/video
    min: z.number().optional(),          // number
    max: z.number().optional(),          // number
  }).optional(),
});

export const template = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.enum(["marketing", "demo", "social", "presentation"]),
  aspects: z.array(z.enum(["16x9", "9x16", "1x1"])),
  duration: z.number().describe("seconds"),
  slots: z.array(templateSlot),
  theme: z.string().default("cinematic"),
  streamTree: z.unknown().describe("stream tree JSON with ${slot.name} placeholders"),
});
```

### How Templates Work

1. **Template defines structure** — a stream tree with `${placeholder}` refs in text/src fields
2. **User fills slots** — provides values for each slot (headline, screenshot, logo, etc.)
3. **Engine resolves** — replaces `${slot.name}` in tree, validates types, applies theme
4. **Engine renders** — standard stream tree rendering pipeline

Example template slot resolution:
```json
// Template
{
  "type": "component",
  "componentName": "AnimatedHeadline",
  "props": { "text": "${headline}", "subtext": "${subline}" },
  "actions": [{ "start": 0, "end": 6 }]
}

// Data: { "headline": "200 screens. 6 months.", "subline": "Or one conversation." }

// Resolved
{
  "type": "component",
  "componentName": "AnimatedHeadline",
  "props": { "text": "200 screens. 6 months.", "subtext": "Or one conversation." },
  "actions": [{ "start": 0, "end": 6 }]
}
```

### Pre-built Templates

#### 1. Product Hero (`marketing/product-hero`)
```
Slots: logo, headline, subline, screenshot, cta
Structure:
  Scene 1 (6s): AnimatedHeadline + GradientBackground
  Scene 2 (8s): DeviceMockup with screenshot + headline
  Scene 3 (5s): AnimatedHeadline with CTA
Transitions: fade between all scenes
Audio: voiceover + BGM
```

#### 2. Feature Showcase (`marketing/feature-showcase`)
```
Slots: headline, features[{title, description, screenshot}], cta
Structure:
  Scene 1 (5s): AnimatedHeadline ("The Problem")
  Scene 2-4 (7s each): DeviceMockup + feature title + description
  Scene 5 (5s): CTA
Transitions: slide between feature scenes, fade for intro/outro
```

#### 3. Before-After (`marketing/before-after`)
```
Slots: problem_headline, solution_headline, problems[], solutions[], matchPercent
Structure:
  Scene 1 (5s): Problem headline (red tint)
  Scene 2 (7s): Problem items with strikethrough
  Scene 3 (5s): Solution headline (green tint)
  Scene 4 (7s): Solution items with check marks
  Scene 5 (6s): ComparisonSlider with match percentage
```

#### 4. Demo Walkthrough (`demo/screen-capture`)
```
Slots: headline, steps[{screenshot, caption, cursorTarget}]
Structure:
  Scene 1 (4s): AnimatedHeadline
  Scene 2-N (8s each): CursorFlyover per step with subtitle caption
  Final (4s): CTA
Transitions: wipe between steps
```

#### 5. Social Clip (`marketing/social-clip`)
```
Slots: headline, screenshot, stat{label, value}, cta
Duration: 15s (optimized for social)
Structure:
  Scene 1 (4s): AnimatedHeadline (large, centered)
  Scene 2 (6s): DeviceMockup + stat counter
  Scene 3 (5s): CTA with logo
```

---

## Rendering Pipeline

### CLI
```bash
# Render from stream tree JSON
markcut render stream.json --aspect 16x9 --output out.mp4

# Render from template + data
markcut render --template product-hero --data data.json --aspect 16x9

# Render all aspects
markcut render stream.json --aspect all

# With TTS voiceover generation
markcut render stream.json --tts --voice en-US-GuyNeural

# Preview in browser
markcut preview stream.json
```

### Pipeline Steps
1. **Parse** — Validate stream tree / resolve template + data
2. **Theme** — Apply theme (preset name → theme object → context)
3. **TTS** — Generate voiceover WAV files if `--tts` flag (edge-tts)
4. **Assets** — Resolve relative asset paths to absolute
5. **Duration** — Compute total duration from tree
6. **Render** — Remotion `renderMedia()` for each aspect ratio
7. **Post** — Optional ffmpeg post-processing (compression, audio normalization)

### Aspect Ratio Adaptation
```typescript
// render/aspects.ts
const ASPECTS = {
  "16x9": { width: 1920, height: 1080 },
  "9x16": { width: 1080, height: 1920 },
  "1x1":  { width: 1080, height: 1080 },
};

// Components auto-adapt based on root width/height ratio
// Theme includes responsive breakpoints
// DeviceMockup scales device frame
// AnimatedHeadline adjusts font size
// Caption position adjusts
```

---

## App Integration (Player)

### Embed in CCM Harness or any React app

```tsx
import { RemotionEngine, builtinComponents, themes } from "@neox/markcut/player";
import { Player } from "@remotion/player";

function VideoPreview({ streamTree, theme = "cinematic" }) {
  return (
    <Player
      component={RemotionEngine}
      inputProps={{
        root: streamTree,
        compose: {
          components: builtinComponents,
        },
        theme: themes[theme],
      }}
      durationInFrames={getDurationInFrames(streamTree)}
      fps={30}
      compositionWidth={1920}
      compositionHeight={1080}
      style={{ width: "100%" }}
      controls
    />
  );
}
```

### Template Gallery UI
```
1. User browses template gallery (cards with preview thumbnails)
2. Selects a template → sees slot form (headline, screenshot upload, etc.)
3. Fills slots → sees live Remotion Player preview
4. Clicks "Render" → server-side rendering via CLI
5. Downloads MP4
```

---

## Studio Preview (Primary Dev Workflow)

Remotion Studio is the main preview tool. The design adds **three entry points** to match the three surfaces:

### Entry Points

```
src/
  index.ts              ← registerRoot(RemotionRoot)  [EXISTING]
  Root.tsx              ← Studio composition            [EXISTING → ENHANCED]
  studio.full.tsx       ← Full-bundle Root for Studio   [NEW]
```

### Enhanced Root.tsx (Studio entry)

```tsx
// Root.tsx — used by `npm run studio`
import { Composition, getInputProps } from "remotion";
import { RemotionEngine } from "./lite.entry";
import { builtinComponents } from "./components";   // NEW
import { resolveTheme } from "./themes/context";     // NEW
import { getDurationInSeconds } from "./utils";
import { root as rootSchema } from "./schema";
import sample from "./sample.json" with { type: "json" };

export const RemotionRoot: React.FC = () => {
  const props = getInputProps() as { root?: unknown };
  const data = (props.root ?? sample) as any;
  const parsed = rootSchema.parse(data);

  // Resolve theme from root.theme field (preset name or inline)
  const theme = resolveTheme(parsed.theme);

  return (
    <Composition
      id="Root"
      component={RemotionEngine as any}
      durationInFrames={Math.ceil(getDurationInSeconds(parsed, true) * parsed.fps)}
      fps={parsed.fps}
      width={parsed.width}
      height={parsed.height}
      defaultProps={{
        root: data,
        compose: { components: builtinComponents },  // ALL built-in components registered
        theme,
      }}
    />
  );
};
```

### npm scripts

```json
{
  "studio": "remotion studio",
  "studio:full": "remotion studio --props=./examples/full-demo.json",
  "preview": "remotion preview",
  "render": "remotion render Root out/video.mp4",
  "render:all": "node render/cli.ts"
}
```

### Workflow

```
1. Edit stream tree JSON (e.g., sample.json or templates/marketing/product-hero.json)
2. `npm run studio` → Remotion Studio opens at localhost:3000
3. Studio hot-reloads on JSON/component changes
4. See all built-in components working (AnimatedHeadline, DeviceMockup, etc.)
5. Adjust timing, props, theme in JSON → see changes live
6. When satisfied: `npm run render -- --props=./my-video.json`
```

### How components become available in Studio

The key change: `Root.tsx` imports `builtinComponents` and passes them to `RemotionEngine.compose.components`. This is the SAME registry mechanism that already exists — the `ComponentLeaf` renders `components[stream.componentName]`. Currently the registry is empty (host must provide). After Phase 1, `builtinComponents` contains all engine components:

```typescript
// components/index.ts
export const builtinComponents: Record<string, React.ComponentType<any>> = {
  AnimatedHeadline,
  TypewriterText,
  GlitchReveal,
  MorphText,
  DeviceMockup,
  ScreenCapture,
  CursorFlyover,
  VideoPlayer,
  ComparisonSlider,
  StatCounter,
  ProgressBar,
  StepTimeline,
  GradientBackground,
  ParticleField,
  NoiseGrid,
  LightLeak,
  SplitScreen,
  LetterboxReveal,
  SpotlightReveal,
};
```

### Template preview in Studio

Templates work in Studio by resolving slots BEFORE passing to the engine:

```bash
# Preview a template with sample data
npm run studio -- --props='{"root": "RESOLVED_TEMPLATE_JSON"}'

# Or use the template resolver script
node scripts/resolve-template.mjs product-hero examples/product-hero-data.json > /tmp/resolved.json
npm run studio -- --props=/tmp/resolved.json
```

A future `studio:template` script could auto-resolve and hot-reload, but for Phase 1 the manual resolve step is fine.

---

## Migration Plan

### Phase 1: Core + Components ✅ DONE
- [x] Stream tree kernel (existing engine)
- [x] Theme system (schema + context + 4 presets: cinematic, minimal, neon, corporate)
- [x] 13 built-in components: AnimatedHeadline, TypewriterText, GlitchReveal, DeviceMockup, CursorFlyover, ComparisonSlider, StatCounter, ProgressBar, GradientBackground, ParticleField, LightLeak, SplitScreen, SpotlightReveal
- [x] Updated Root.tsx with builtinComponents + theme resolution
- [x] Rendering CLI with aspect ratio support (`node src/render/cli.mjs render`)
- [x] Demo JSON verified: renders 5-scene video in ~7s

### Phase 2: Templates + Pipeline ✅ DONE
- [x] Template schema + slot resolution + validation
- [x] 5 pre-built templates (product-hero, feature-showcase, before-after, demo-walkthrough, social-clip)
- [x] TTS integration (edge-tts wrapper)
- [x] Sound effects system (SFX config + presets)
- [ ] Migrate marketing videos from old pipeline to engine templates

### Phase 3: App Integration ✅ DONE (entry point)
- [x] Player bundle entry point (`player.entry.tsx`)
- [ ] Template gallery component (React UI)
- [ ] Slot editor form component (React UI)
- [ ] Integration into CCM Harness right panel

### Phase 4: Demo Automation (scaffold only)
- [x] CDPCapture interface + captureToStreamTree stub
- [ ] CDP screen capture → stream tree converter (implementation)
- [ ] Auto-annotation (detect UI elements, generate cursor paths)
- [ ] Demo recording → polished video pipeline

---

## Dependencies

### Runtime
| Package | Purpose | Status |
|---------|---------|--------|
| remotion | Core rendering | ✅ Already |
| @remotion/transitions | Scene transitions | ✅ Already |
| @remotion/motion-blur | Trail + CameraMotionBlur | 📦 Add |
| @remotion/noise | Perlin noise backgrounds | 📦 Add |
| @remotion/player | Browser embed | 📦 Add for player bundle |
| remotion-bits | Reference components (AnimatedText, etc.) | 📦 Add |
| zod | Schema validation | ✅ Already |

### Build-time
| Tool | Purpose |
|------|---------|
| edge-tts | TTS voiceover generation |
| ffmpeg | Post-processing (already on system) |

### NOT adding (complexity not justified)
- @remotion/three (Three.js) — overkill for our use case
- @remotion/skia — React Native only
- @remotion/lottie — no Lottie assets
- gl-transitions — GPU shader transitions are cool but add WebGL dependency

---

## Naming Convention

- Package: `markcut`
- Components: PascalCase, descriptive (`AnimatedHeadline` not `BigStatement`)
- Stream types: lowercase (`component`, `effect`, `rhythm`)
- Templates: kebab-case (`product-hero`, `feature-showcase`)
- Themes: camelCase (`cinematic`, `minimalLight`, `neonDark`)

---

## Key Design Decisions

### 1. Components are registered, not imported
Components are passed via `ComposeContext.components` registry, not imported directly into the stream tree. This keeps the stream tree pure JSON (no code), enabling:
- Template serialization/storage
- Server-side rendering without bundling user code
- Template sharing between apps

### 2. Theme flows through context, not props
Theme is set once at root level and flows through `ThemeContext`. Components read `useTheme()` instead of accepting color/font props. This ensures visual consistency across all components without per-scene configuration.

### 3. Templates are stream trees with placeholders
Templates are NOT separate React components. They are regular stream trees where some values use `${slotName}` syntax. The template resolver replaces placeholders with user data before rendering. This means:
- Templates can be edited in any JSON editor
- No code changes needed for new templates
- Templates work with any component version

### 4. Built-in components coexist with host components
The engine ships a `builtinComponents` registry. Hosts can override any built-in or add custom components. Precedence: host > built-in.

### 5. Full bundle = lite + components + themes
The lite bundle remains minimal (for mobile WebViews). The full bundle adds the component library and theme system. The player bundle adds @remotion/player wrapper for browser embedding.
