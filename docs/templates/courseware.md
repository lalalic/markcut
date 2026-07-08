---
# Courseware Template — 课件模板
# Use when: educational lectures, online courses, training presentations, tutorial videos
# Structure: Intro Slide → Topic Slide → Topic Slide → ... → Summary Slide
# Each slide = 1 scene rendered via MarpSlide component
# Marp markdown (--- separates slides) drives both visual and narration

# Key decisions for the agent:
# 1. Write all slide content as a single Marp markdown string
# 2. Each slide becomes a scene with TTS narration derived from the slide content
# 3. Scene count = number of slides in the markdown (use countSlides() to determine)
# 4. Use transitionSeries between slides for smooth flow (fade at ~0.5s)
# 5. Slide visual is rendered by <MarpSlide markdown={md} slideIndex={N} />
# 6. Narration is independent — script each slide separately for TTS

# Required external packages/components:
#   - github:user/remotion-engine/src/components/MarpSlide.tsx — Marp markdown slide renderer
#   - @marp-team/marp-core — Marp markdown parser (loaded dynamically by MarpSlide)

# Tips:
# - Use Marp's extended syntax: --- for slide breaks, ## for headings, - for bullets
# - Tables, code blocks, math (LaTeX), and diagrams all work via Marp
# - Set markdown string in a ~~~js imports block or define inline
# - Keep each slide's content concise for video readability (3-5 bullets max)

tts:
  cli: 'edge-tts --voice "zh-CN-YunxiNeural" --rate "-5%" --text "{text}" --write-media "{output}"'
---
# video
width:1920 height:1080 fps:24 layout:transitionSeries transition:fade transitionTime:0.5

## TitleSlide
layout:parallel script:"Welcome to this course — let's begin with an overview."
duration:8
- component duration:8 jsx:"<MarpSlide markdown={markdown} slideIndex={0} />"

## Section1
layout:parallel script:"[Narration for section 1 — explain the key concepts]"
duration:12
- component duration:12 jsx:"<MarpSlide markdown={markdown} slideIndex={1} />"

## Section2
layout:parallel script:"[Narration for section 2 — dive deeper]"
duration:15
- component duration:15 jsx:"<MarpSlide markdown={markdown} slideIndex={2} />"

## Section3
layout:parallel script:"[Narration for section 3 — examples and applications]"
duration:12
- component duration:12 jsx:"<MarpSlide markdown={markdown} slideIndex={3} />"

## Summary
layout:parallel script:"In summary: [key takeaways]. Thank you for watching."
duration:10
- component duration:10 jsx:"<MarpSlide markdown={markdown} slideIndex={4} />"

~~~js imports
import { MarpSlide, countSlides } from "github:user/remotion-engine/src/components/MarpSlide.tsx"

// Full Marp markdown — each --- separates a slide
const markdown = `
# Course Title

Subtitle or instructor name

---

## Section 1

- Key concept A
- Key concept B
- Example: ...

---

## Section 2

- Deeper topic X
- Deeper topic Y
- Visual diagram reference

---

## Section 3

- Real-world application 1
- Real-world application 2
- Case study

---

## Summary

- Takeaway 1
- Takeaway 2
- Takeaway 3

**Thank you!**
`;
~~~
