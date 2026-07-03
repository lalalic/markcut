# Theme System

Set via the `theme` field at root level. Controls colors, fonts, and visual style of built-in components.

## 4 Presets

| Preset | Vibe | Background | Primary |
|--------|------|------------|---------|
| `cinematic` (default) | Dark, warm, orange/pink | `#050505` | `#f97316` |
| `minimal` | Clean white | `#ffffff` | `#3b82f6` |
| `neon` | Electric green/cyan on dark | `#0a0a0a` | `#06b6d4` |
| `corporate` | Professional navy/gold | `#0f172a` | `#2563eb` |

## Usage

```json
// Preset name
{ "theme": "neon" }

// Base preset with overrides (deep-merges colors/fonts/timing/effects)
{ "theme": { "base": "neon", "colors": { "primary": "#ff0000" } } }

// Full inline theme object (all fields optional, defaults from cinematic)
{ "theme": { "colors": { "primary": "#ff0000", "background": "#000" } } }
```

Can also pass as a JSON string (for programmatic use): `"theme": "{ \"colors\": { \"primary\": \"#ff0000\" } }"

## Theme Object Structure

```typescript
interface Theme {
  colors: {
    background: string;        // canvas background
    primary: string;           // main accent
    secondary: string;         // secondary accent
    text: string;              // primary text
    textSecondary: string;     // muted text
    gradient: [string, string];// gradient start/end
    card: string;              // card/surface background
    border: string;            // border color
    success: string;           // success/green
    warning: string;           // warning/amber
    error: string;             // error/red
  };
  fonts: {
    heading: string;           // font-family for headings
    body: string;              // font-family for body text
    mono: string;              // font-family for monospace
  };
  timing: {
    fast: number;              // fast animation (ms)
    normal: number;            // normal animation (ms)
    slow: number;              // slow animation (ms)
  };
  effects: {
    glow: boolean;             // enable glow effects
    blur: boolean;             // enable blur effects
    particle: boolean;         // enable particle effects
  };
}
```

Components access the theme via React context (`useTheme()` hook) or via the injected `theme` prop (on component leaves).
