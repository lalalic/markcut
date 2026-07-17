# Markcut Template System

> How to design and build video templates that agents can follow to produce professional, consistent videos.

## Why templates?

Markcut templates encode **domain expertise + production polish** into a reusable package. An agent reading a template learns not just markcut syntax, but:

- **What** makes a good video of this type (scene structure, pacing, rules)
- **How** to assemble it (workflow: prompts → agents → render → review)
- **Why** certain patterns work (production polish: transition timing, overlays, effects)

## Template package structure

```
templates/<name>/
  TEMPLATE.md          ← The single entry point. Everything except prompts & agents.
  prompts/
    <step>.md          ← Fill-in prompt templates. Run in the orchestrator's context.
    ...
  agents/
    <name>.md          ← Subagent definitions. Run in separate, isolated sessions.
    ...
  example.md           ← (optional) A complete worked example.
  example.mp4          ← (optional) Rendered output for reference.
```

### File type conventions

| File | Context | Purpose |
|---|---|---|
| `TEMPLATE.md` | Orchestrator's context | Complete spec: inputs, structure, rules, workflow, quality gate, components, styles |
| `prompts/*.md` | Orchestrator's context | Fill-in-the-blank prompt templates; the orchestrator replaces `{placeholder}` values and executes them |
| `agents/*.md` | **Separate** session | Full agent definitions with system prompt + task template. Each runs in a fresh, isolated subagent session with its own tools and context |

### Why separate prompts/ and agents/?

