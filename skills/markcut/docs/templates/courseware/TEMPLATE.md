---
name: courseware
description: Turn a topic or teaching material into a professional slide-based course video with TTS narration, bullet-reveal slides, and a reviewer quality gate.
when-to-use: lessons, lectures, training, tutorials, explainers — 1-5 minute educational videos built from slides + narration
test: 
---

# Courseware Template

Follow this file top to bottom. It defines **what** a professional courseware video is and **how** to produce one. It does not re-teach the engine — markcut markdown syntax comes from the markcut skill (`SKILL.md` → `docs/markdown-descriptive.md`). Read those first if you have not.

Layout of this template package:

| Path | Runs in | Purpose |
|---|---|---|
| `TEMPLATE.md` | your context | everything: inputs, structure, rules, workflow, quality gate |
| `prompts/*.md` | **your own (orchestrator) context** | fill-in prompt templates you execute yourself |
| `agents/*.md` | **separate agent session** | subagent definitions (system prompt + task template) |

## 0. Prerequisites

- markcut skill loaded (engine contract: `SKILL.md` + `docs/markdown-descriptive.md`)
- `npx @lalalic/markcut` runnable
- For the reviewer gate: `ffmpeg`/`ffprobe`, an STT CLI (e.g. whisper), and image-understanding capability

## 1. Inputs — collect before starting

| Input | Required | Default | Notes |
|---|---|---|---|
| Topic / source material | **yes** | — | plain topic, outline, doc, or article |
| Audience level | no | beginner | beginner / intermediate / expert |
| Language(s) | no | en | extra languages become variants (see §3) |
| Target duration | no | 2 min | 1–5 min |
| Accent color | no | `#61dafb` | theme knob, see §4 |

**Rule:** if the topic/material is missing or ambiguous, ask the user. Never invent course content beyond the given material plus well-established knowledge of the topic. Never invent facts, numbers, or citations.

## 2. Scene grammar — mandatory structure

```
# video                          ← root: width:1920 height:1080 fps:30 layout:series
│                                  subtitle:{fontSize:"20px"}
├── ## Hook                      ← 3–5s attention grabber, fixed duration
├── ## Slides                    ← layout:transitionSeries transition:fade(0.5)
│   ├── ### TitleSlide           ← transitionSeries, bullet-reveal (1 beat)
│   ├── ### <Concept> × 3–6     ← transitionSeries, bullet-reveal (1 beat per bullet)
│   └── ### Summary              ← transitionSeries, bullet-reveal (1 beat per takeaway)
└── ## Thanks                    ← fixed duration:6, no script
```

Scene rules:

- **Hook**: `- image duration:3 prompt:"<vivid visual, cinematic>"` (or `video`). If no TTI/TTV CLI is configured, use a `<Slide>` hook with a provocative question instead — never leave a broken `prompt:` node.
- **Every scene inside Slides (TitleSlide, concepts, Summary)** uses the **bullet-reveal pattern** — this is mandatory, not optional:

  ```
  ### <SceneName>
  layout:transitionSeries transition:fade(0.5)
  - component id:<shortId> isBackground:true jsx:"<Slide current={current}>{source}</Slide>"
    ~~~md source
    ## Title
    - 🎯 **Key point 1** — elaboration
    - 🎯 **Key point 2** — elaboration
    - 🎯 **Key point 3** — elaboration
    ~~~
  - script "Paragraph expanding bullet 1..." on:(start, <shortId>.current=1)
  - script "Paragraph expanding bullet 2..." on:(start, <shortId>.current=2)
  - script "Paragraph expanding bullet 3..." on:(start, <shortId>.current=3)
  ```

  - `id` must be unique per scene (e.g. `t`, `c1`, `c2`, `s`). The `id` connects the component to the script events.
  - `current={current}` on the Slide component reads the event-driven bullet index and highlights the matching `<li>`.
  - Each `- script "..."` node is one beat in the `transitionSeries`, so it gets a fade transition. The TTS duration of that script determines the segment length.
  - The component has `isBackground:true` so its `<Slide>` spans all beats of the scene.
  - **Beat count = bullet count**: TitleSlide gets 1 beat (just the welcome line), concept scenes get 1 beat per bullet, Summary gets 1 beat per row in the comparison table or per major takeaway.

- **Thanks**: fixed-visual, `duration:6`, no script.

