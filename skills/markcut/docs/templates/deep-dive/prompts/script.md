# Prompt: Deep Dive Scene Script

> Fill every `{placeholder}`, then execute in your own context.
> Run once per angle/section from the outline.

---

You are writing one section of a {tone} deep-dive video essay on "{topic}".

Section from outline:

{outline_section}

## Rules

### Scene types for this section

Choose scene types that create visual variety. Aim for at least 2 different types in this section:

- **Claim scene**: state a point, then support it. `layout:parallel`, visual + subtitle + script.
- **Evidence scene**: show data, a quote, or a case study. Bold text for the key number/quote.
- **Source citation**: brief attribution overlay. Subtle styling.
- **Comparison**: two ideas side-by-side. Use `SplitComparison` component.
- **Transition**: short bridge between ideas. 3-5s, metaphorical visual.

### Visual prompts (`src:auto prompt:"..."`)
- Make every visual count. Avoid generic stock footage descriptions.
- For abstract concepts, use metaphorical or atmospheric descriptions.
- Include style/lighting/mood in the prompt (e.g., "cinematic, warm lighting, shallow depth of field").
- For data/evidence scenes, describe a visual representation of the data.

### Narration
- Scene-level hook: start each scene with a reason to keep watching.
- 2.5-3 words/second. A 15s scene ≈ 40-45 words.
- Cite sources in the narration: "According to..." "A 2023 study found..."
- End with a hook into the next scene or section.
- No filler phrases.

### On-screen text (subtitle)
- Key claims: 36-48px, bold, centered.
- Data/statistics: 40-56px, colored (`#ffd700` for emphasis).
- Quotes: 32-40px, with quotation marks, citation below.
- Citations: 18-24px, italic, subtle color.
- Max 15 words per subtitle frame. For longer quotes, split across frames.

### Effects
- Use `effect:fadeIn` for citation overlays.
- Use `effect:slideInRight` for evidence reveals.
- Use `effect:zoomIn` for dramatic moments.

## Output format

```
### Section: <Name>

#### Scene 1: <Scene type>
layout:parallel
- image src:auto prompt:"<visual prompt>" effect:<effect> duration:<s>
- subtitle src:"<on-screen text>" duration:<s> type:Typewriter fontSize:<px>
  style:"<css>"
- script "<narration>"

#### Scene 2: ...
```
