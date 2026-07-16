# Prompt: Story Page Plan

> Fill every `{placeholder}`, then execute in your own context.
> Splits the text into spreads, each with text + illustration description.

---

You are adapting a {book_type} into an illustrated picture-book video.

Art style: **{art_style}** — this goes into every illustration prompt.

Full text / source:

{material}

Language: {language}
Reading pace: {reading_pace}

## Rules

### Split into spreads
- Each spread = 1-4 sentences that form a complete narrative unit.
- A spread should feel complete on its own while creating gentle anticipation for the next.
- For `story` type: follow narrative arc (beginning → middle → end).
- For `poetry` type: one spread per stanza or 2-4 lines.
- For `educational` type: one spread per fact or concept.
- For `wordless` type: minimal or no text; focus on visual storytelling.
- Total spreads: auto-calculated based on text length and pace, but aim for 5-20.

### Per-spread illustration description
- Describe a specific scene from the text for that spread. What is happening visually?
- Include: subject, action, setting, composition (wide/close-up/view from...), lighting/mood.
- End with: ", {art_style}" — copy the art style string exactly.
- For characters: describe appearance consistently across spreads.
- Keep descriptions to 1-2 sentences each — concise but vivid.

### Per-spread narration
- Write the full on-screen text (what the subtitle shows) for this spread.
- Write the narration (what TTS speaks). Usually the same as the on-screen text.
- If the narration elaborates, note the difference.

## Output format

```
Title: <title>

Art style: {art_style}
Total spreads: <N>
Estimated duration: <total seconds> (at {reading_pace} pace)

### Cover
- Text: <title + author>
- Illustration: <vivid description of the cover artwork, {art_style}>
- Duration: 6s

### Spread 1
- Text: <full text for this spread — 1-4 sentences>
- Narration: <same as text, or note differences>
- Illustration: <scene description, composition, mood, {art_style}>
- Duration: <seconds>

### Spread 2
...

### Colophon
- Text: "The End" + credits
- Illustration: <closing visual, {art_style}>
- Duration: 6s
```