- **Mermaid diagrams inside slides**: Fenced mermaid code blocks (` ```mermaid `) inside `~~~md source` are rendered by the `<Slide>` component (see §4). Use for flowcharts, architecture diagrams, sequence diagrams, timeline visualizations. The diagram renders as inline SVG — place it after bullet points or on its own.

- **Duration is TTS-driven**: never set explicit `duration` on scenes that have a script. Only fixed-visual scenes (Hook, Thanks) get `duration:`.

### Production polish — optional enhancements

Once the basic structure works, add these to make the video more professional.

#### A. Bullet-level media (image/video/component per bullet)

Each bullet can have its own visual accompaniment that appears only during that beat. Use `#### Beat` sub-scenes inside the concept scene to group the media and script into one transition segment:

```markdown
### Commits
layout:transitionSeries transition:fade(0.5)
- component id:c isBackground:true jsx:"<Slide current={current}>{source}</Slide>"
  ~~~md source
  ## Commits
  - 📸 **Snapshot** — Every commit records changes
  - 🏷️ **Unique hash** — Each has an ID like a1b2c3d
  - 🔗 **Real example** — GitHub commit history for a PR
  ~~~

#### B1-Snapshot
layout:parallel
- image src:snapshot.png style:position:absolute;right:60px;top:50%;width:35%;border-radius:12px;transform:translateY(-50%)
- script "A commit is like a photograph of your project at a moment in time..." start:0.5 on:(start, c.current=1)

#### B2-Hash
layout:parallel
- image src:unique-id.png style:position:absolute;right:60px;top:50%;width:35%;border-radius:12px;transform:translateY(-50%)
- script "Every commit gets a unique hash, like a1b2c3d, so you can always find it later..." start:0.5 on:(start, c.current=2)

#### B3-Example
layout:parallel
- image src:pr-history.png style:position:absolute;right:60px;top:50%;width:35%;border-radius:12px;transform:translateY(-50%)
- script "For example, when reviewing a pull request on GitHub, each commit tells a story..." start:0.5 on:(start, c.current=3)
```

Rules for bullet-level media:
- Position the media in the **right third** of the slide (`right:60px;width:35%`) so it doesn't overlap the left-aligned text.
- Use `border-radius:12px` for images, `border-radius:50%` for circular narrator avatars.
- The media node and script node are siblings in a `layout:parallel` sub-scene so they play together as one segment.
- Each beat node name should briefly describe the visual (e.g. `#### B1-Snapshot`).
- For **video** clips per bullet: use `- video src:...` instead of `- image src:...`. Same positioning.
- For **component** per bullet: use `- component jsx:"<MyBulletVisual />"` with its own styling.

#### B. Transition-audio timing

In a `transitionSeries`, adjacent segments overlap by the transition duration (default 0.5s). Without adjustment, the next paragraph's TTS audio starts playing during the fade — creating cacophony.

**Fix: add `start:<T>` to every script node in a transitionSeries, where T = your transition time.**

```markdown
- script "Paragraph..." start:0.5 on:(start, c.current=1)
```

This delays both the TTS audio AND the bullet-highlight event until after the transition completes. The transition time value must match the `transition:fade(T)` parameter.

> **If using multiple transitionSeries (nested)**: segment overlap compounds. Each script still gets `start:T` relative to its own segment. The engine handles the compound timing.

#### C. Persistent logo overlay

Add a logo that appears throughout the entire video by placing an `- image isBackground:true` at the root level:

```markdown
# video
width:1920 height:1080 fps:30 layout:series
- image isBackground:true src:logo.png style:position:absolute;bottom:24px;right:24px;width:60px;opacity:0.7

## Hook ...
## Slides ...
## Thanks ...
```

The `isBackground:true` flag wraps the image in `<Loop>` so it plays for the full video duration. Position it in a corner so it doesn't cover slide content.

Variations:
- **Bottom-left**: `bottom:24px;left:24px`
- **Transparent watermark**: `opacity:0.3;width:160px`
- **Animated logo**: use `- video loop isBackground:true src:logo-animated.mp4`
- **Component logo**: use `- component isBackground:true jsx:"<Logo />"` and define `<Logo>` in the imports block for custom styling.

#### D. Narrator overlay (picture-in-picture)

Add a narrator's face or avatar as a persistent overlay in a corner. Two approaches:

**Static image (circular crop):**
```markdown
- image isBackground:true src:narrator.png style:position:absolute;bottom:40px;left:40px;width:100px;height:100px;border-radius:50px;border:3px solid #61dafb;object-fit:cover
```

**Video loop (animated narrator):**
```markdown
- video loop isBackground:true src:narrator.mp4 style:position:absolute;bottom:40px;right:40px;width:140px;height:140px;border-radius:70px;object-fit:cover;border:3px solid rgba(255,255,255,.3)
```

**With name label (using component):**
```markdown
- component isBackground:true jsx:"<NarratorBox src='narrator.png' name='Dr. Smith' />"
```

The `NarratorBox` component is available in the imports block (see §4) and adds a name label + glow effect.

**Placement rules:**
- Narrator overlay goes in the **opposite corner** from the logo. If logo is bottom-right, narrator goes bottom-left.
- The overlay should be small enough (≤140px diameter) to not distract from slide content.
- For video narrators, keep the B-roll simple and well-lit (talking head style).

#### E. Effects (entrance animations)

Apply CSS keyframe animations to images and components for entrance effects:
```markdown
- image src:chart.png effect:zoomIn duration:1
- component jsx:"<Counter />" effect:fadeIn duration:2
```

See markcut docs for available effect types: `fadeIn`, `zoomIn`, `bounceIn`, `slideInLeft`, `slideInRight`, `flipIn`, or custom keyframes.

#### F. TTS expression control

Guide TTS pronunciation for more natural speech using SSML-style cues in the script text:
- **Pause**: use `—` (em dash) or `...` for natural breath pauses
- **Rate**: set `tts.rate:+10%` on the root config line for faster pacing, or `tts:{"--rate +10%"}` per scene
- **Phonetic spelling**: for jargon ("Snyk" = "snik", "Grafana" = "gruh-fah-nuh"), add parenthetical pronunciation on first use: `Snyk (pronounced "snik")` 
- **Language mix**: for bilingual content, switch tts voice per language using the `# <lang>` variant block

## 3. Authoring rules — the professional bar

Slide content:

- One idea per slide. ≤ 6 bullets. Bullet shape: `🔹 **bold key phrase** — short elaboration`.
- Emoji bullet prefixes for scannability (🤖 📊 🔄 🏷️ 💡 ⚡ …), consistent within the course.
- Use a markdown **table** whenever content is comparative (applications, methods, milestones).
- Use a `>` quote block for the one memorable takeaway line.
- Code blocks only when actually teaching code; keep ≤ 10 lines per slide.

Narration script:

- **One paragraph per bullet.** Never merge bullets into a single monolithic script. Each bullet gets its own `- script "..."` node with `on:(start, id.current=N)`.
- Paragraph length ≈ **15–30 words** per beat (≈6–12 seconds at 2.5 w/s). Total words = target minutes × 150.
- Each paragraph **expands** that bullet — never reads it verbatim. The paragraph plus all sibling paragraphs must touch every bullet on the slide.
- The concrete example gets its own bullet and its own script paragraph. Never bury the example in a generic paragraph.
- Bullet ordering: concepts first (what/why), example last (concrete reinforcement). The example is the final beat before advancing to the next scene.
- Summary: each row in the comparison table gets one beat. The final beat closes the course ("Thank you for watching…").
- **Transition-audio timing**: in a `transitionSeries`, add `start:<transitionTime>` to each script node to prevent TTS audio from playing during fade transitions (see §2.b).

Mermaid diagrams:

- Use ` ```mermaid ` fenced code blocks inside `~~~md source` for charts, flowcharts, architecture diagrams, sequence diagrams, and timelines.
- Place mermaid blocks after the bullet list, separated by a blank line.
- The Slide component (see §4) renders mermaid code blocks as inline SVG. Ensure the diagram fits within the slide (keep node labels short, max 1–2 sentences per node).
- For complex diagrams that take time to render, pre-render them as SVG files via `mmdc` (mermaid-cli) or your TTI CLI, and reference as `- image src:...` instead — this is more reliable for final render.

Multi-language (variants):

- For each extra language: a `<lang>:"..."` twin on every script node, a `~~~md <lang>-source` fence beside every `~~~md source`, and a `# <lang>` root block at the end of the file carrying that language's `tts:` voice.
- See the worked example in §7 for the exact shape (`zh` variant).

## 4. Components & styles — canonical, copy verbatim

Copy both blocks into the generated `course.md` unchanged (except the theme knobs below).

~~~~text
~~~js imports
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm'
import mermaid from 'mermaid'
import React from 'react'
import { delayRender, continueRender } from 'remotion'

// Initialize mermaid once. Theme matches the slide deck's dark scheme.
mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose' })

/**
 * Renders a mermaid diagram as inline SVG.
 * Uses Remotion's delayRender/continueRender so the diagram is guaranteed
 * to be ready before the frame is captured.
 */
export function Mermaid({ source }) {
  const ref = React.useRef(null)

  React.useEffect(() => {
    if (!source || !ref.current) return
    const handle = delayRender('Mermaid rendering')
    mermaid.render('mmd-' + Math.random().toString(36).slice(2), source)
      .then((result) => {
        if (ref.current) ref.current.innerHTML = result.svg
        continueRender(handle)
      })
      .catch((err) => {
        console.error('Mermaid error:', err)
        continueRender(handle)
      })
  }, [source])

  return <div ref={ref} style={{ width: '100%', maxWidth: 960, margin: '20px auto' }} />
}

/**
 * Courseware slide component.
 * - Renders markdown via react-markdown
 * - Highlights the Nth bullet when `current=N`
 * - Renders mermaid code blocks ( ```mermaid ...``` ) as inline diagrams
 */
/**
 * Picture-in-picture narrator overlay with name label.
 * Place as isBackground:true at root level.
 */
export function NarratorBox({ src, name = '', size = 100 }) {
  return (
    <div style={{
      position: 'absolute',
      bottom: 40,
      left: 40,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 6,
    }}>
      <div style={{
        width: size,
        height: size,
        borderRadius: '50%',
        overflow: 'hidden',
        border: '3px solid #61dafb',
        boxShadow: '0 0 20px rgba(97, 218, 251, 0.3)',
      }}>
        <img
          src={src}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>
      {name && (
        <span style={{
          fontSize: 14,
          color: '#a8dadc',
          textShadow: '0 2px 8px rgba(0,0,0,.6)',
          whiteSpace: 'nowrap',
        }}>{name}</span>
      )}
    </div>
  )
}

/**
 * Two-column layout: slide text on left, media on right.
 * Use inside a parallel layout for per-bullet media (see §2.b).
 */
export function SplitSlide({ source, mediaSrc, current = 0, mediaPosition = 'right' }) {
  const mediaContent = mediaSrc && (
    <img src={mediaSrc} style={{
      maxWidth: '100%', maxHeight: '100%', objectFit: 'contain',
      borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,.4)',
    }} />
  )
  let idx = 1
  return (
    <div style={{
      display: 'flex', flexDirection: mediaPosition === 'right' ? 'row' : 'row-reverse',
      width: '100%', height: '100%', padding: 40, boxSizing: 'border-box', gap: 32,
    }}>
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        justifyContent: 'center', minWidth: 0,
      }}>
        <div className="slide" style={{ padding: 0, margin: 0, width: '100%' }}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}
            components={{
              li: ({ children }) => {
                const highlight = idx === current; idx++
                return <li className={highlight ? 'highlight' : ''}>{children}</li>
              },
              pre: ({ children }) => {
                const code = React.Children.toArray(children)[0]
                if (code?.props?.className === 'language-mermaid') {
                  return <Mermaid source={String(code.props.children)} />
                }
                return <pre>{children}</pre>
              },
            }}>{source}</ReactMarkdown>
        </div>
      </div>
      <div style={{
        width: '40%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {mediaContent}
      </div>
    </div>
  )
}

