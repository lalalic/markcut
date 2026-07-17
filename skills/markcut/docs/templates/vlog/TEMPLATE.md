---
name: vlog
description: Turn raw photos and video clips into a narrated vlog with music, using markcut's vision pipeline for media understanding and story-based scene grouping.
when-to-use: travel diaries, event recaps, camping trips, day-in-life, any vlog from personal media
engine: "@lalalic/markcut — run via `npx @lalalic/markcut`"
---

# Vlog Template

Follow this file top to bottom. Read the markcut skill (`SKILL.md` → `docs/markdown-descriptive.md`) first if you have not.

| Path | Runs in | Purpose |
|---|---|---|
| `TEMPLATE.md` | your context | everything |
| `prompts/*.md` | your context | fill-in prompts you execute |
| `agents/*.md` | separate session | subagent definitions |

## 0. Prerequisites

- `npx @lalalic/markcut` runnable
- `ffmpeg`/`ffprobe`/`exiftool` on PATH

## 1. Inputs — collect before starting

| Input | Required | Default | Notes |
|---|---|---|---|
| Media folder | **yes** | — | absolute path to folder of photos/videos |
| Theme / event name | **yes** | — | e.g. "birthday camping", "Tokyo trip", "product unboxing" |
| Date range | no | from media EXIF | — |
| Language | no | zh | narrator's language |
| Style | no | `daily` | `daily` (casual), `lyrical` (cinematic), `humorous` (funny) |
| Target duration | no | 60s | 15–120s for short vlogs |
| Profile | **parse from** | context | user's personality, region, family members, voice ref, life context. Read this file at the start — it's the authoritative source for who the creator is. The creator's name, region, family, and regular activities feed into narration naturally ("my daughter", "drove up from Ottawa", "my third camping trip this year"). |
| Voice | no | en: `en-US-GuyNeural` | edge-tts voice. If profile has a voice reference URL, use TTS voice cloning instead |
| BGM style | no | `ambient` | mood/genre for background music. BGM is **mandatory** — see §2 for root-level audio node |
| Vlog history | **read from** | `vlog_history.json` or folder | JSON array of past vlogs in the project. Used for story continuity ("last time I was here...", "my third camping trip this year"). If the file doesn't exist, start fresh. See §3 for history rules. |

**Rule:** The golden rule of vlogs — **every word in narration, title, or captions must be traceable to real data**: (1) user-stated facts, (2) clip VLM descriptions, (3) GPS/timestamp metadata, (4) user labels from interactive labeling, (5) local news/searched events for the date/location. Never invent people, dialogue, events, or place names. When unsure, paraphrase conservatively ("a path", "someone") rather than guessing.

## 2. Scene grammar — mandatory structure

### Overview

```
# video                          ← root: width:1920 height:1080 fps:30 layout:series
│                                  tts:"<edge-tts CLI template>"
├── ## Route                     ← (only if GPS data available)
│                                  layout:parallel
│                                  - map waypoints:[...]
│                                  - subtitle script:"Route narration..."
│
├── ## <Chronological Scene> ×N  ← each is a story beat
│   layout:parallel
│   - image/video src:... startFrom?... endAt?...
│   - image/video src:... duration:...
│   - subtitle script:"Narration line..." duration:N
│
└── ## <Outro Scene>             ← closing moment
    layout:parallel
    - video/ image src:... duration:...
    - subtitle script:"Closing line..." duration:N
```

### BGM — mandatory root-level audio

Add an `- audio isBackground:true` node at the root level. BGM is **non-optional**:

```
# video
width:1920 height:1080 fps:30 layout:series
- audio isBackground:true src:bgm.mp3 volume:0.15 foreground:true

## Hook ...
```

- `foreground:true` ducks the music volume when TTS narration plays (auto-ducking).
- Volume: 0.10–0.20 for ambient BGM; 0.05–0.10 for lyrical music.
- Source BGM from royalty-free libraries (see `prompts/bgm-select.md`).

### Core design: one scene per story beat, media + narration as parallel

Each scene is a **story beat** — a single moment or idea that stands on its own. Inside a scene, `layout:parallel` means all media and the subtitle narration play simultaneously.

```
## Into the Woods
layout:parallel
- image src:IMG_7100.JPG duration:2 start:0
- video src:IMG_7060.MOV startFrom:0 endAt:10 start:2
- subtitle script:"Drove into the park and a deer appeared on the trail. Good omen." duration:12
```

**Rules:**

