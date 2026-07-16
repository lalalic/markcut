# Prompt: Apply Reviewer Findings

> Fill every `{placeholder}`, then execute in your own context.
> Used after a FAIL verdict. You edit; the reviewer never does.

---

Apply the reviewer findings below to `{vlog_md_path}` with minimal, targeted edits.

Reviewer findings (JSON):

{findings_json}

Rules:
- Address every `blocker` and `major` finding. Minor findings only when trivially fixable.
- Each fix must respect TEMPLATE.md §2 scene grammar and §3 authoring rules.
- Narration fabrication → rewrite the line to use conservative paraphrase of clip captions.
- Broken src → fix the path or add a placeholder image.
- Duration mismatch → shorten/lengthen narration and adjust subtitle `duration:`.
- Blank frames → check startFrom/endAt values, clip ordering, and file existence.

After editing, list what changed:
```
- <finding id>: <scene> — <one-line description of the edit>
```

Then re-render and re-review.
