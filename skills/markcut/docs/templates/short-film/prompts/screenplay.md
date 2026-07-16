# Prompt: Screenplay — Three-Act Structure

> Fill every `{placeholder}`, then execute in your own context.
> Produces a scene-by-scene narrative plan with character arc, shot suggestions, and VO lines.

---

You are writing a {duration_min}-minute {film_type} short film in a {tone} tone.

Concept: **{concept}**

Source material: {source_material}
Language: {language}
Voice(s): {voices}

## Requirements

### Three-act structure

| Act | Function | Duration | Scenes |
|---|---|---|---|
| Teaser | Mood establisher, no context | 30–90s | 1 |
| Act 1 — Setup | Character, world, inciting incident | 90s–2min | 3 |
| Act 2 — Confrontation | Rising action, midpoint, darkest moment | 3–5min | 4–5 |
| Act 3 — Resolution | Climax, falling action, resolution | 90s–2min | 3 |
| Epilogue | Emotional close | 30–60s | 1 |

### Protagonist rules
- The protagonist must have a **desire** that drives the plot.
- The **inciting incident** must happen by the end of Act 1.
- The **midpoint** in Act 2 must shift the protagonist from reacting to acting.
- The **darkest moment** must occur just before the climax.
- The **climax** is where the protagonist confronts the central conflict — emotionally, not necessarily physically.
- The **resolution** shows the new ordinary — how the protagonist has changed.

### Scene format
For each scene, provide:

```
### Act X.Y — Scene Title (INT/EXT. LOCATION - TIME)
- Shot type: <wide/medium/close-up/POV/etc>
- Camera movement: <static/push-in/handheld/etc>
- Lighting: <golden hour/moonlight/neon/etc>
- Mood: <one word>
- Color palette: <cool/warm/desaturated/etc>
- Visual prompt: <one-sentence TTI prompt with shot, subject, lighting, mood>
- VO/Dialogue: <narration line or character dialogue>
- Duration: <seconds>
- Sound: <score/ambient/silence>
```

### VO rules
- VO is minimal. The story is told through images.
- One VO line per scene (max two). Each 10–30 words.
- For dialogue, mark speaker: "JOHN: I never thought..."
- No exposition dumps. Show, don't tell.

## Output format

```
Title: <title>

Logline: <one sentence>

### Synopsis (3 sentences)
1. <Beginning>
2. <Middle>
3. <End>

### Teaser
- Scene: <description>
- Visual: <prompt>
- VO: <line>
- Duration: <s>

### Act 1 — <title>

#### Scene 1.1 — <name> (<location>)
- Shot: <type>
- Camera: <movement>
- Lighting: <description>
- Color: <palette>
- Visual: <prompt>
- VO: <line>
- Duration: <s>
- Sound: <note>

#### Scene 1.2 ...
...

### Act 2 ...

### Act 3 ...

### Epilogue
- Visual: <prompt>
- VO: <line>
- Duration: <s>

Total estimated duration: <sum>
```