- **Scene count**: 5–12 scenes. Each 3–20 seconds. Total duration matches target ±15%.
- **Hook → Core → Vibe → Close arc**: The first scene hooks the viewer (best visual + intriguing line). Middle scenes are chronological story beats. The final scene provides emotional/humorous closure.
- **Transition between scenes**: The root `layout:series` plays scenes sequentially. For smooth transitions, add `transition:fade(0.5)` to the root config line.
- **Media per scene**: 1–4 clips. Group clips by visual continuity (same background/outfit/subject-state). Avoid jumping A→B→A.
- **Subtitle node**: Each scene needs a `subtitle script:"..."` node. This is the TTS narration. Its `duration` must match the intended scene length. The script text also becomes the VTT subtitle overlay.
- **Duration driven by subtitle**: Set `duration:` on the `subtitle` node. Media nodes use `start:` and `duration:` to align within the scene. Videos use `startFrom:`/`endAt:` for trimming.
- **BGM is mandatory**: Always add an `- audio isBackground:true foreground:true` at root level (see BGM section above).
- **No bullet-reveal** — vlogs are linear media, not slides. No `current`/`on:` events needed.

### Scene media node style

For images:
```markdown
- image src:<relative-path> duration:<s> start:<s>
```

For video clips (trimmed):
```markdown
- video src:<relative-path> startFrom:<s> endAt:<s> start:<s>
```

The `src` path is relative to the media folder. During assembly, media is symlinked/copied into the markcut project so `npx markcut render` can serve it.

## 2.b Production polish — route sync, overlays, effects

### Route map synced with video

Beyond the opening route scene, show location context throughout the vlog:

**Per-scene map overlay** — Each scene that has GPS data shows a small map in the corner with the current location. The `map` node is placed inside the scene's `layout:parallel`:

```
## At the Lake
layout:parallel
- video src:lake.MOV startFrom:0 endAt:10 start:0
- map waypoints:[45.5997,-76.0053,"Lac Philippe"]
  style:position:absolute;top:20px;right:20px;width:200px;height:150px;border-radius:12px;opacity:0.85
- subtitle script:"The lake was glass-still under the gray sky." duration:10
```

The map is styled as picture-in-picture: top-right corner, rounded corners, semi-transparent. It shows a single waypoint marker for the scene's GPS location with a label.

**Map transition scene** — Between major location changes, insert a 3–5s map scene showing the driving route between two GPS points:

```
## Route-to-Camp
layout:parallel
- map duration:4 travelMode:DRIVING
  waypoints:[45.5893,-75.9814,"Trailhead";45.6368,-76.0136,"Campground"]
- subtitle script:"Drove up the gravel road toward the campground." duration:4
```

Use per-scene map overlays when GPS data is available for that specific clip. Use map transition scenes when the movement between locations is narratively significant (e.g., driving into the park, hiking between trails).

### Overlays

- **Persistent logo**: `- image isBackground:true src:logo.png style:position:absolute;bottom:24px;right:24px;width:60px;opacity:0.7` at root level.
- **Narrator overlay**: `- image/video isBackground:true src:narrator.png` with circular crop + border.
- **Entrance effects**: `effect:zoomIn` on key images for reveal moments.
- **See courseware template §2.b** for detailed overlay patterns (transition-audio timing, TTS expression control, effects).

## 3. Authoring rules — the professional bar

### Filter rules (see `prompts/group-clips.md`)

- Keep all clips unless: aesthetic score < 0.4, near-duplicate of a better clip, or off-topic.
- Always keep clips with a positive user label from the interactive labeling step.
- Max ~20% drops. Never drop below 5 clips total.
- List every dropped clip with a reason.

### Grouping rules (see `prompts/group-clips.md`)

- **Visual continuity rule**: clips sharing the same background/outfit/subject-state form one scene. Exhaust one scene before moving to the next. No jumping A→B→A.
- 1–4 clips per scene (a single long take >10s may be its own scene).
- Each scene 3–20s. Split if >20s.
- For video clips, suggest trim boundaries (`startFrom`/`endAt`) to keep only the narrative-relevant segment.

### Narration script

- **Every word must be grounded** in clip captions, user labels, GPS data, creator profile, local news, or vlog history. Never invent people, dialogue, events, or place names.
- First person ("I"), conversational, matching the creator's persona from the profile.
- **One narration line per scene**. Length: 10–40 words (~3–15 seconds at 2.5 w/s).
- **No stale templates**: no "you won't believe this" openers, no "happiness is this simple" endings.
- **Forbidden punctuation**: no parentheses `()` and no ellipses `...`.
- **Emoji**: at most one strongly relevant emoji per scene.
- **Opening scene**: get into the topic fast and set the tone.
- **Closing scene**: emotional or humorous close that wraps the story.

### Local context (news/events)

Before writing narration, search for local news, events, or weather for the vlog's date and location. Weave relevant findings into the story naturally:

- **Weather**: "It was unseasonably warm for October — 22 degrees and no clouds."
- **Local event**: "Turns out the Gatineau Park was running the fall colours festival that weekend."
- **Seasonal context**: "Full moon that night, so the trail was brighter than usual."

