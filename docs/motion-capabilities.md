# Discover reusable motion capabilities

Choose a treatment from [`motion-capabilities.json`](./motion-capabilities.json), then author it in ordinary Markcut Markdown. The catalog records the source revision and license, input props, supported aspect ratios, render mode, example, provenance, and verification state. The example uses local inline JSX imports, so it renders through the existing Markcut pipeline without a plugin, paid service, or project-specific engine.

## Project handoff

The Video Director owns the story and selects a treatment by name. Record that choice in the scene's description/instruction and use the catalog's prop schema to pass the needed content. Markcut owns the scene order, duration, preview, and final render. Keep project-specific copy, images, and data in the project; this catalog only describes reusable motion behavior.

For a vertical deliverable, set `width:1080`, `height:1920`, and `fps:30` in the Markdown frontmatter. Keep titles and charts inside a centered safe area, test small text at phone size, and preview the assembled file before rendering. `examples/motion-capabilities-9x16.md` is a complete, asset-free 9:16 example. It includes three independent cinematic treatments (`CinematicPush`, `TiltedPanelGlide`, `LayeredCardReveal`) and three distinct motion graphics (`KineticCaption`, `BarChartReveal`, `MetricCountUp`).

The sample is visual-only. Its rendered audio stream is silent; add project narration or an audio stream when the story calls for sound.

```md
---
width: 1080
height: 1920
fps: 30
---
# video
layout:series

## Product reveal
- component duration:3 jsx:"<CinematicPush eyebrow='INTRO' title='A clear idea' tone='#64d9c6' />"
```

The example component implementations are defined in its `~~~js imports` fence. Reuse them by copying the inline function or moving it into a project-local module and importing that module through Markcut's existing import block. No new Markcut stream type or plugin registration is needed.

## Source and licensing notes

The Shotcraft entries are adapted from recipe ideas at the pinned source revision and are reimplemented as small Markcut components. The repository's Apache-2.0 license permits adaptation; this example copies no code, media, branding, or sound. HyperFrames is also Apache-2.0 at the pinned revision. Its kinetic-type and chart registry entries were discovery references only; no registry source or assets are copied. HyperFrames credits seven 3D catalog pieces that bundle or load GSAP under the separate GSAP Standard License; those pieces and GSAP are explicitly excluded. `srt-whiteboard-animation` is MIT-licensed, but is recorded as not integrated because using its workflow would bring a separate Python/OpenCV environment and source-art/annotation pipeline. These decisions and exact revisions are in the machine-readable catalog.

The optional whiteboard entry is not marked as a supported capability. If a project later chooses it, generate its MP4 separately and add that result as a normal Markcut `video` node or `include`; do not make Markcut own the Python workflow.

## Video Director documentation contribution

The canonical Video Director source is outside this Markcut checkout at `/Users/chengli/Workspace/neo/skills/video-director`. This checkout therefore includes a ready-to-apply section at [`contributions/video-director-capability-discovery.md`](./contributions/video-director-capability-discovery.md), with the owning file paths identified there.
