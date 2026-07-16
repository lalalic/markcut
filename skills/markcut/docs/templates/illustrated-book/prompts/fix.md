# Prompt: Apply Reviewer Findings

> Fill every `{placeholder}`, then execute in your own context.

---

Apply the reviewer findings below to `{book_md_path}` with minimal, targeted edits.

Reviewer findings (JSON):

{findings_json}

Rules:
- Address every `blocker` and `major` finding. Minor when trivially fixable.
- Art style inconsistency → rewrite the `prompt:"..."` values to append the art style string to every illustration. Ensure the same style string is used everywhere.
- Character inconsistency → update illustration prompts to use matching character descriptions (same color, features, clothing).
- Text-narration mismatch → make subtitle text and script text match exactly, or add a note if intentional.
- Wrong font/typography → change `fontFamily` in subtitle `style:` to serif (Georgia, Merriweather).
- Missing Ken Burns effect → add `effect:zoomIn` or `effect:fadeIn` to image nodes.
- BGM too loud → reduce volume, ensure `foreground:true`.
- Text in illustration → remove text/typography references from image prompts.
- Duration off → adjust per-spread durations or redistribute text across spreads.

After editing, list what changed:
```
- <finding id>: <spread> — <one-line description>
```

Then re-render and re-review.
