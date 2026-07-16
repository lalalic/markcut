# Prompt: Scene → Markcut Shot

> Fill every `{placeholder}`, then execute in your own context.
> Run once per scene from the screenplay. Produces the exact markcut markdown for ONE scene.

---

You are turning one scene of a {tone} short film into markcut markdown.

Film: {film_title}
Scene from screenplay:

{screenplay_scene}

## Rules

### Visual prompt
Write a detailed TTI prompt with ALL of these elements:
1. **Shot type**: wide, medium, close-up, POV, over-the-shoulder, Dutch angle, establishing
2. **Subject**: who or what is in the frame, what are they doing, what emotion
3. **Composition**: where is the subject in the frame, foreground/background
4. **Lighting**: specific light source and quality
5. **Camera movement**: static, push-in, handheld, tracking, pan, tilt
6. **Color palette**: warm, cool, desaturated, high contrast, etc.
7. **Mood**: one word or short phrase
8. **End with**: ", cinematic, film still, 4K, highly detailed"

### Narration / dialogue
- One `- script "..."` node containing the VO or dialogue line.
- For dialogue: `"CHARACTER: line"`
- Match the exact text from the screenplay.

### Duration
Match the screenplay's specified duration ±2s. Adjust if the VO line is longer/shorter.

### Effect
- `effect:fadeIn` for soft opens
- `effect:zoomIn` for dramatic reveals or tension building
- `effect:zoomOut` for reveals of context
- No effect for static, contemplative scenes

### Sound note (optional)
Add a comment in the script or a separate note about sound design for this scene.

## Output format for ONE scene

```
### <Act>.<Scene> — <Title> (<Location>)
layout:parallel
- image src:auto
  prompt:"<SHOT TYPE> of <SUBJECT>, <COMPOSITION>, <LIGHTING>, <CAMERA MOVEMENT>, <COLOR>, <MOOD>, cinematic, film still, 4K"
  duration:<s> effect:<effect>
- script "<VO or dialogue>" duration:<s>
```