export function Slide({ current = 0, children }) {
  let idx = 1
  return (
    <div className="slide">
      <ReactMarkdown remarkPlugins={[remarkGfm]}
        components={{
          li: ({ children }) => {
            const highlight = idx === current; idx++
            return <li className={highlight ? 'highlight' : ''}>{children}</li>
          },
          // Fenced code blocks — detect mermaid, render as diagram
          pre: ({ children }) => {
            const code = React.Children.toArray(children)[0]
            if (code?.props?.className === 'language-mermaid') {
              return <Mermaid source={String(code.props.children)} />
            }
            return <pre>{children}</pre>
          },
        }}>{children}</ReactMarkdown>
    </div>
  )
}
~~~
~~~~

~~~~text
~~~css stylesheet
/* Container sizing for a perfect 16:9 widescreen presentation slide */
.slide {
  color: #f5f5f7;
  padding: 40px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  font-family: 'Helvetica Neue', Arial, sans-serif;
  font-size: 30px;

  /* Typography rules optimized for visibility from a distance */
  h1 {
    font-size: 2.8em;
    color: #61dafb;
    margin-top: 0;
    margin-bottom: 20px;
    line-height: 1.2;
  }

  h2 {
    font-size: 2em;
    color: #a8dadc;
    margin-top: 0;
    margin-bottom: 15px;
  }

  p {
    font-size: 1.3em;
    line-height: 1.6;
    color: #e0e0e6;
    margin-bottom: 15px;
  }

  /* List styling specific to presentation bullet points */
  ul, ol {
    margin-left: 25px;
    margin-bottom: 20px;
  }

  li {
    font-size: 1.3em;
    line-height: 1.8;
    margin-bottom: 10px;
    color: #e0e0e6;
    list-style-type: none; /* Remove default bullets for custom styling */

    /* Highlighted list item for event-driven bullet reveal */
    &.highlight {
      color: red;
      font-weight: 700;
    }
  }

  /* Code block handling inside slides */
  pre {
    background-color: #2d2d34;
    padding: 15px;
    border-radius: 6px;
    width: 100%;
    box-sizing: border-box;
    overflow-x: auto;
  }

  code {
    font-family: 'Courier New', Courier, monospace;
    font-size: 1.1em;
    color: #ffb703;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 20px;

      th, td {
        border: 1px solid #444;
        padding: 10px;
        text-align: left;
      }
  }
}
~~~
~~~~

