---
# Audiobook Template — 有声图书模板
# Use when: book narration, story reading, poem recitation, guided meditation
# Structure: Cover → Chapter 1 → Chapter 2 → ... → Closing
# Narration-driven: TTS audio sets the pace, visuals are ambient/illustrative

# Key decisions for the agent:
# 1. Narration is primary — visuals are supportive, not distracting
# 2. Use slow, ambient transitions between chapters (long fade)
# 3. Background visuals: generated atmospheric images that match the mood
# 4. Subtitles optional (root-level VTT from TTS STT pipeline)
# 5. BGM: soft ambient/classical music at very low volume throughout

# Required external packages/components:
#   - npm:book-cover — renders book cover with title, author, decorative border
#   - npm:ambient-background — slowly drifting parallax image (subtle motion)
#   - npm:page-turn — page-turn animation transition between chapters
#   - npm:progress-bar — reading progress indicator at bottom

# Missing capabilities to add:
#   - TTS with word-level timestamps for karaoke-style subtitle highlight
#   - Ambient animation: slow Ken Burns effect on still images
#   - Chapter marker overlay showing "Chapter X / Total"

tts:
  cli: 'edge-tts --voice "zh-CN-YunyangNeural" --rate "-10%" --text "{text}" --write-media "{output}"'
stt:
  cli: 'whisper "{input}" --model whisper-1 --language zh --output_format vtt --output_dir "{outputDir}"'
tti:
  cli: 'pi --model agnes-2.0-flash --print "generate image: {prompt}" --output "{output}"'
---
# video
width:1080 height:1920 fps:24 layout:series transition:fade transitionTime:3

## BookCover
layout:parallel script:"The Art of Programming — by Grace Hopper. Chapter 1: Logic and Flow."
duration:8
- image src:auto prompt:"elegant book cover illustration for The Art of Programming, thoughtful and inspiring, warm lighting" duration:8 fit:cover
- component duration:8 jsx:"<BookCover title='The Art of Programming' author='Grace Hopper' chapter='1' />"
- audio src:bgm/ambient-piano.mp3 duration:8 volume:0.15 isBackground:true loop:2

## Chapter1
layout:parallel script:"Chapter 1: Logic and Flow. Programming begins with a single step: understanding the flow of data. Every program is a story — a sequence of instructions that transform input to output. The beauty lies in its simplicity: if this, then that. Boolean logic, conditional branches, and loops form the grammar of this language. Once you grasp the flow, you can build anything."
duration:30
- image src:auto prompt:"atmospheric illustration for a programmer writing code at sunrise, soft focus, thoughtful and inspiring" duration:30 fit:cover
- component duration:30 jsx:"<AmbientBackground src='[generated-image-path]' intensity={0.02} />"
- component duration:30 jsx:"<ProgressBar current={1} total={10} />"

## Chapter2
layout:parallel script:"Chapter 2: Data Structures. Information wants to be organized. Arrays hold sequences, trees model hierarchies, graphs connect relationships. Choosing the right structure is like picking the right tool for a job — the difference between elegant efficiency and painful complexity. Remember: your data shapes your algorithm."
duration:25
- image src:auto prompt:"atmospheric illustration for flowchart diagrams connecting like constellations, thoughtful and inspiring" duration:25 fit:cover
- component duration:25 jsx:"<AmbientBackground src='[generated-image-path]' intensity={0.02} />"
- component duration:25 jsx:"<ProgressBar current={2} total={10} />"

## Chapter3
layout:parallel script:"Chapter 3: Algorithms. At their core, algorithms are recipes for solving problems. Sort, search, transform, analyze. The best algorithms are those that feel inevitable — once you see them, you wonder how you ever thought differently. Practice recognizing patterns, and algorithms become second nature."
duration:20
- image src:auto prompt:"atmospheric illustration for abstract visualization of algorithms as dancing shapes, thoughtful and inspiring" duration:20 fit:cover
- component duration:20 jsx:"<AmbientBackground src='[generated-image-path]' intensity={0.02} />"
- component duration:20 jsx:"<ProgressBar current={3} total={10} />"

## Closing
layout:parallel script:"That was The Art of Programming by Grace Hopper. Thank you for listening. Subscribe for more audiobooks."
duration:8
- image src:auto prompt:"elegant closing card, dark background with subtle golden accents" duration:8 fit:cover
- component duration:8 jsx:"<BookCover title='The Art of Programming' author='Grace Hopper' variant='closing' />"

~~~js imports
import { BookCover } from "npm:book-cover"
import { AmbientBackground } from "npm:ambient-background"
import { ProgressBar } from "npm:progress-bar"
~~~
