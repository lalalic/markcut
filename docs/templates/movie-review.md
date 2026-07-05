---
# Movie Review Template — 影视讲解模板
# Use when: movie analysis, film critique, scene breakdown, director commentary
# Structure: Movie Title → Context → Key Scene 1 → Key Scene 2 → ... → Verdict
# Mix original footage (clips) with overlaid commentary and text annotations

# Key decisions for the agent:
# 1. Title card with movie poster and metadata (year, director, rating)
# 2. Use freeze-frame + annotation to highlight key moments
# 3. Voiceover narration drives the pacing — match visuals to TTS duration
# 4. Use picture-in-picture or split-screen for comparisons
# 5. Rating/verdict scene with star rating component

# Required external packages/components:
#   - npm:star-rating — renders star/dot rating display with animation
#   - npm:text-annotation — draws text labels, arrows, circles on top of video
#   - npm:split-screen — dual video/image side by side comparison layout
#   - npm:timeline-marker — visual timeline bar showing chapter markers
#   - npm:cinematic-text — movie-title style text with letterbox

# Missing capabilities to add:
#   - Frame capture: extract a still frame from a video clip at a specific timestamp
#   - Video trimming UI: precise control over clip startFrom/endAt via preview
#   - Stamp annotation: draw circular highlight + arrow on a video frame

tts:
  cli: 'edge-tts --voice "zh-CN-YunyangNeural" --text "{text}" --write-media "{output}"'
tti:
  cli: 'pi --model agnes-2.0-flash --print "generate image: {prompt}" --output "{output}"'
---
# video
width:1080 height:1920 fps:24 layout:series

## TitleCard
layout:parallel script:"Today we're diving into [Movie Title] — directed by [Director], released [Year]."
duration:5
- image src:auto prompt:"cinematic movie poster for [Movie Title], dramatic lighting, film grain" duration:5 fit:cover
- component duration:5 jsx:"<CinematicText title='[Movie Title]' subtitle='[Director] · [Year]' />"

## Context
layout:parallel script:"[Movie Title] tells the story of [brief synopsis — 2 sentences]."
duration:8
- image src:auto prompt:"dramatic establishing shot from [Movie Title], atmospheric" duration:8 fit:cover
- component duration:8 jsx:"<TextOverlay text='Background' position='bottom' />"

## KeyScene1
layout:parallel script:"In this pivotal scene, [describe what happens and why it matters]."
duration:12
- video src:[clip1-path.mp4] startFrom:0 endAt:12 volume:0.6
- component duration:12 jsx:"<TextAnnotation text='Notice how [detail]' position='top-right' />"

## KeyScene2
layout:parallel script:"This shot is remarkable because [cinematography/acting/symbolism analysis]."
duration:10
- video src:[clip2-path.mp4] startFrom:0 endAt:10 volume:0.5
- component duration:10 jsx:"<TextAnnotation text='[Cinematography note]' position='bottom-left' />"

## KeyScene3
layout:parallel script:"Compare this with [earlier scene] — notice the visual parallel."
duration:8
- component duration:8 jsx:"<SplitScreen left='[frame1-path]' right='[frame2-path]' label1='Earlier' label2='This scene' />"

## Verdict
layout:parallel script:"Overall, [Movie Title] is a [adjective] film that [evaluation]. I'd give it [rating]/10."
duration:8
- image src:auto prompt:"cinematic end card, dark moody background with film grain" duration:8 fit:cover
- component duration:8 jsx:"<StarRating rating={[rating]} max={10} />"
- component duration:8 jsx:"<TextOverlay text='Final Verdict' position='center' />"

~~~js imports
import { CinematicText } from "npm:cinematic-text"
import { TextAnnotation } from "npm:text-annotation"
import { SplitScreen } from "npm:split-screen"
import { StarRating } from "npm:star-rating"

export function TextOverlay({ text, position }) {
  const posStyle = position === 'bottom' ? {bottom:40} : position === 'top' ? {top:40} : {top:'50%'}
  return (
    <div style={{position:'absolute', ...posStyle, left:0, right:0, textAlign:'center', zIndex:10}}>
      <span style={{background:'rgba(0,0,0,0.7)', color:'#fff', padding:'8px 20px', borderRadius:8, fontSize:20}}>{text}</span>
    </div>
  )
}
~~~
