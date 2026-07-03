# Template System

Templates are pre-authored stream trees with `${slotName}` placeholder tokens.
Pass data via `--data data.json` to fill slots.

## Categories

| Category | Templates |
|----------|-----------|
| Marketing | `product-hero`, `feature-showcase`, `before-after`, `social-clip`, `cinematic-intro` |
| Demo | `demo-walkthrough` |
| Social | `announcement`, `glow-up`, `quote-card`, `roast-list`, `stat-reveal`, `top5-countdown`, `year-recap`, `beat-drop` |
| Presentation | `journey-map` |

## Usage

```bash
# List templates
npx markcut templates

# Render with data
npx markcut render --template product-hero --data data.json --aspect all
```

## Slot Schema

Each template declares its slots in `slots[]`:

```json
{
  "key": "headline",
  "label": "Main headline",
  "type": "string",
  "default": "Default text",
  "required": true,
  "description": "The primary headline text"
}
```

Supported slot types: `string`, `text` (multiline), `image` (URL or path), `video`, `number`, `color`, `boolean`, `select` (enum).

## Template File Format

```json
{
  "id": "product-hero",
  "name": "Product Hero",
  "description": "Bold product intro with headline, screenshot, and CTA",
  "category": "marketing",
  "aspects": ["16x9", "9x16", "1x1"],
  "duration": 8,
  "theme": "cinematic",
  "slots": [
    { "key": "headline", "label": "Headline", "type": "string", "required": true },
    { "key": "screenshot", "label": "Product screenshot", "type": "image", "required": true },
    { "key": "cta", "label": "Call to action", "type": "string", "default": "Get started" }
  ],
  "streamTree": {
    "type": "root", "width": 1080, "height": 1920, "fps": 30,
    "isSeries": true, "transition": "fade", "transitionTime": 0.5,
    "children": [
      { "type": "component", "componentName": "AnimatedHeadline",
        "props": { "text": "${headline}", "gradient": true },
        "actions": [{ "start": 0, "end": 4 }] },
      { "type": "image", "src": "${screenshot}", "fit": "cover",
        "actions": [{ "start": 4, "end": 8 }] }
    ]
  }
}
```

Placeholder resolution replaces `${key}` with the corresponding value from data.json.
