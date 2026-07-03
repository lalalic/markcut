# Storyboard System

High-level video planning using `scene` nodes — for agents and humans to structure a video before filling in concrete assets.

## Overview

A storyboard is a stream tree built with `scene` nodes. Scenes act as organizational containers that describe what happens in each part of the video. The engine treats `scene` nodes identically to `folder` nodes during rendering.

Three-phase workflow:
1. **Storyboard** — plan structure with `scene` nodes, write `script` (narration)
2. **Fill** — replace or augment scenes with concrete media, components, effects
3. **Assemble** — render the final stream tree (optionally keep scenes as organization)

## Scene Node

```json
{
  "type": "scene",
  "name": "Intro",
  "description": "Opener with animated headline and ambient BGM",
  "script": "Welcome to our product. Let me show you what makes it special.",
  "children": [
    { "type": "image", "src": "hero.jpg", "actions": [{ "start": 0, "end": 5 }] }
  ]
}
```

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `type` | ✅ | Must be `"scene"` |
| `name` | ✅ | Short identifier (displayed in UI cards) |
| `description` | — | Summary, style guide, or agent prompt for the scene |
| `script` | — | Narration/dialogue text (used in TTS pipeline) |
| `children` | ✅ | Array of stream tree nodes (media, components, sub-scenes) |

### Nesting

Scenes can be nested to any depth:

```json
{
  "type": "scene",
  "name": "Chapter 2: Features",
  "children": [
    { "type": "scene", "name": "Feature 1", "children": [...] },
    { "type": "scene", "name": "Feature 2", "children": [...] }
  ]
}
```

## Storyboard JSON Format

```json
{
  "id": "root",
  "type": "root",
  "width": 1080,
  "height": 1920,
  "fps": 30,
  "isSeries": true,
  "transition": "fade",
  "children": [
    {
      "type": "scene",
      "name": "Intro",
      "description": "Opener with animated headline and ambient BGM",
      "script": "Welcome to our product. Let me show you what makes it special.",
      "children": [
        {
          "type": "folder",
          "isSeries": false,
          "children": [
            {
              "type": "component",
              "componentName": "GradientBackground",
              "props": { "type": "radial", "animated": true }
            },
            {
              "type": "component",
              "componentName": "AnimatedHeadline",
              "props": { "text": "Welcome" },
              "actions": [{ "start": 0.5, "end": 4.5 }]
            }
          ]
        }
      ]
    },
    {
      "type": "scene",
      "name": "Feature",
      "description": "Product screenshot with stat counter",
      "script": "Our dashboard shows real-time analytics at a glance.",
      "children": [...]
    },
    {
      "type": "scene",
      "name": "Outro",
      "description": "Call to action",
      "script": "Ready to get started? Sign up today.",
      "children": [...]
    }
  ]
}
```

## Script → TTS → STT → VTT Pipeline

`scene` nodes (and any stream tree node) can carry a `script` field with narration text. The recommended pipeline converts scripts into timed subtitles:

```
Script (text)
    │
    ▼  TTS (text-to-speech)
Audio (.wav per segment)
    │
    ▼  STT (speech-to-text)
VTT (timed subtitle cues)
    │
    ▼  Attach as subtitle child
Renderable stream tree
```

### Steps

1. **Storyboard phase** — agent writes `script` on scene/folder/leaf nodes
2. **TTS phase** — walk the tree, collect all `script` values with their node id + timing, run TTS to generate WAV audio per segment
3. **STT phase** — transcribe each TTS audio to VTT (or concatenate into one audio, STT to full VTT)
4. **Subtitle phase** — attach the resulting VTT as a `subtitle` child node to each parent (or as a parallel track)

This keeps `script` as the authoring field (human/agent-friendly text) and `subtitle` as the rendered output (timed VTT cues).

## From Storyboard to Assembly

### Option A: Keep scenes as organization

Replace `children` arrays under each scene with concrete stream tree nodes. Scenes become logical grouping folders that still work at render time.

```json
{
  "type": "scene",
  "name": "Intro",
  "description": "Opener with animated headline and ambient BGM",
  "children": [
    { "type": "image", "src": "hero.jpg", "actions": [{ "start": 0, "end": 5 }] },
    {
      "type": "subtitle",
      "src": "narration-intro.vtt",
      "actions": [{ "start": 0, "end": 5 }]
    }
  ]
}
```

### Option B: Flatten to stream tree (production)

Replace `scene` containers with a flat list of `folder` nodes. This is optional — `scene` nodes render identically to `folder` nodes.

```bash
# Render a storyboard JSON directly (scenes work as folders)
npx markcut render storyboard.json --aspect 9x16

# Preview in edit mode
npx markcut preview storyboard.json --edit
```

## Best Practices for Agents

When generating a storyboard as an AI agent, follow these guidelines:

### Structure
- Start with 3-7 scenes for a typical short-form video
- Each scene should have a clear purpose (hook → build → payoff)
- Write `description` as a style guide or prompt for the next agent phase
- Write `script` in natural narration language (not JSON, not markdown)

### Scene Types

| Scene Role | Purpose | Typical Children |
|------------|---------|-----------------|
| **Hook** | Grab attention in first 2s | AnimatedHeadline + GradientBackground |
| **Context** | Show what the video is about | Image/Video + TypewriterText |
| **Detail** | Deep dive into features | DeviceMockup + StatCounter |
| **Comparison** | Before/after or side-by-side | ComparisonSlider or SplitScreen |
| **Testimonial** | Quote or social proof | TextCard + CalloutBox |
| **CTA** | Call to action | EndTag + Bold headline |

### Script Writing
- Write scripts that match the video's speaking pace (~150 words/min)
- Use `script` for narration, not visual directions (those go in `description`)
- Keep scripts scoped to their scene's duration

## Reference

| Topic | Link |
|-------|------|
| Label system (media selection) | [labels.md](labels.md) |
| Stream tree types | `SKILL.md` |
| Template system | [templates.md](templates.md) |
| Dynamic components | [dynamic-components.md](dynamic-components.md) |
| Theme system | [themes.md](themes.md) |
