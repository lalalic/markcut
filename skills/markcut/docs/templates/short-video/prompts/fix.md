# Prompt: Apply Reviewer Findings

> Fill every `{placeholder}`, then execute in your own context.

---

Apply the reviewer findings below to `{short_md_path}` with minimal, targeted edits.

Reviewer findings (JSON):

{findings_json}

Rules:
- Address every `blocker` and `major` finding. Minor findings only when trivially fixable.
- Hook too slow → shorten hook duration, make text more punchy, use `effect:zoomIn`.
- Subtitle too small → increase `fontSize` in root config or per-scene.
- Missing BGM → add `- audio isBackground:true foreground:true src:bgm.mp3 volume:0.1` at root level.
- Missing effects → add `effect:zoomIn` to hook/CTA, `effect:slideInRight` to body scenes.
- Blank frames → check `src:auto` prompts generated usable media; if not, add fallback prompts.
- Wrong aspect → ensure root config is `width:1080 height:1920`.

After editing, list what changed:
```
- <finding id>: <scene> — <one-line description>
```

Then re-render and re-review.
