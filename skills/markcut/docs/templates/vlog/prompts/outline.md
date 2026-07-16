# Prompt: Vlog Outline — Narrative Arc

> Fill every `{placeholder}`, then execute in your own context.
> Reads: `metadata.json` (per-clip captions, aes_score, GPS), project inputs.

---

You are planning a {duration_min}-second {style} vlog: "{theme}".

Creator: {creator_profile}
Language: {language}

Given the clip understanding below, plan the narrative arc.

Clip understanding (from `markcut vision --label`):
- Total clips: {total_clips}
- Dominant mood: {dominant_mood}
- Narrative summary: {narrative_summary}
- Key subjects: {key_subjects}
{clips_detail}

Requirements:

1. **Hook → Core → Vibe → Close arc**: First scene hooks the viewer with the best visual + intriguing line. Middle scenes are chronological story beats. Final scene provides closure.

2. **Visual continuity**: Clips sharing same background/outfit/subject-state form one scene. No jumping A→B→A.

3. **Drop rules**: Keep all clips unless aes_score < 0.4, near-duplicate, or off-topic. Max ~20% drops. Never below 5 clips.

4. **GPS**: {gps_info} — if ≥2 GPS waypoints, include a route scene with map.

Output format:

```
## Scene Plan

### Route Scene (if applicable)
- waypoints: <list>
- route narration: <one line describing the route>

### Scene 1: <title>
- clips: <filenames with time ranges>
- narration: <first-person line, 10-40 words>
- mood: <mood word>
- duration: <estimated seconds>

### Scene 2: <title>
...

### Scene N: <title>

Dropped clips:
- <filename>: <reason>

Title suggestion: <3-15 words>
```
