# Route & Vlog Map Videos — Agent Guide

> Make route / travel-vlog video clips with the `map` stream type: establishing
> dolly shots, route flyovers with photo stops, cinematic chase cameras, and
> immersive Street View moves — all narrated by TTS. This is the **agent-facing**
> reference: what effects you can get, how to discover spots, and copy-paste
> markdown. No implementation details.

---

## 1. When to reach for this

Use `map` clips when the video is about **a place and getting around**:

- travel vlog: "we drove from the Golden Gate to SFO, stopping for photos"
- city tour: establishing shot → flyover → street level
- route explainers: commute, road trip, walking tour, "how to get there"

Every map clip can carry a `script` narration next to it (see §6 for the
scene pattern that plays map + narration together).

---

## 2. The 4 views = 4 effects

`view` is the one field that decides the whole feel. Default is `route`.

| view | effect | best for |
|---|---|---|
| `overview` | **Dolly** — camera starts far (satellite) and flies down to the city/street | establishing shot, "this is where we are" |
| `route` | **Route map** — path + animated marker + optional photo thumbnails at each stop | itinerary, travel log |
| `cinematic` | **Chase flyover** — camera follows the route like a drone, road always "forward-up" | exciting transitions between stops |
| `streetview` | **Street View** — immersive pan / tilt / walk at ground level | being on location, "here we are" |

Example — one line each:

```md
- map view:overview duration:4 camera:{zoom:tween(6, 12, easeInOut)}
- map view:route duration:6 waypoints:[...] 
- map view:cinematic duration:8 waypoints:[...] cinematic:{tilt:tween(0, 45)}
- map view:streetview duration:6 streetView:{location:{lat:37.77,lng:-122.41}, pov:{heading:tween(200, 320)}}
```

---

## 3. Animating the camera — `tween()`

Any camera value can be **static** (a number) or **animated** with a tween
expression written directly in markdown:

```
tween(from, to, easing?)
```

| easing | feel |
|---|---|
| `easeInOut` (default) | smooth ease at both ends — default for camera moves |
| `easeIn` | starts slow, finishes fast |
| `easeOut` | starts fast, settles |
| `linear` | constant speed — use for constant pan |

Fields that accept `tween(...)`:

- `camera.zoom` — `tween(6, 12)` = dolly in (higher zoom = closer)
- `camera.heading` — `tween(0, 90)` = rotate the map
- `camera.tilt` — `tween(0, 45)` = tilt reveal (top-down → perspective)
- `camera.center.{lat,lng}` — fly across the map
- `cinematic.tilt` / `cinematic.range` / `cinematic.roll` — 3D camera moves
- `streetView.pov.heading` — pan: `tween(200, 320)` sweeps the view;
  `tween(200, 560)` = whip pan
- `streetView.pov.pitch` — `tween(0, -10)` tilts from sky to street
- `streetView.zoom` — Street View field-of-view: `tween(0, 1)` = dolly-zoom feel

Rules of thumb:

- **Zoom is not linear in perceived distance** — use `easeInOut` to hide the
  "pop". For a strong dolly: `zoom:tween(5, 13)` (city region → streets).
- Combine tweens for a richer move, e.g. dolly + tilt reveal:
  `camera:{zoom:tween(12, 14, easeInOut)} cinematic:{tilt:tween(0, 45, easeInOut)}`.

---

## 4. Photo stops (the vlog touch)

`waypoints` take an optional **4th field = media** (image path or URL). It
renders as a small thumbnail marker at that stop — perfect for "here's the
place" moments in a vlog:

```
[lat,lng,"Label"]                       # plain stop
[lat,lng,"Label","assets/photo.jpg"]    # stop with photo thumbnail
[lat,lng,"","assets/photo.jpg"]         # empty label = thumbnail only
```

Full example:

