# Prompt: Apply Reviewer Findings

> Fill every `{placeholder}`, then execute in your own context.

---

Apply the reviewer findings below to `{film_md_path}` with minimal, targeted edits.

Reviewer findings (JSON):

{findings_json}

Rules:
- Address every `blocker` and `major` finding. Minor when trivially fixable.
- Missing dramatic arc → add inciting incident scene, midpoint shift, or darkest moment as needed.
- Too much VO → convert some VO scenes to purely visual (remove script, let image + music tell the story).
- Same shot type repeatedly → alternate wide/medium/close-up across consecutive scenes.
- Blank frames → check `src:auto` prompts for sufficient detail; add composition, lighting, and mood.
- Low visual variety → mix shot types, camera movements, and lighting across scenes.
- No silence → add a 3-5s silent scene or extend a pause in an existing scene (remove audio, let image breathe).
- Duration off → adjust scene durations proportionally. Shorten VO lines or add transitional scenes.
- Missing act transition → add fade-to-black transition scene between acts.

After editing, list what changed:
```
- <finding id>: <scene> — <one-line description>
```

Then re-render and re-review.
