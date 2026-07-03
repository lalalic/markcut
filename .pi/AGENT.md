# markcut — Agent Guide

## Project layout

```
src/
  schema/index.ts          Zod schemas (10 stream types: root/folder/video/audio/image/subtitle/component/effect/rhythm/map)
  types/*.tsx              React renderers per stream type
  context/index.tsx        ComposeContext + AudioContext
  utils/index.ts           Pure helpers (duration, CSS, VTT, tree walk)
  components/              13 built-in components (5 categories)
  themes/                  Theme system (schema + 4 presets)
  templates/               15 pre-built templates
  lite.entry.tsx           Core RemotionEngine component
  full.entry.tsx           lite + components + themes + templates
  player.entry.tsx         Player bundle for app embedding
  Root.tsx                 Remotion Studio compositions
  render/cli.mjs           CLI: render, preview, templates commands
  player/server.mjs        Player server (label mode, edit mode)
  player/browser.tsx       Bundled browser player (esbuild → bundle/player.js)
```

## Key commands

```bash
npm run render -- file.json           # Render stream tree to MP4
npm run render -- --template <id>     # Render from template + data
npm run preview -- file.json          # Remotion Studio preview
npm run preview -- file.json --label  # Label mode player
npm run preview -- file.json --edit   # Edit mode player (AI-assisted editing)
npm run templates                     # List available templates
bash scripts/build-player.sh          # Rebuild browser bundle after changing browser.tsx
```

## How to test changes

### 1. Edit mode (main workflow)
```bash
# Start the player in background, test with agent-browser
npm run preview -- sample-visual.json --edit --port 3031 &
agent-browser --cdp 64086 open http://localhost:3031
# ... interact via agent-browser fill/click/eval ...
kill %1
```

### 2. Render MP4 (verify output)
```bash
npm run render -- sample-visual.json --aspect all
# → out/video-16x9.mp4, video-9x16.mp4, video-1x1.mp4
```

### 3. TypeScript + unit tests
```bash
npm run typecheck
npm test
```

## Common changes

### Player UI (server.mjs)
- Edit the `getHtml()` function — returns a template literal with HTML/CSS/JS
- Changes take effect on next server start (no build step)
- Two inline script blocks: bundled player (`player.js`) + watch mode JS

### Browser player (browser.tsx)
- Edit `src/player/browser.tsx` — the React app rendered by @remotion/player
- After changes, rebuild: `bash scripts/build-player.sh`
- The bundle is served as a static file by server.mjs

### Edit prompt (server.mjs → /api/edit)
- The pi one-shot prompt is built in the `/api/edit` handler
- Includes: timeline, edit history, knowledge (components/schema/styling), edit request
- Edit history accumulates per session (editHistory[] array)

## Subvideo type (nested compositions)

`subvideo` is a stream type that embeds a **complete video composition** (self-contained stream tree) as a single node. This lets editors compose videos from independently-authored sub-parts.

**Schema** (from `schema/index.ts`):
```
subvideo: {
  type: "subvideo",
  width, height, fps,          // own dimensions (metadata; internal rendering uses parent FPS)
  isSeries, transition,        // controls internal child sequencing
  children: Stream[],          // full stream tree
  actions: Action[]            // {start, end} relative to subvideo's own timeline for trimming/offset
}
```

**Rendering**: `SubvideoLeaf` wraps the internal children in a `Container` sized to the subvideo's own dimensions. Inside, `FolderLeaf` renders the child tree. The parent Folder handles placement via Series/Sequence (same as any leaf).

**Duration**: computed from internal children (like a folder), not from actions. Actions control internal trimming.

**Example** — a main video with an embedded subvideo chapter:
```json
{
  "children": [
    { "id": "intro", "type": "folder", ... },       // 4s
    { "id": "chapter", "type": "subvideo",         // 8.4s (internal children)
      "width": 1080, "height": 1920, "fps": 30,
      "isSeries": true, "transition": "fade",
      "actions": [{ "start": 0, "end": 8.4 }],
      "children": [ /* full stream tree */ ]
    },
    { "id": "outro", "type": "folder", ... }       // 3s
  ]
}
```

**Key points for AI editing**:
- A subvideo's children are a full stream tree — editors can focus on the subvideo content independently
- Subvideo's `isSeries`/`transition` control internal ordering (independent of parent)
- Subvideo's `actions[0].start` = offset within the subvideo (usually 0 for full play)
- Subvideo acts as foreground audio — mutes parent video while playing

## Key patterns

- **Never use studio** — preview uses bundled @remotion/player
- **No page reload on edit** — player refreshes in-place via `dispatchEvent("refresh-player")`
- **SSE for file change notifications** — `watchFile` → SSE `{type:"reload"}` → client ignores during edit, reloads itself after 4s
- **Close button + tab close** both trigger `/api/shutdown` to unblock the agent's terminal
- **Feedback input** in edit mode writes to `feedback.txt` next to the JSON file
