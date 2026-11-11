# Shotcraft recipe experiments in Markcut

A **12.65-second, 720 × 1280, 30-fps vertical demo** that tests three
video-shotcraft animation recipes as **native Markcut component scenes**.
It does not splice pre-rendered Shotcraft gallery movies.

## Examples

| Scene | Frames | Shotcraft card + implementation | What to look for |
| --- | ---: | --- | --- |
| PaperTitle | 55 | typography/paper-title-card → demos/typography/paper-title-card/PaperTitleCard.tsx | Staggered word-by-word letterpress (4f offset, 9f per word, 1.28× scale and 7px blur), 18f underline, end fade |
| Multiplane | 165 | camera/depth-layer-moves → demos/camera/depth-layer-moves/MultiplaneReal.tsx | Three layers at 0.35×, 0.7× and 1.4× travel speed, fixed heading, 22f final-card lift |
| FreezeAnnotate | 158 | rhythm/speed-ramp-freeze → demos/rhythm/speed-ramp-freeze/FreezeAnnotateReal.tsx | Moving shot strip; abrupt 70f freeze; 3f shutter flash, 10f hand-drawn circle, then eased resume |

Recipe files live at:
~/.agents/skills/video-shotcraft/references/shots/{typography,camera,rhythm}/.
Exact gallery keys (from gallery/api/library.json) are
paper-title-card, multiplane, and freeze-annotate.

These are **adaptations** of the recipe motion principles for a 9:16 Vlog;
they are *not* pixel-identical reproductions. Source scenes use built-in
drawn scenery, not imported footage or the private owner's media. The demo
has no narration/BGM/SFX so the movement is easier to isolate. A real Vlog
would substitute Visioner-selected stills/clips and synchronize SFX to
the rendered frames.

## Run

From Markcut's repository root:

~~~sh
node bin/markcut verify examples/shotcraft-recipes/video.md
node bin/markcut preview examples/shotcraft-recipes/video.md
node bin/markcut render examples/shotcraft-recipes/video.md \
  --output out/shotcraft-recipe-demo.mp4
ffprobe -v error -show_entries stream=width,height,nb_frames \
  -show_entries format=duration -of default=noprint_wrappers=1 \
  out/shotcraft-recipe-demo.mp4
~~~

The Markdown's JS imports block contains all three React/Remotion
components; Markcut resolves their imports and exposes them as JSX scene
nodes. Each scene can be used independently by deleting the other scenes
while keeping the imports block.

## Preview in ChatGPT / Neo Mobile

Preview showcases the already-rendered MP4 using a separate Markcut
source, **showcase.md**, so the same clip plays on mobile without rebuilding
React components in the hosted player.

The regular desktop CLI renderer supports the custom JS imports used in
video.md. The current standalone Neo-hosted preview compiler does **not**
publish its JS imports registry; previewing video.md directly there can
produce missing JSX. Until that separate hosted capability is implemented,
use showcase.md for owner-facing playback, and use video.md to edit/re-render
the original animation.

## What this experiment establishes

1. A Vlog Editor can choose a Shotcraft **shot recipe** and express it
   as an ordinary Markcut component within video.md.
2. Effects driven by useCurrentFrame render deterministically in
   Markcut via its shared Remotion runtime; not every Shotcraft recipe
   needs a new Markcut engine primitive.
3. Shotcraft is a *motion vocabulary*. The Director should decide
   **why** to use it; the Editor should select and adapt the recipe to
   footage/story and verify playback. Not every shot should be animated.

This example also exercises a Markcut CLI correction: custom component
bundles must be copied into the actual Remotion publicDir and referenced
by a *relative* import path. A previously absolute-path import produced
a nominally successful MP4 with 404 component-load errors.
