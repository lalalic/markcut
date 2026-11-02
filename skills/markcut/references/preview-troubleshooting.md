# Markcut preview: diagnose by evidence

Load only for a failed or uncertain native preview, map scene, audio/subtitle playback, MCP compilation, or hosted ChatGPT player. Read the target project's applicable rules and, for browser automation, the separately discovered WebHelm Skill. Never confuse a successful CLI parse or published resource with successfully watched video.

## Three independent gates

1. **Native player:** `npx @lalalic/markcut preview /absolute/path/video.md --no-browser --port <free-port>`; use `webhelm session start --url http://localhost:<free-port>/` in the managed Chrome and inspect actual scene frames, controls, maps, audio and captions. Do not use the Remotion Studio UI as evidence of native Markcut preview.
2. **MCP compilation:** invoke Neo's `markcut.preview({path})` on the **same** source document. Record compilation state, resolved revision/content hash and published resources, or the exact compiler failure. The MCP tool returns asynchronously; a queued operation is not a completed preview.
3. **Hosted ChatGPT player:** open the actual embedded video player, then play, pause and seek representative scenes, verify video frames and audible music/voice, and inspect subtitles and map movement. If the iframe did not load, report `hosted_player_unavailable`, not a media or mapping failure.

Use WebHelm's supported CLI help and paired `session start` / `session exec` / `session stop` workflow; release only task-owned sessions. For long inspections, maintain the session heartbeat. Refresh/inspect the captured DOM after navigation; never infer playback from metadata alone.

## Symptom → investigation

| Symptom | Check |
|---|---|
| Blank scene or black narration tail | Scene timing, generated image/video duration, `isBackground` for one full-length visual; inspect first/last frames. |
| Asset 404/empty frame | `markcut verify`, source-relative paths, asset publication, media response status, actual decoded frame. |
| Frozen animation | Tab visibility/throttling, render readiness, timeline clock; bring owned tab to foreground and retest. |
| Silent BGM or speech | Response status, decoded audio, playback paused/muted, browser AudioContext state, advancing frames, and nonzero analyzer samples/listen when available. Browser TTS should retain BGM and environmental audio. |
| Missing captions or wrong words | Current script, generated audio, VTT cue timing, actual displayed subtitles. |
| Map missing or poorly framed | Real tiles/polyline, actual camera center/zoom, relevant Maps/Routes API error, GPS/waypoint values; for `map view:route`, omitted zoom should auto-fit. |
| Hosted iframe differs from native | Inspect the hosted iframe and its real console/network errors, resource version and CSP restrictions; native success is not hosted success. |
| Review controls stale | Compare active published revision/hash and current review message; superseded revisions cannot authorize new approval. |

Sanitize screenshots/logs: never expose access tokens, map API keys, cookies, private GPS or private media URLs. Treat HTTP 200 or a decoded audio buffer as necessary but not sufficient evidence of effective playback. An inferred road route is not proof of recorded GPS movement.

## Recovery, verification and cleanup

Fix the failing layer, then repeat **that** gate and any downstream gates it affects. For MCP player/server code changes, rebuild the relevant bundle and reload **only** its provider via the supported Neo provider controls; never restart the entire Neo MCP app as a shortcut. Keep the previous successful preview revision available. On compilation or host failure, report the failed gate, revision, scene/time and sanitized evidence; do not silently claim approval or completed delivery. Stop owned preview servers and WebHelm sessions after inspection.
