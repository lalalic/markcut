# Prompt: Concept Scene (slide + script)

> Fill every `{placeholder}`, then execute in your own (orchestrator) context.
> Run once per outline section (TitleSlide, each Concept, Summary).
> Constraints below mirror TEMPLATE.md §2/§3 — the reviewer checks against them.

---

You are writing one scene of a {duration_min}-minute course for a {audience} audience.

Outline section:

{outline_section}

Course context (for continuity — do not repeat content already covered):

{outline_full}

Produce, for language(s) {languages}:

**A. Slide source** (markdown, rendered by `<Slide>`):

- `##` heading = section title
- ≤ 6 bullets, shape: `<emoji> **bold key phrase** — short elaboration`
- consistent emoji set across the course: {emoji_set}
- markdown table if the outline marks this section comparative
- `>` quote block only for a single memorable takeaway line
- no bullet may exceed one line at 1.3em / 1920px width (~90 chars)
- Optional mermaid diagram: add a fenced mermaid code block after the bullet list (` ```mermaid ...``` `) for flowcharts or architecture visuals.
- **For each bullet, suggest a visual** (image, diagram, screenshot, or icon) that could accompany it. The visual should show something concrete: a screenshot, a diagram step, a photo, etc.

**B. Narration script** (per language, **one paragraph per bullet**):

- **One paragraph per bullet** — never merge bullets into a single script. Each paragraph becomes a separate `- script "..."` node with `on:(start, <sceneId>.current=N)`.
- Paragraph length ≈ **15–30 words** per beat (~6–12s at 2.5 w/s).
- Each paragraph **expands** its bullet — never reads it verbatim.
- Spoken register: short sentences, no markdown, no stage directions.
- The concrete example gets its own bullet and its own paragraph. Place it last (final beat of the scene).
- For TitleSlide: 1 paragraph (just the welcome/introduction line).
- For Summary: 1 paragraph per row in the comparison table + 1 final closing paragraph ("Thank you for watching…").

Output format:

```
### <SceneName (PascalCase, no spaces)>

~~~md source
<slide markdown>
~~~
<one extra fenced block per additional language: ~~~md <lang>-source>

script (en):
<p1: describes bullet 1>

<p2: describes bullet 2>

<p3: describes bullet 3 — concrete example>

image suggestions:
<bullet 1: brief description of visual — e.g. GitHub commit diff screenshot>
<bullet 2: brief description of visual — e.g. unique hash diagram>
<bullet 3: brief description of visual — e.g. PR timeline graphs>

script (<lang>):
<p1 translation>

<p2 translation>

<p3 translation>
```
