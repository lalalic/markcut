# Prompt: Group & Filter Clips

> Fill every `{placeholder}`, then execute in your own context.
> Reads: `metadata.json` from `markcut vision --label`. Outputs structured scene groups.

---

You are transforming raw clip metadata into structured scene groups for a {style} vlog: "{theme}".

## Input — raw clip understanding

Below is the per-clip understanding from `markcut vision --label`, sorted by capture time. Each clip has:

- `filename` — original file name
- `type` — "image" or "video"
- `duration` — full clip duration in seconds (for videos)
- `caption` — VLM description of what the clip shows
- `aes_score` — aesthetic/interestingness score (0–1, higher = better)
- `user_label` — (optional) user's annotation from interactive labeling
- `gps` — (optional) {lat, lng} coordinates
- `stt` — (optional) STT transcript if video has speech

{clips_detail}

GPS waypoints (deduplicated, sorted): {gps_waypoints}

## Rules — filter

1. **Auto-keep** if `user_label` is present and positive (user specifically marked this clip as important).
2. **Drop** clips where `aes_score < 0.4`, unless it has a positive user label or is the only clip in its visual scene.
3. **Drop** near-duplicates: if two clips have visually identical captions (same subject, same angle), keep the one with higher aes_score.
4. **Drop** off-topic clips: screen recordings, blurry shots, transitions (pointing at ground, pocket shots).
5. **Max drops**: ≤20% of total clips. Never below 5 kept.
6. **List every dropped clip** with filename and reason.

## Rules — group into scenes

Each scene is a **single story beat** — one moment or idea. Group clips by **visual continuity**:

- **Same background + same clothing/lighting/subject-state → same scene**. Exhaust one scene before starting the next.
- A scene can be: a location/setting stop (lake, trail, campfire), a specific activity (setting up tent, cooking), or a thematic moment (arrival, farewell).
- **1–4 clips per scene**. A single long video take >10s may be its own scene.
- Each scene **3–20 seconds** estimated duration. Split if >20s.
- Clips within a scene play in capture order.
- **Transition between scenes**: root `layout:series` plays scenes sequentially, so group clips that belong together visually.

### For video clips, suggest trim boundaries

If a video clip is longer than needed:
- `startFrom` — where to start (seconds from beginning of clip)
- `endAt` — where to end (seconds from beginning of clip)
- Example: a 30s walking video may be trimmed to `startFrom:5 endAt:15` for the narrative-relevant 10 seconds.

### Route scene

If the user provided ≥2 GPS waypoints OR the clips reveal ≥2 distinct locations with GPS data, include a Route scene as the first scene with:
- Waypoints list
- Brief route narration
- Estimated duration: 4–8 seconds

## Output format

```json
{
  "route_scene": null | {
    "waypoints": [
      { "lat": 0, "lng": 0, "label": "place name" }
    ],
    "narration": "Route overview line..."
  },
  "scenes": [
    {
      "name": "Short descriptive name for the scene",
      "clips": [
        {
          "source": "filename",
          "type": "image | video",
          "startFrom": 0,
          "endAt": 10,
          "duration": 0
        }
      ],
      "estimated_duration": 0
    }
  ],
  "dropped_clips": [
    { "source": "filename", "reason": "Low aes_score (0.35)" }
  ],
  "arc": "Hook → Core → Vibe → Close",
  "total_kept": 0,
  "total_dropped": 0
}
```