Rules:
- Only use facts confirmed by at least one search result. Never invent weather/events.
- Keep it to 1–2 local-context references per vlog. Don't overwhelm the narration.
- The context should **amplify** the story, not replace it. "Drove up during the fall colours festival so the park was packed" tells us more than just the festival fact.

See `prompts/local-context.md` for the search step.

### Story continuity from vlog history

If `vlog_history.json` exists (see §5), read it before writing narration. Reference past vlogs naturally:

- **Return visits**: "Back at Lac Philippe — my third camping trip here this year. The deer were expecting us."
- **Seasonal contrast**: "Last time I was here it was all mud and rain. Today it's golden and still."
- **Personal milestones**: "One year ago I was just learning to pitch this tent. Now it takes ten minutes."

Rules:
- Use history only if the current vlog shares location, theme, or timing with a past entry.
- Keep references brief (one line per vlog max). The story should stand alone.
- Never fabricate a past event. Only what exists in the history file.

### Creator profile

Read `~/.pi/agent/user.md` at the start and weave the creator's identity into narration naturally:

- **Personality**: introvert → quiet observational tone; extrovert → energetic, social.
- **Region**: name-drop the city/area ("drove up from Ottawa", "my favourite spot in the Outaouais").
- **Family**: use real names/roles ("my daughter", "my wife") as shown in the profile and visible in clips.
- **Regular activities**: if the user hikes regularly, frame this as one of many hikes ("another trail checked off the list").
- **Voice reference**: if the profile has a voice URL for TTS cloning, use that instead of default edge-tts voices.

### Title

One title, 3–15 words, poetic/suspenseful/summarizing, social-media friendly. Must reflect real content and feel personal. If vlog history shows a series, maintain naming conventions (e.g. "Camping SZN: Episode 3 — Lac Philippe").

### Multi-language (variants)

- Same pattern as courseware: `# <lang>` variant block at file end with per-language TTS voice.
- Every `script`/`subtitle` node gets a `<lang>:"..."` twin.

## 4. Components & styles

Vlogs don't need custom JSX components — they use markcut's built-in `image`, `video`, `audio`, `subtitle`, and `map` nodes. However, you may add these optional enhancements:

### Optional: NarratorBox component

If adding a narrator overlay with name label, include this in the `~~~js imports` block:

```jsx
import { delayRender, continueRender } from 'remotion'

export function NarratorBox({ src, name = '', size = 100 }) {
  return (
    <div style={{
      position: 'absolute', bottom: 40, left: 40,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
    }}>
      <div style={{
        width: size, height: size, borderRadius: '50%', overflow: 'hidden',
        border: '3px solid rgba(255,255,255,.6)',
        boxShadow: '0 0 20px rgba(0,0,0,.4)',
      }}>
        <img src={src} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
      {name && (
        <span style={{
          fontSize: 14, color: '#fff', textShadow: '0 2px 8px rgba(0,0,0,.6)',
          whiteSpace: 'nowrap', fontWeight: 500,
        }}>{name}</span>
      )}
    </div>
  )
}
```

### Stylesheet

No stylesheet needed for standard vlogs. The built-in markcut rendering handles video/image filling, subtitle positioning, and audio mixing. Add one only if you need custom overlays.

## 5. Workflow

### Phase 0: Load context

1. **Load creator profile** — Read `~/.pi/agent/user.md`. Extract: the user's name, region, personality, family members, regular activities, and voice reference URL. This profile infuses every narration line.

2. **Load vlog history** — If `vlog_history.json` exists in the project root, read it. Past vlog entries provide story continuity ("last time I was here..."). The file format is:
   ```json
   [
     {
       "date": "2026-06-18",
       "title": "Deer, Fire, and a Birthday at Lac Philippe",
       "location": "Gatineau Park, Quebec",
       "theme": "birthday camping",
       "people": ["Ray", "Ray's daughter"],
       "key_events": ["deer sighting", "campfire", "lake morning"]
     }
   ]
   ```
   If the file doesn't exist, start fresh.

### Phase 1: Prepare media

3. **Understand media** — Run markcut's vision pipeline on the media folder:
   ```
   npx @lalalic/markcut vision <media-folder> --label
   ```
   This extracts metadata, opens a preview for interactive labeling (add descriptions to key clips), normalizes media, runs VLM captioning and STT on video clips, and segments long videos.

   Interact with the label preview: browse clips, add descriptions to important ones. Close the browser when done. The output is `metadata.json` in the media folder with per-clip captions, aesthetic scores, GPS, timestamps, and user labels.

4. **Prepare project context** — Collect `metadata.json` and build the inputs table (§1). Extract GPS waypoints for route sync. Note the location and date for local context search.

### Phase 2: Group, Filter & Context

