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
layout:parallel script:"The Little Star — A story by Mother Nature"
duration:6
- image src:auto prompt:"storybook illustration for The Little Star, whimsical style, warm colors" duration:6 fit:cover
- component duration:6 jsx:"<StoryTitle title='The Little Star' author='[Author]' variant='opening' />"

## Scene1
layout:parallel script:"Once upon a time, in a sky full of shining stars, there was one very special little star named Sparkle. She was the smallest star in the galaxy, but she had the biggest dreams."
duration:12
- image src:auto prompt:"story illustration: a tiny star waking up in the vast night sky, surrounded by twinkling friends, consistent whimsical style" duration:12 fit:cover
- component duration:12 jsx:"<SpeechBubble text='I want to shine the brightest!' position='top-right' />"
- audio src:sfx/forest-ambient.mp3 duration:12 volume:0.2 isBackground:true

## Scene2
layout:parallel script:"But every time Sparkle tried to shine brighter, she flickered and dimmed. The bigger stars twinkled above her, and she felt very small indeed."
duration:10
- image src:auto prompt:"story illustration: the little star trying desperately to shine but flickering, surrounded by brighter stars, dramatic lighting, same style" duration:10 fit:cover
- audio src:sfx/suspense.mp3 duration:10 volume:0.15 isBackground:true

## Scene3
layout:parallel script:"A wise old moon saw Sparkle struggling. 'Dear star,' he said, 'shining isn't about being the brightest. It's about being yourself.'"
duration:15
- image src:auto prompt:"story illustration: the little star talking to a wise crescent moon, starting to glow softly, dynamic composition, same art style" duration:15 fit:cover

## Scene4
layout:parallel script:"Sparkle realized the moon was right. She stopped trying to be like the others and just let her own light shine. And at that moment, she glowed more beautifully than ever before."
duration:12
- image src:auto prompt:"story illustration: the little star finally glowing with confidence, lighting up a small corner of the sky, dramatic, same art style" duration:12 fit:cover
- audio src:sfx/dramatic-reveal.mp3 duration:12 volume:0.2 isBackground:true

## Ending
layout:parallel script:"From that night on, Sparkle never compared herself to others. She understood that every star has its own light — and that's what makes the night sky so beautiful."
duration:10
- image src:auto prompt:"story illustration: peaceful resolution scene, soft lighting, same art style, birds and flowers" duration:10 fit:cover
- component duration:10 jsx:"<StoryTitle title='The End' variant='closing' />"

~~~js imports
import { StoryTitle } from "npm:story-title"
import { SpeechBubble } from "npm:speech-bubble"
import { ParticleEffect } from "npm:particle-effect"
~~~
