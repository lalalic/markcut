---
# Story Video Template — 故事视频模板
# Use when: short stories, children's tales, narrative fiction, animated stories
# Structure: Title → Scene 1 → Scene 2 → ... → Ending
# Each scene = 1 story beat with matching illustration + narration

# Key decisions for the agent:
# 1. Each story beat becomes a scene with a generated illustration
# 2. Narration drives duration — resolve TTS for each scene first
# 3. Use effect animations for scene transitions (fade between illustrations)
# 4. Background audio: ambient SFX that matches the scene mood
# 5. Scene illustrations should be consistent in style (use same TTI prompt prefix)

# Required external packages/components:
#   - npm:story-title — animated story title with decorative elements
#   - npm:speech-bubble — comic-style speech bubble for character dialogue
#   - npm:particle-effect — falling leaves/snow/stars for atmosphere
#   - npm:character-display — renders a character portrait with name label

# Missing capabilities to add:
#   - Character consistency: same character across multiple generated images
#   - Scene-to-scene visual continuity: reference previous image in prompt
#   - Sound effects library: pre-built SFX for common story moments (door, footsteps, etc.)

tts:
  cli: 'edge-tts --voice "zh-CN-XiaoxiaoNeural" --rate "-5%" --text "{text}" --write-media "{output}"'
tti:
  cli: 'pi --model agnes-2.0-flash --print "generate image: {prompt}" --output "{output}"'
---
# video
width:1080 height:1920 fps:24 layout:transitionSeries transition:fade transitionTime:1.5

## StoryTitle
layout:parallel script:"[Story Title] — A story by [Author/Narrator]"
duration:6
- image src:auto prompt:"storybook illustration for [Story Title], whimsical style, warm colors" duration:6 fit:cover
- component duration:6 jsx:"<StoryTitle title='[Story Title]' author='[Author]' variant='opening' />"

## Scene1
layout:parallel script:"[Scene 1 narration: introduce setting and main character]"
duration:12
- image src:auto prompt:"story illustration: [describe scene 1 setting and characters], consistent whimsical style" duration:12 fit:cover
- component duration:12 jsx:"<SpeechBubble text='[Character dialogue]' position='top-right' />"
- audio src:sfx/forest-ambient.mp3 duration:12 volume:0.2 isBackground:true

## Scene2
layout:parallel script:"[Scene 2 narration: the conflict or challenge begins]"
duration:10
- image src:auto prompt:"story illustration: [describe scene 2 — the conflict moment], dramatic lighting, same style" duration:10 fit:cover
- audio src:sfx/suspense.mp3 duration:10 volume:0.15 isBackground:true

## Scene3
layout:parallel script:"[Scene 3 narration: rising action]"
duration:15
- image src:auto prompt:"story illustration: [describe scene 3 action], dynamic composition, same art style" duration:15 fit:cover

## Scene4
layout:parallel script:"[Scene 4 narration: climax]"
duration:12
- image src:auto prompt:"story illustration: [describe the climax moment], dramatic, same art style" duration:12 fit:cover
- audio src:sfx/dramatic-reveal.mp3 duration:12 volume:0.2 isBackground:true

## Ending
layout:parallel script:"[Closing narration: resolution and moral/lesson]"
duration:10
- image src:auto prompt:"story illustration: peaceful resolution scene, soft lighting, same art style, birds and flowers" duration:10 fit:cover
- component duration:10 jsx:"<StoryTitle title='The End' variant='closing' />"

~~~js imports
import { StoryTitle } from "npm:story-title"
import { SpeechBubble } from "npm:speech-bubble"
import { ParticleEffect } from "npm:particle-effect"
~~~