```md
- map view:route duration:6 travelMode:DRIVING mapType:roadmap routeColor:"#4285F4" routeWeight:5 routeMarker:"🚗"
  waypoints:[37.8199,-122.4783,"Golden Gate","https://picsum.photos/seed/gg/96/96"; 37.7749,-122.4194,"Civic Center","https://picsum.photos/seed/civic/96/96"; 37.6213,-122.3790,"SFO","https://picsum.photos/seed/sfo/96/96"]
```

---

## 5. Discovering spots along a route — `markcut spots`

Don't hand-pick coordinates for a route video — **discover** interesting stops
with the spots CLI. It samples points along a route (Directions API) and ranks
nearby places by `rating × log(ratings)`, then hands you ready-to-paste
markdown.

```bash
npx @lalalic/markcut spots --waypoints "37.8199,-122.4783;37.6213,-122.3790" \
  --travelMode DRIVING --limit 8 --photos --markdown
```

| flag | meaning |
|---|---|
| `--waypoints "lat,lng;lat,lng"` | route endpoints (semicolon-separated) — required |
| `--travelMode DRIVING\|WALKING\|BICYCLING` | how you travel the route (default DRIVING) |
| `--limit <n>` | max spots after ranking (default 8) |
| `--photos` | attach a photo URL per spot (becomes `waypoint.media`) |
| `--markdown` | print a copy-paste `waypoints:[...]` line to stderr |
| `--output spots.json` | also save the full JSON |

**Agent workflow — the tool only discovers, you compose:**

1. Get route endpoints from the user's media/GPS or pick two landmarks.
2. `markcut spots --waypoints "..." --photos --markdown`
3. Pick the 2–5 spots that fit the narrative arc (opening, highlights, ending).
4. Build a `map` storyboard with those `waypoints` + `script` narration.
5. `markcut preview` to check, `markcut render` to export.

---

## 6. Markdown examples (copy-paste)

### 6.1 Simple route clip with narration

Map + narration play together inside a `layout:parallel` scene; scenes are
sequenced by the root `layout:series`:

```md
# video
width:1080 height:1920 layout:series transition:fade transitionTime:0.5

## The-Drive
layout:parallel
- script "We leave the Golden Gate and head down to the airport."
- map view:route duration:6 travelMode:DRIVING mapType:roadmap routeColor:"#4285F4" routeWeight:5 routeMarker:"🚗"
  waypoints:[37.8199,-122.4783,"Golden Gate"; 37.7749,-122.4194,"Civic Center"; 37.6213,-122.3790,"SFO"]
```

### 6.2 Establishing dolly → cinematic chase (two scenes)

```md
# video
width:1080 height:1920 layout:series transition:fade

## Opening-Dive-In
layout:parallel
- script "High above San Francisco, then we dive into the streets."
- map view:overview mapType:satellite duration:4 camera:{zoom:tween(6, 12, easeInOut)}

## Chase-The-Road
layout:parallel
- script "The camera chases the route like a drone."
- map view:cinematic duration:8 travelMode:DRIVING mapType:satellite routeMarker:"🚗"
  cinematic:{mode:flyAlong, headingFollow:true, tilt:tween(0, 45, easeInOut)}
  camera:{zoom:tween(12, 14, easeInOut)}
  waypoints:[37.8199,-122.4783,"Golden Gate"; 37.7749,-122.4194,"Civic Center"; 37.6213,-122.3790,"SFO"]
```

### 6.3 Street-level: pan, then walk

```md
# video
width:1080 height:1920 layout:series transition:fade

## On-The-Street-Pan
layout:parallel
- script "And here we are, right on the sidewalk."
- map view:streetview duration:8 streetView:{location:{lat:37.7793,lng:-122.4193}, radius:50, pov:{heading:tween(200, 420, easeInOut), pitch:tween(0, -8)}, zoom:tween(0, 0.6, easeInOut)}

## A-Quick-Walk
layout:parallel
- script "A short stroll down the block."
- map view:streetview duration:6 streetView:{route:[{lat:37.7793,lng:-122.4193},{lat:37.7785,lng:-122.4185},{lat:37.7777,lng:-122.4178}], radius:50, pov:{heading:tween(0, 40, easeInOut), pitch:-5}}
```

