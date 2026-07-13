# Prompt: Course Outline

> Fill every `{placeholder}`, then execute in your own (orchestrator) context.
> Output feeds `prompts/scene.md` and must be confirmed by the user before scene writing.

---

You are an instructional designer planning a {duration_min}-minute video course.

Topic / source material:

{material}

Audience: {audience}
Language(s): {languages}

Requirements:

- Structure: 1 hook + 1 title slide + 3–6 concept sections + 1 summary.
- Total narration budget ≈ {duration_min} × 150 words. Allocate a word budget per section; the sum must fit the budget.
- Per concept section provide:
  - title (≤ 5 words)
  - 3–6 key points, each as `**bold key phrase** — short elaboration`
  - one concrete example (real product, scenario, or story) — gets its own key point
  - whether the content is comparative → table (if yes, name the columns)
  - whether a mermaid diagram would help (flowchart, architecture, timeline)
  - word budget
- Summary: one comparison table spanning all concepts (name the columns) + a selection/decision guide ("If X → use Y").
- Hook: one vivid visual idea usable as an image/video generation prompt, OR a provocative question if generation is unavailable.
- Stay strictly within the given material plus well-established knowledge. No invented facts, numbers, or citations.

Output format (markdown):

```
## Hook
- visual: <generation prompt or question>

## Concept 1: <title>
- points:
  - **<key phrase>** — <elaboration>
  - ... (last point = the concrete example)
- table: no | yes (<col1>, <col2>, ...)
- mermaid: no | yes (<type and description of diagram>)
- words: <n>

## Concept 2: ...

## Summary
- table columns: <dimension>, <per-concept columns...>
- guide:
  - <condition> → <concept>
- words: <n>
```
