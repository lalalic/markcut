# Label System

Interactive media labeling before understanding clips in json stream tree.
The stream tree follow rules, see [docs/json-descriptive.md](docs/json-descriptive.md) for full details .

## Overview

The label player lets you load a stream tree, browse its clips, and attach descriptive labels to each clip's media. 
The output is an updated `labels.json` file with `description` fields populated.

## Usage

```bash
# Label from a stream tree JSON or labels.json
npx markcut preview labels.json --label

# Specify port
npx markcut preview labels.json --label --port 3031
```

### Labels Persistence
The stream tree follow rules, see [docs/json-descriptive.md](docs/json-descriptive.md) for full details .
Labels are saved to the source file.

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
            "start": 0, "end": 5,
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
            "start": 0, "end": 5,
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