5. **Search local news/events** — Fill `prompts/local-context.md` with the vlog's location, date range, and theme. This searches for relevant weather, events, news, or seasonal information. The result feeds into narration with 1–2 natural references.

6. **Group and filter clips** — Fill `prompts/group-clips.md` with clip data from `metadata.json`. This produces:
   - Dropped clips with reasons
   - Visual-continuity scene groups
   - Trim boundaries for video clips
   - GPS waypoints for per-scene map overlays
   - Route scene detection (if ≥2 GPS points)

   Review output for narrative sense and drop reasonability.

### Phase 3: Storyboard

7. **Narrative arc + narration** — Combine grouped scenes + local context + vlog history + profile into a rich narrative:

   **A. Orchestrator does it** (simpler): Fill `prompts/outline.md` → rough arc. Then fill `prompts/storyboard.md` per scene → markcut markdown with media refs + narration.

   **B. Subagent does it** (recommended): Run `agents/story-writer.md` in a separate session. Pass it the grouped scene plan + local context + vlog history + profile. It returns `{title, scenes: [{name, narration, duration_sec}]}`. The orchestrator assembles this into markcut markdown.

   **Every word grounded**: spot-check 3 scenes — narration must trace to clip captions, labels, GPS, local context, profile, or history. No fabrication.

### Phase 4: Assemble

8. **Select BGM** — Choose background music that matches the vlog's mood. Fill `prompts/bgm-select.md` or search using the `audio-sourcing` skill. Download the track and reference it as `src:bgm.mp3` in the root-level audio node.

9. **Assemble course.md** — Write the markcut markdown file using §2 grammar. The root config line includes TTS voice. BGM is at root level (`- audio isBackground:true foreground:true src:bgm.mp3 volume:0.15`). For scenes with GPS data, add per-scene map overlays (see §2.b).

   **Media staging**: Make media accessible to the renderer:
   ```
   mkdir -p .markcut/generated/media/
   cp <media-folder>/clips_normalized/*.mp4 .markcut/generated/media/
   cp <media-folder>/*.jpg .markcut/generated/media/
   cp /path/to/bgm.mp3 .markcut/generated/media/bgm.mp3
   ```
   Reference as `src:.markcut/generated/media/<file>` in the markdown.

10. **Render** — `npx @lalalic/markcut render course.md`. On engine errors: fix and re-render, max 3 attempts per error, then ask the user.

### Phase 5: Review & History

11. **Review (quality gate)** — Run `agents/reviewer.md` in a fresh separate session. Pass absolute paths to: `course.md`, the rendered MP4, this `TEMPLATE.md`, target duration, language, and the media folder. Returns `{verdict, findings[]}`.

12. **Fix loop** — On FAIL: fill `prompts/review-fix.md` with findings, apply edits, re-render, re-review. Max 3 iterations, then escalate.

13. **Append to vlog history** — On PASS, append the current vlog to `vlog_history.json`:
    ```json
    {
      "date": "<date>",
      "title": "<title from narration>",
      "location": "<from GPS or inputs>",
      "theme": "<theme>",
      "people": ["<from profile, as referenced in narration>"],
      "key_events": ["<from group-clips scene names>"]
    }
    ```
    This feeds story continuity for the next vlog.

## 6. Quality gate — exit criteria

Done only when ALL hold:

- [ ] reviewer verdict = `PASS` (zero blocker/major findings)
- [ ] total duration within ±15% of target
- [ ] structure matches §2 (hook → chronological scenes → close)
- [ ] no blank/black frames at scene boundaries; videos play correctly
- [ ] STT transcript of rendered audio matches script lines (≥90% content match)
- [ ] every narration line grounded in clip captions, labels, GPS, or user profile (spot-check 3 scenes)
- [ ] no fabricated people, dialogue, events, or place names
- [ ] BGM is **present** (ffprobe confirms audio stream or mixed track) and audible (not silent, not clipping)
- [ ] BGM ducked under voice — TTS audible above music in ≥90% of spoken segments
- [ ] local context references (if any) verified against search results — no invented weather/events
- [ ] history references (if any) match actual entries in `vlog_history.json` — no fabricated past events
- [ ] media `src` paths resolve correctly (no broken links in rendered output)
- [ ] profile used: narration tone matches creator personality, family names from profile appear correctly
- [ ] per-scene map overlays (if GPS available) positioned without obstructing main content

## 7. Reference — worked examples

- Golden example: See `tests/fixtures/templates/courseware.md` for the template format.
- Reference vlog storyboard: The bullx vlog project at `free2/bullx/packages/vlog/storyboard.md` shows a real vlog (birthday camping at Lac Philippe) with 13 chronological scenes, route map, clip trimming, and first-person narration. The project's `.pi/agents/story-writer.md` and `.pi/prompts/vlog-storyboard.md` contain the source of truth for the story-writing methodology documented here.
