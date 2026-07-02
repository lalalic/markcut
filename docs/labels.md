# Label System

Interactive media labeling for selecting best clips before assembling a final video.

## Overview

The label player lets you load a stream tree JSON, browse its scenes, and attach descriptive labels to each scene's media. The output is an updated `labels.json` file with `description` fields populated, which can feed directly into the storyboard or assembly phase.

## Usage

```bash
# Label from a stream tree JSON or labels.json
npx lalalic/remotion-engine preview labels.json --label

# Specify port
npx lalalic/remotion-engine preview labels.json --label --port 3031
```

## How It Works

The label server accepts a stream tree JSON file (`labels.json` or any valid stream tree). It:
1. Parses the stream tree (looks for `children` with `folder`/`scene` types)
2. Extracts scene timing, media sources, and existing `description` fields
3. Loads any previously saved labels from `labels.json` alongside the source

### Label Player UI

```
┌─────────────────────────┐
│  ✕  Scene name (12.3s)  │  ← header with close button
├─────────────────────────┤
│                         │
│     Remotion Player     │  ← video preview
│                         │
├─────────────────────────┤
│ ┌──┐ ┌──┐ ┌──┐ ┌──┐   │  ← thumbnail strip
│ │img│ │img│ │img│ │img││     (green dot = labeled)
│ └──┘ └──┘ └──┘ └──┘   │
├─────────────────────────┤
│ [Add label for scene…] 📝│ ← label input + save button
└─────────────────────────┘
```

- **Thumbnail strip**: click to jump to a specific scene; green badge = labeled
- **Label input**: type a descriptive label for the current scene
- **Save button**: saves the label; shows a "✓ Label saved" toast
- **Close button** (✕): shuts down the server

### Labels Persistence

Labels are saved to `labels.json` in the same directory as the source file. Each label maps to a scene index:

```json
{
  "root": {
    "id": "root",
    "type": "root",
    "children": [
      {
        "id": "scene-1",
        "type": "folder",
        "children": [
          {
            "id": "scene-1-media",
            "type": "image",
            "src": "/media/photo.jpg",
            "actions": [{ "start": 0, "end": 5 }],
            "description": "Best group shot from the campfire"
          }
        ]
      },
      {
        "id": "scene-2",
        "type": "folder",
        "children": [
          {
            "id": "scene-2-media",
            "type": "video",
            "src": "/media/clip.mp4",
            "actions": [{ "start": 0, "end": 5 }],
            "description": "Sunset timelapse — use for intro"
          }
        ]
      }
    ]
  }
}
```

The `description` field on each media leaf node holds the label text.

## Workflow

```
Stream tree JSON (labels.json)
       │
       ▼
─── preview --label ───→ Browse & label clips
       │                        │
       │                        ▼
       │                  Updated labels.json
       │                        │
       ▼                        ▼
    Use in Storyboard ──────→ Assemble → Render
```

1. **Prepare** a stream tree JSON with scenes
2. **Label** with `preview --label` to add descriptions to each scene
3. **Export** labels are saved alongside the source file
4. **Use** the labeled scenes in your storyboard or assembly workflow

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/video-data` | GET | Returns the raw stream tree JSON |
| `/api/video-info` | GET | Returns scenes array with timing + totalDuration |
| `/api/labels` | GET | Returns the current stream tree with descriptions |
| `/api/labels` | POST | Saves updated descriptions ({descriptions: {index: "text"}}) |
| `/api/shutdown` | POST | Kills the server |
| `/api/events` | GET | SSE events (reload on file change) |

## Implementation

Source: `src/player/label-server.mjs`

- Built on Node.js `http` module (no Express dependency)
- Serves bundled `player.js` (esbuild output from `src/player/browser.tsx`)
- Labels saved atomically to disk on each POST
- Accepts stream tree JSON only (no media folder mode)

## Reference

| Topic | Link |
|-------|------|
| Storyboard (video planning) | [storyboard.md](storyboard.md) |
| Stream tree types | `SKILL.md` |
| Dynamic components | [dynamic-components.md](dynamic-components.md) |
| Theme system | [themes.md](themes.md) |
