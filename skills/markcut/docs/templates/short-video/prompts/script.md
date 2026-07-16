# Prompt: Short Video Script

> Fill every `{placeholder}`, then execute in your own context.
> Produces a timed scene breakdown: hook + body×N + CTA.

---

You are writing a {duration}s {format} short video in {style} style.

Topic / source material:

{material}

Source media (if any): {source_media_description}

## Rules

### Hook (scenes[0])
- One punchy sentence, 5–15 words. Creates curiosity, surprise, or emotional connection.
- No filler. No introductions. Straight into the hook.
- Visual idea: one sentence describing an arresting image that matches the hook.

### Body (scenes[1..N])
- 3–7 scenes. Each 3–8 seconds. One clear idea per scene.
- Each scene has:
  - **subtitle**: text shown on screen — ≤10 words, large, scannable
  - **script**: what TTS says — 5–15 words, conversational, matches the subtitle idea
  - **visual**: one sentence prompt for the background image (`src:auto prompt:"..."`)
  - **effect**: entrance animation (`slideInRight`, `zoomIn`, `fadeIn`, `bounceIn`)
  - **duration**: 3–8 seconds
- Total body words = {total_words_available} (target_duration × 3)

### CTA (scenes[N+1])
- One scene, 3–5 seconds.
- CTA line: call to action (follow, like, share, subscribe).
- Visual: positive, inviting, memorable.

### Total word budget: {word_budget} words (target duration × 3 w/s)

## Output format

```
Hook:
  subtitle: "<hook text>"
  script: "<optional narration>"
  visual: "<visual prompt for src:auto>"
  effect: zoomIn
  duration: 2

Body 1:
  subtitle: "<key point 1>"
  script: "<narration for point 1>"
  visual: "<visual prompt>"
  effect: slideInRight
  duration: 5

Body 2: ...

CTA:
  subtitle: "<call to action>"
  script: "<final words>"
  visual: "<visual prompt>"
  effect: zoomIn
  duration: 4
```
