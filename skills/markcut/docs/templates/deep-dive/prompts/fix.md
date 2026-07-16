# Prompt: Apply Reviewer Findings

> Fill every `{placeholder}`, then execute in your own context.

---

Apply the reviewer findings below to `{deep_dive_md_path}` with minimal, targeted edits.

Reviewer findings (JSON):

{findings_json}

Rules:
- Address every `blocker` and `major` finding. Minor findings when trivially fixable.
- Unsupported factual claim → add a source citation scene or qualify the language ("some argue...").
- Missing counterpoint → insert a counterpoint section after the last angle, before synthesis.
- Hook too weak → rewrite hook as a question, contradiction, or provocative claim.
- Low visual variety → change some scene types (turn a claim scene into an evidence scene, add a transition scene).
- BGM too loud → reduce volume (0.05–0.08), ensure `foreground:true`.
- No citations on screen → add citation scenes for sourced claims.
- Duration off → adjust script word count (target × 2.5–3 w/s).

After editing, list what changed:
```
- <finding id>: <section> — <one-line description>
```

Then re-render and re-review.
