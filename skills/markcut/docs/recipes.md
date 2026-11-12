# Recipe catalog — Markcut + installed video-shotcraft

Markcut exposes one **read-only, source-attributed catalog** for choosing reusable video shots. Markcut owns its native property-based recipes in `recipes/markcut/*.json`; the installed `video-shotcraft` Skill owns its shot cards. The catalog reads Shotcraft's `gallery/api/library.json` and corresponding `references/shots/<category>/<card>.md` **on demand**. It does not copy, convert or execute external demos.

## CLI and agent integration

```bash
markcut recipes                        # Combined human-readable list
markcut recipes list --json            # All cards with source / status / styles / paths
markcut recipes list --source markcut --category map
markcut recipes list --source shotcraft --category camera
markcut recipes list --search zoom
markcut recipes show markcut:map-route-journey
markcut recipes show shotcraft:cursor-flyover
markcut recipes show shotcraft:cursor-flyover --json
```

The JSON API includes `recipes[]`, `count`, and `sources.{markcut,shotcraft}`. Every recipe is namespaced: `markcut:<name>` or `shotcraft:<name>`; callers should persist the **qualified ID**, not a bare name. The same bare name can exist in both libraries. The `source`, `implementation`, `executable`, `category`, `duration`, `description`, and `sourceFile` fields let Editor plan safely. Shotcraft cards also include `styles[]` (Gallery variants), and `show` resolves the latest full source card text from its owning Skill.

| Source | Implementation | Action |
|---|---|---|
| `markcut` | `native-markcut`, `executable:true` | Copy its `snippet` into a Markcut `video.md`, customize the properties and source GPS/media, then `markcut verify` + real Preview. |
| `shotcraft` | `reference-shot-card`, `executable:false` | Read the original card's intent, tuning/known pitfalls, and its demo code; **adapt** the motion to supported Markcut nodes/JSX. A Shotcraft card is not itself a playable Markcut scene. |

Shotcraft is optional. The catalog looks for an installed Skill at `~/.agents/skills/video-shotcraft`, `~/.codex/skills/video-shotcraft`, then `~/.claude/skills/video-shotcraft`. If it is elsewhere, set `MARKCUT_SHOTCRAFT_SKILL_DIR=/absolute/path/to/video-shotcraft` (or `VIDEO_SHOTCRAFT_ROOT`). If missing or unreadable, Markcut's own recipes still list and work; the `sources.shotcraft.status` field reports the condition. No runtime Neo installation, external network, image generation or Shotcraft dependency is required just to list Markcut recipes.

## Native Google map recipes (property-only)

| ID | Map view | Typical length | Important parameters |
|---|---|---|---|
| `markcut:map-location-reveal` | `overview` | 3s | `center`, `camera.zoom`, `duration`, `mapType` |
| `markcut:map-route-journey` | `route` | 4–10s | `waypoints`, `routeAnimation`, `travelMode`, `routeColor` |
| `markcut:map-cinematic-follow` | `cinematic` | 3–5s | `waypoints`, `cinematic`, `camera`, `duration` |
| `markcut:map-streetview-explore` | `streetview` | 3–4s | `streetView.location`, `streetView.pov`, `radius`, `duration` |

Map examples in the registry use public sample coordinates, **not** the user's original GPS. They must be replaced with a Run's verified geographic evidence. Use Google Directions road geometry as the displayed Vlog trajectory between GPS stops per the owner's convention; preserve `google_directions` source attribution internally. Street View coverage is not guaranteed. Native maps still depend on a valid Google Maps key, billing, API availability and nonblank imagery. The Cinematic default is a moving 2D satellite map, not guaranteed real 3D or aerial footage.

The recipes are **selection/authoring aids**. They do not change the authoritative source `video.md`, do not bypass the story-driven Editor decision, and do not bypass `markcut verify`, Hosted Preview, video playback, media authorization or release checks.

## Maintaining the registry

- Add a new JSON file under `recipes/markcut/` named `<recipe-name>.json`; this file is the **single source of truth** for Markcut-owned recipe metadata. Include `name`, `title`, `category`, `description`, `parameters[]`, `durationSeconds`, and an actual compiling Markdown `snippet` (plus `view` for native map cards).
- Add compilation/validation tests when introducing a new native node or template. Do not promise arbitrary React effect support when an implementation is only a recipe suggestion.
- Shotcraft recipes are owned by the installed Skill; no Markcut-side copy or manual reindex is needed. If Shotcraft changes its Gallery JSON, the next `markcut recipes list` reads the new cards automatically.
- Recipe registration is catalog-only. It does not create new Markcut streaming APIs, render paths, media generation services, or a second Shotcraft runtime.
