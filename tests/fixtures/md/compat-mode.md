# video
width:640 height:480 fps:30 layout:series
## Hook
layout:parallel instruction:"Parallel layout" script:"Narration text here"
- image src:cover.jpg duration:2
- video src:clip.mp4 startFrom:1 endAt:4
- audio src:bgm.mp3 duration:4 volume:0.5
## Journey
layout:transitionSeries transition:fade transitionTime:0.3 script:"Travel through time"
- image src:a.jpg duration:2
- image src:b.jpg duration:2
- image src:c.jpg duration:2
## End
script:"Thanks for watching" layout:parallel
- image src:final.jpg duration:3
