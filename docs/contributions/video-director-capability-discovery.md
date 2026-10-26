# Ready-to-apply Video Director documentation contribution

**Canonical owner:** `/Users/chengli/Workspace/neo/skills/video-director/SKILL.md`
**Example owner:** `/Users/chengli/Workspace/neo/skills/video-director/examples/motion-capability-9x16.md`
**Prepared in:** Markcut `docs/contributions/video-director-capability-discovery.md`

Add the following section to the canonical `SKILL.md` after its responsibility-boundary section:

```md
## Reusable motion capabilities

The Video Director chooses a visual treatment based on story intent and audience. When the project uses Markcut, consult its project-agnostic catalog at `docs/motion-capabilities.json` before specifying a custom treatment. Select by catalog name, check its props and supported aspect ratio, and put the chosen name plus content intent in the scene description or instruction. The catalog is a discovery aid; it does not change the canonical `video.md` format or create a second timeline.

For vertical authoring, target 1080x1920 at 30 fps unless the destination requires another size. Favor one clear subject, large readable type, and safe margins near the top and bottom. Preview the assembled Markcut Markdown at phone scale before rendering. The Video Director chooses the treatment and pacing; Markcut owns the timeline, preview, and render.
```

Add `examples/motion-capability-9x16.md` with this authoring pattern (the capability name is illustrative; resolve it against the project's catalog):

```md
---
width: 1080
height: 1920
fps: 30
---
# video
layout:series

## Product reveal
description:"CinematicPush — start wide and settle on the product promise. Keep the headline in the central safe area."
- component duration:3 jsx:"<CinematicPush eyebrow='INTRO' title='A clear idea' tone='#64d9c6' />"
```
