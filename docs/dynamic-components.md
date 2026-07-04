# Dynamic Components

Three ways to add custom visual content without rebuilding the engine.

## 1. Effect Wrapper (CSS Keyframes)

Wrap any node with an `effect` stream to apply animation:

```json
{
  "id": "animated-scene",
  "type": "effect",
  "animation": "bounceIn",
  "animationTimingFunction": "ease-out",
  "animationIterationCount": 1,
  "children": [
    { "type": "image", "src": "photo.jpg", "actions": [{ "start": 0, "end": 3 }] }
  ],
  "actions": [{ "start": 0, "end": 3 }]
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

## 2. Remote Components (load from URL)

Register remote components via `import` in a `` ```js imports `` block:

````
```js imports
import { Badge } from "https://cdn.example.com/components/badge.js"
```
````

Then reference them in component JSX:

```json
{
  "type": "component",
  "jsx": "<Badge text='LIVE' color='#ff0000' />",
  "actions": [{ "start": 0, "end": 3 }]
}
```

### Remote Component Convention

The module file must use `window.__React` and `window.__Remotion`:

```js
const React = window.__React;
const { useCurrentFrame, interpolate } = window.__Remotion;

function Badge(props) {
  const frame = useCurrentFrame();
  return React.createElement("div", {
    style: { background: props.color, padding: "12px 24px",
             borderRadius: "8px", color: "white", fontSize: "48px" }
  }, props.text);
}

module.exports = { default: Badge };
```

Supports both ES module (blob URL + dynamic `import()`) and CJS fallback (`new Function` eval).

### Preloading

```tsx
import { preloadComponents } from "./types/DynamicLoader";
await preloadComponents(["https://cdn.example.com/components/badge.js"]);
```

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
  "componentName": "Badge",
  "props": { "text": "NEW", "color": "#ff6b35" },
  "actions": [{ "start": 1, "end": 4 }]
}
```