Theme knobs — change **values only**, never the structure:

| Knob | Selector | Default |
|---|---|---|
| Accent (h1) | `.slide h1 { color }` | `#61dafb` |
| Secondary (h2) | `.slide h2 { color }` | `#a8dadc` |
| Reveal highlight | `.slide li.highlight { color }` | `red` |
| Deck background | `.slide { background }` | transparent |
| Font | `.slide { font-family }` | Helvetica Neue |

## 5. Workflow

Prompts in `prompts/` are fill-in templates: replace every `{placeholder}`, then execute the prompt **in your own context**. `agents/` definitions run in a **separate session** (e.g. a fresh-context subagent).

1. **Outline** — fill `prompts/outline.md` → course outline. **Present the outline to the user and get confirmation** before continuing.
2. **Scenes** — for each outline section, fill `prompts/scene.md` → slide source + narration script (all languages).
3. **Assemble** — write `course.md`: §2 grammar, §3 rules, §4 blocks verbatim, root config line with the user's width/height/fps/voice.
   - **Basic**: standard bullet-reveal pattern (one scene, one Slide component, N script nodes per scene).
   - **With per-bullet media**: use `#### Beat` sub-scenes in `transitionSeries` for each bullet (see §2). Each beat is `layout:parallel` containing the image + script. Add `start:0.5` to each script node.
   - **Overlays**: add persistent logo/narrator as `- image isBackground:true` at the root level.