### 6.4 Full route-vlog recipe (5 scenes)

Combine everything for a complete vlog arc: **establish → route with photos →
cinematic → street view pan → walk**.

```md
# video
width:1080 height:1920 layout:series transition:fade transitionTime:0.5

## Satellite-Dolly
layout:parallel
- script "We begin high above San Francisco, then dive into the city."
- map view:overview mapType:satellite duration:4 center:{lat:37.7749,lng:-122.4194} camera:{zoom:tween(6, 12, easeInOut)}

## Route
layout:parallel
- script "The route winds from the Golden Gate to the airport, with photos at each stop."
- map view:route duration:6 travelMode:DRIVING mapType:roadmap routeColor:"#4285F4" routeWeight:5 routeMarker:"🚗" waypoints:[37.8199,-122.4783,"Golden Gate","https://picsum.photos/seed/gg-bridge/96/96"; 37.7749,-122.4194,"Civic Center","https://picsum.photos/seed/civic-center/96/96"; 37.6213,-122.3790,"SFO","https://picsum.photos/seed/sfo-airport/96/96"]

## Cinematic
layout:parallel
- script "The camera tilts and chases the road like a drone."
- map view:cinematic duration:8 travelMode:DRIVING mapType:satellite routeMarker:"🚗" cinematic:{mode:flyAlong, headingFollow:true, tilt:tween(0, 45, easeInOut)} camera:{zoom:tween(12, 14, easeInOut)} waypoints:[37.8199,-122.4783,"Golden Gate"; 37.7749,-122.4194,"Civic Center"; 37.6213,-122.3790,"SFO"]

## Street-View
layout:parallel
- script "And finally, we land on the street itself."
- map view:streetview duration:8 streetView:{location:{lat:37.7793,lng:-122.4193}, radius:50, pov:{heading:tween(200, 420, easeInOut), pitch:tween(0, -8)}, zoom:tween(0, 0.6, easeInOut)}

## Street-View-Walk
layout:parallel
- script "A quick walk down the block."
- map view:streetview duration:6 streetView:{route:[{lat:37.7793,lng:-122.4193},{lat:37.7785,lng:-122.4185},{lat:37.7777,lng:-122.4178},{lat:37.7769,lng:-122.4170}], radius:50, pov:{heading:tween(0, 40, easeInOut), pitch:-5}}
```

---

## 7. Recipe — build a route/vlog clip

1. **Get the route** — endpoints from the user's media/GPS, or two landmarks.
2. **Discover spots** — `markcut spots --waypoints "lat,lng;lat,lng" --photos --markdown`; pick 2–5 that tell the story.
3. **Pick views per scene** — overview (establish) → route with photo stops (log) → cinematic (transition) → streetview (arrive).
4. **Write narration** — one `script` per scene; the resolver sizes the clip from the TTS audio automatically (don't hand-set durations that depend on script length).
5. **Verify** — `markcut preview book.md` (screenshot key frames, check map/pano loaded and captions), then `markcut render book.md --output out/vlog.mp4`.

---

## 8. Tips & pitfalls

- **Map + narration**: put `- map ...` and `- script "..."` as sibling bullets in a `layout:parallel` scene so they play together. If the scene is `series`, narration plays alone first and the map shows nothing while speaking.
- **Street View coverage is not universal** — a spot may have no panorama. If a `streetview` scene looks dark/empty, pick a nearby well-covered location or use `view:cinematic` instead.
- **Route maps need ≥2 waypoints**; a single point falls back to a plain marker.
- **Media assets** — photo thumbnails (`waypoint.media`), images, bgm etc. should live in the md file's folder (e.g. `assets/...`). See the asset-path rules in `markdown-descriptive.md` §14 (verify enforces md-folder-relative paths).
- **Don't set duration from script length** — the resolver computes it from TTS audio.
- **3D (Map3D)** is experimental and opt-in (`cinematic.fallback:"none"`); the default `fallback:"2d"` gives the safe drone-chase look.