- **prompts/** — tasks the orchestrator does itself (outline generation, scene writing, fix application). These run in the orchestrator's own session so they have full context of the entire project.
- **agents/** — tasks that benefit from isolation (review, specialized generation). These run in separate sessions to avoid context pollution and to use specialized system prompts without interference.

## Anatomy of TEMPLATE.md

Every `TEMPLATE.md` follows this section order:

```
§0  Prerequisites       — tools, skills, environment checks
§1  Inputs              — what the orchestrator must collect from the user
§2  Scene grammar       — the canonical tree structure with hard rules
§3  Authoring rules     — professional-quality bar for content (text, timing, media)
§4  Components & styles — copy-verbatim code blocks with documented theme knobs
§5  Workflow            — numbered steps: prompts → agents → render → review
§6  Quality gate        — measurable exit criteria (the reviewer checks these)
§7  Reference           — links to golden examples or related docs
```

### §0 Prerequisites

What tools/skills the agent needs before starting. Always include:

- The engine itself: `npx @lalalic/markcut` runnable
- Required markcut skill (`SKILL.md` + `docs/markdown-descriptive.md`) — the agent must read these
- Any domain-specific tools

### §1 Inputs — the contract with the user

A table of what the orchestrator must collect before starting. Each row:

| Input | Required | Default | Notes |
|---|---|---|---|

**Rule:** never invent content beyond given material + well-established knowledge. Missing or ambiguous inputs → ask the user, never fabricate.

### §2 Scene grammar — the tree shape

The backbone. Show both:

1. **An ASCII tree diagram** of the required structure with layout/transition annotations
2. **Concrete code blocks** showing the exact node structure for each scene type

Hard rules come here: number of scenes, layouts, transitions, `isBackground` usage, timing rules, etc.

**Crucial design principle:** make the tree as explicit as possible. Show node types, `id:` values, `on:` events, positioning styles. Don't leave structural decisions to the agent.

### §3 Authoring rules — the professional bar

Rules the reviewer checks. Cover:

- Slide/content rules (max bullets, text shape, emoji conventions, table usage)
- Script/narration rules (pacing, per-sentence structure, example placement, tone)
- Media rules (positioning, sizing, where media can overlay)
- Multi-language variant rules
- Domain-specific rules (e.g. "never fabricate facts" for courseware, "ground every line in clip captions" for vlog)

### §4 Components & styles — copy verbatim

The trickiest section. Two code blocks:

1. **`~~~js imports` block** — all JSX component definitions the video needs. The agent copies this verbatim. Mark which parts are theme knobs (values that can change) vs structural (must stay the same).
2. **`~~~css stylesheet` block** — all CSS. Same rules: theme knobs documented, structure immutable.

In addition, a **theme knobs table** showing what the user can change (colors, fonts, sizes) and their defaults.

**Best practice:** keep the component block minimal. One reusable `Slide` component is better than ten one-off components. Use standard markcut features (`- image`, `- video`, `- component`, `- effect`) before writing custom JSX.

### §5 Workflow — the orchestrator's playbook

Numbered steps from start to finish. Each step is one of:

- **Fill a prompt** — "Fill `prompts/outline.md` → course outline. Present to user for confirmation."
- **Run a subagent** — "Run `agents/reviewer.md` in a fresh session. Pass it these absolute paths."
- **Execute a CLI command** — "`npx @lalalic/markcut render course.md`"
- **User interaction** — "Get user approval before continuing."

Include fix loops:

> 6. **Fix loop** — on FAIL: fill `prompts/fix.md` with the findings, apply edits, re-render. Max 3 iterations, then escalate to user.

### §6 Quality gate — measurable exit criteria

The checklist the reviewer uses. Each item must be machine-verifiable (by reviewing source, extracting frames, running STT, measuring duration). Examples:

- Total duration within ±15% of target
- Structure matches §2 (hook, title, N concepts, summary, thanks)
- No blank/black frames at scene boundaries
- STT transcript matches scripts (≥90% content match)
- Each bullet has a narration beat

### §7 Reference — worked examples

Link to golden example files in `tests/fixtures/templates/`. The golden example demonstrates every rule in the template applied correctly.

## Production polish patterns (reusable)

These are design patterns you can include in any template. They're documented in detail in the courseware template (§2.b) but summarized here:

| Pattern | Technique | Use case |
|---|---|---|
| **Per-beat media** | `#### Beat` sub-scenes with `layout:parallel` (image + script per beat) | Courseware slides, tutorial demos |
| **Transition-audio timing** | `start:<T>` on script nodes in `transitionSeries` | Any scripted scene with transitions |
| **Persistent overlay** | `- image isBackground:true` at root level | Logo, watermark |
| **Narrator PiP** | `- video/image isBackground:true` with border-radius + name label | Talking-head overlays |
| **Entrance effects** | `effect:zoomIn` / `effect:fadeIn` on images/components | Reveal animations |
| **Mermaid diagrams** | ` ```mermaid ` in slide markdown | Flowcharts, architecture, timelines |
| **TTS expression** | `—` pauses, `*emphasis*`, rate adjustment, phonetic spelling | Natural speech |

## Prompt design principles

### prompts/*.md
- Use `{placeholder}` values for every input. The orchestrator replaces these before executing.
- Include constraints from TEMPLATE.md inline so the prompt is self-contained.
- Output format should be a concrete template the orchestrator can parse and assemble.

### agents/*.md
- Must include a **system prompt** (top) and a **task template** (bottom, filled by orchestrator).
- System prompt defines the agent's role, rules, and procedure.
- Task template uses `{placeholder}` values for paths, params, and inputs.
- Always mark the agent as `mode: read-only` if it shouldn't edit files.
- Include an explicit output schema (JSON format) so the orchestrator can parse results reliably.
- List which tools the agent needs (read, bash, ffmpeg, etc.).

## Choosing prompts vs agents

| Task type | Where | Why |
|---|---|---|
| Creative generation (write a scene) | `prompts/` | Needs full context of the project; best done by orchestrator |
| Factual check (review) | `agents/` | Needs fresh context; strict rubric; no editing |
| Research (find images, analyze) | `agents/` | Parallelizable; heavy tool use |
| Outline / planning | `prompts/` | Needs user interaction (confirm outline) |
| Quality fix | `prompts/` | Orchestrator applies edits, runs tools |

## Testing a template

1. **Generate** — have a model follow the template to produce a video markdown
2. **Render** — `npx @lalalic/markcut render <output>.md`
3. **Review** — run the reviewer agent on the rendered output
4. **Fix** — apply fixes, re-render, re-review
5. **Verify** — check frames visually, check STT transcript

The courseware template's test loop is the reference:

```
Agent (deepseek-v4-flash + SKILL.md + markdown spec) → course.md
└→ npx markcut render → course.mp4
   └→ Reviewer agent (separate session) → PASS/FAIL + findings
      └→ Fix → re-render → re-review (max 3x)
```

## Built-in templates
All builtin templates are in `templates/` and can be used as-is or forked for your own. Each has a `TEMPLATE.md` with full instructions.

## Cross-cutting concerns

### Multi-language
- Use variant blocks (`# <lang>` at file end) with per-language TTS voice.
- Every script node has a `<lang>:"..."` twin; every slide source has a `<lang>-source` twin.
- The engine resolves variants via `parseMarkdownVariants`.

### Reviewer design
- Always `mode: read-only` — reviewers report findings, never edit.
- Two-phase: static (source vs rulebook) + dynamic (rendered artifact via ffprobe/ffmpeg/STT/vision).
- Output: strict JSON with `{verdict, measured, findings[]}`. Each finding has `id`, `severity`, `scene`, `check`, `issue`, `evidence`, `fix_hint`.
- PASS requires zero `blocker` and zero `major` findings.

### The "orchestrator" role
The orchestrator is the agent reading the template. It:
1. Collects inputs from the user
2. Executes prompts in its own context
3. Spawns subagents in separate sessions for isolated tasks
4. Assembles, renders, fixes, and iterates
5. Escalates to the human user when stuck

The template is written FOR the orchestrator. Every instruction is an actionable command: "fill this prompt", "run this agent", "render the file", "if FAIL, fix and re-render".
