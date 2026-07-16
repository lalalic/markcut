# Prompt: Apply Reviewer Findings

> Fill every `{placeholder}`, then execute in your own (orchestrator) context.
> Used in TEMPLATE.md §5 step 6 after a FAIL verdict. You edit; the reviewer never does.

---

You are fixing a courseware video that failed review. Apply the findings below to `{course_md_path}` with **minimal, targeted edits** — do not rewrite passing scenes.

Reviewer findings (JSON):

{findings_json}

Rules:

- Address every `blocker` and `major` finding. Address `minor` findings only when the fix is trivial and local.
- Each fix must respect TEMPLATE.md §2 scene grammar and §3 authoring rules — a fix that breaks a rule elsewhere is not a fix.
- Slide/script mismatch → prefer fixing the **script** (cheaper: TTS regenerates; slide layout stays validated).
- Pacing/duration findings → adjust script word counts toward budget (target duration × 150 words total).
- Blank/illegible frame findings → check the scene's node (missing `isBackground:true`, broken `src`/`prompt`, oversized content) before touching styles.
- Never modify the `~~~js imports` or `~~~css stylesheet` blocks except the documented theme knobs (TEMPLATE.md §4).
- Keep all language variants in sync: an edit to a script or slide must be mirrored in every `<lang>:`/`<lang>-source` twin.

After editing, list what changed:

```
- <finding id>: <file location> — <one-line description of the edit>
```

Then re-render and re-review (TEMPLATE.md §5 steps 4–5).
