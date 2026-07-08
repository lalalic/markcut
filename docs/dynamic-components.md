# Dynamic Components

Three ways to add custom visual content without rebuilding the engine.

## 1. Effects on Any Node (CSS Keyframes)

Add the `effects` key to any node to apply CSS keyframe animations. No wrapper node needed.

```json
{
  "id": "animated-scene",
  "type": "image",
  "src": "photo.jpg",
  "duration": 3,
  "effects": ["bounceIn(1, ease-out, 2)"]
}
```

### 25+ Built-in Animation Names

| Fades | Slides | Zooms | Attention | Bounce | Rotations |
|-------|--------|-------|-----------|--------|-----------|
| `fadeIn` | `slideInDown` | `zoomIn` | `pulse` | `bounceIn` | `rotateIn` |
| `fadeOut` | `slideInUp` | `zoomOut` | `flash` | | `rotateOut` |
| `fadeInDown` | `slideInLeft` | | `bounce` | | |
| `fadeInUp` | `slideInRight` | | `heartBeat` | | |
| `fadeInLeft` | | | `rubberBand` | | |
| `fadeInRight` | | | `shakeX` | | |
| (8 total) | | | | | |

### Custom Keyframes

```json
{
  "type": "effect",
  "animation": "custom",
  "customKeyframes": {
    "0":  { "opacity": "0", "transform": "scale3d(0,0,0) rotate(0deg)" },
    "50": { "opacity": "0.5", "transform": "scale3d(1.2,1.2,1.2) rotate(180deg)" },
    "100": { "opacity": "1", "transform": "scale3d(1,1,1) rotate(360deg)" }
  },
  "children": [...],
  "actions": [{ "start": 0, "end": 2 }]
}
```

Percentages `"0"`–`"100"` map to action duration. Any numeric CSS property works.

## 2. Remote Components (bundler-based)

Register remote React components via the `~~~js imports` code fence (markdown) or `root.imports` array (JSON descriptive). The player server bundles all registered components into a single ESM module at startup.

```markdown
~~~js imports
export { BarChart } from "npm:recharts"
export { Hello } from "git:user/repo/path/to/Hello.tsx"
export { Badge } from "https://cdn.example.com/components/badge.js"

export function Slide(props) {
  return <div style={{color: '#fff'}}>{props.children}</div>;
}
~~~
```

Then use them in component JSX:

```json
{
  "type": "component",
  "jsx": "<Badge text='LIVE' color='#ff0000' />",
  "actions": [{ "start": 0, "end": 3 }]
}
```

### How it works

1. The server extracts the imports block from the source file
2. `parseImportsBlock` resolves `export { X } from "spec"` and `export function X() {}` patterns
3. Inline functions' source code is scanned for `import X from "pkg"` statements — those packages are added to dependencies
4. `bundleFromEntries` creates a temp npm project, installs all packages, and runs `esbuild` to produce a single ESM file
5. The bundled file URL is set on `root.imports` and served from `/.component-cache/<hash>.js`
6. At runtime, `MarkCut.useComponentRegistry` does a dynamic `import(url)` to load all named exports
7. react-jsx-parser resolves component tags from the loaded registry

### Import spec forms

| Pattern | Resolves to | Example |
|---|---|---|
| `npm:pkg` | npm package (installed + bundled) | `export { BarChart } from "npm:recharts"` |
| `git:user/repo` | GitHub repo source | `export { Comp } from "git:user/repo/src/Comp.tsx"` |
| `https://...` | Raw URL (used as-is) | `export { X } from "https://cdn.example.com/x.js"` |
| local path | Filesystem path | `export { X } from "./local/Component.tsx"` |

### Inline functions

Define components directly in the imports block. Dependencies used inside the function body are automatically detected and installed:

```markdown
~~~js imports
import ReactMarkdown from "npm:react-markdown"

export function Slide({ children }) {
  return <div className="slide"><ReactMarkdown>{children}</ReactMarkdown></div>;
}
~~~
```

The `import` statements at the top serve dual purpose: they bring packages into scope inside inline functions AND tell the bundler what to install. The packages are added to `package.json` during bundling.

### Component Contract

Props injected automatically:
- Nothing special required — just standard React props. The engine passes any `data` bindings from the component node as JSX variables.

For frame-accurate animation, use standard Remotion hooks inside inline functions:

```markdown
~~~js imports
import { useCurrentFrame } from "remotion"

export function FadeIn({ children }) {
  const frame = useCurrentFrame();
  const opacity = Math.min(1, frame / 15);
  return <div style={{ opacity }}>{children}</div>;
}
~~~

Note: `remotion` and `react` are automatically available in the bundle's external scope — they do NOT need to be imported from `npm:remotion`. However, adding `import { useCurrentFrame } from "remotion"` in the imports block is harmless and makes the dependency explicit.

## 3. Custom Components

Create a React component file in `src/components/`, register in `builtinComponents`.

### Component Contract

Props the engine injects automatically:
- `action: { start: number; end: number }` — action timing from the stream node

Use `useCurrentFrame()` for frame-accurate animation, `useVideoConfig()` for canvas size.

### Example

```tsx
// src/components/my/Badge.tsx
import React from "react";
import { useCurrentFrame, interpolate } from "remotion";

export const Badge: React.FC<{text: string; color?: string; action: any}> =
  ({ text, color, action }) => {
    const frame = useCurrentFrame();
    const local = frame - action.start * 30;
    const opacity = interpolate(local, [0, 15], [0, 1]);
    return (
      <div style={{ opacity, padding: 12, background: color || theme.colors.primary,
                    color: "white", borderRadius: 8, fontSize: 48 }}>
        {text}
      </div>
    );
  };
```

### Register

```tsx
// src/components/index.ts
import { Badge } from "./my/Badge";
export const builtinComponents = { ..., Badge };
```

### Reference in stream tree

```json
{
  "type": "component",
  "jsx": "<Badge text='NEW' color='#ff6b35' />",
  "actions": [{ "start": 1, "end": 4 }]
}
```


# common used components
- `react-markdown` — render markdown content, use plugins to extend functionality
  - `remark-gfm` — support GitHub Flavored Markdown (tables, strikethrough, task lists)
  - `remark-toc` — generate table of contents
  - `remark-math` — support math formulas
  - `rehype-katex` — render math formulas with KaTeX
  - `remark-mermaidjs` — render mermaid diagrams in 
- `react-markdown-mermaid` — render mermaid diagrams in standalone mode (no need to install mermaid separately)

- `@remotion/shapes` — render shapes like arrows, circles, rectangles, etc
- `@remotion/starburst` — render starburst animations
