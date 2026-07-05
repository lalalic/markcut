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
layout:parallel script:"[Book Title] — by [Author]. Chapter 1: [Chapter Title]."
duration:8
- image src:auto prompt:"elegant book cover illustration for [Book Title], [mood], warm lighting" duration:8 fit:cover
- component duration:8 jsx:"<BookCover title='[Book Title]' author='[Author]' chapter='1' />"
- audio src:bgm/ambient-piano.mp3 duration:8 volume:0.15 isBackground:true loop:2

## Chapter1
layout:parallel script:"[Full chapter 1 text — the agent fills this with the actual narrative content]"
duration:30
- image src:auto prompt:"atmospheric illustration for [Chapter 1 scene description], soft focus, [mood]" duration:30 fit:cover
- component duration:30 jsx:"<AmbientBackground src='[generated-image-path]' intensity={0.02} />"
- component duration:30 jsx:"<ProgressBar current={1} total={[totalChapters]} />"

## Chapter2
layout:parallel script:"[Full chapter 2 text]"
duration:25
- image src:auto prompt:"atmospheric illustration for [Chapter 2 scene description], [mood]" duration:25 fit:cover
- component duration:25 jsx:"<AmbientBackground src='[generated-image-path]' intensity={0.02} />"
- component duration:25 jsx:"<ProgressBar current={2} total={[totalChapters]} />"

## Chapter3
layout:parallel script:"[Full chapter 3 text]"
duration:20
- image src:auto prompt:"atmospheric illustration for [Chapter 3 scene description], [mood]" duration:20 fit:cover
- component duration:20 jsx:"<AmbientBackground src='[generated-image-path]' intensity={0.02} />"
- component duration:20 jsx:"<ProgressBar current={3} total={[totalChapters]} />"

## Closing
layout:parallel script:"That was [Book Title] by [Author]. Thank you for listening. Subscribe for more audiobooks."
duration:8
- image src:auto prompt:"elegant closing card, dark background with subtle golden accents" duration:8 fit:cover
- component duration:8 jsx:"<BookCover title='[Book Title]' author='[Author]' variant='closing' />"

~~~js imports
import { BookCover } from "npm:book-cover"
import { AmbientBackground } from "npm:ambient-background"
import { ProgressBar } from "npm:progress-bar"
~~~