4. **Render** — `npx @lalalic/markcut render course.md`. On engine errors: fix and re-render, max 3 attempts per error, then ask the user.
5. **Review (quality gate)** — run `agents/reviewer.md` in a fresh separate session. Give it absolute paths to: `course.md`, the rendered MP4, this `TEMPLATE.md`, plus target duration and language(s). It returns `{verdict, findings[]}` and never edits anything.
6. **Fix loop** — on FAIL: fill `prompts/fix.md` with the findings, apply the edits yourself, go back to step 4. Max **3** review iterations, then escalate to the user with the open findings.

## 6. Quality gate — exit criteria

Done only when ALL hold:

- [ ] reviewer verdict = `PASS` (zero blocker/major findings)
- [ ] total duration within ±15% of target
- [ ] structure matches §2 (hook, title, 3–6 concepts, summary, thanks)
- [ ] no blank/black frames at scene boundaries; slides legible at target resolution
- [ ] STT transcript of rendered audio matches scripts (≥90% content match)
- [ ] each bullet has a narration beat — beat count = bullet count in every concept scene
- [ ] ≥80% of slides include a visual element beyond text-only bullets (chart, image, diagram, mermaid)
- [ ] overlays (logo, narrator) positioned without obstructing slide content
- [ ] no TTS audio plays during transitions (checked via `start:` offset on transitionSeries scripts)



## 7. Reference — worked example

Golden example: [`tests/fixtures/templates/courseware.md`](../../tests/fixtures/templates/courseware.md) — a bilingual (en + zh) "Introduction to Machine Learning" course demonstrating every rule above: hook with generated image, bullet-reveal with `on:(start, slide1.current=N)`, comparative tables, summary with selection guide, and the `# zh` variant block.
