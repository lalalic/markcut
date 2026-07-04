# video
width:640 height:480 fps:30 layout:series
## Chapter1
layout:series instruction:"Opening chapter" title:"The Beginning"
### Shot1
layout:parallel
- image src:dawn.jpg duration:2
- audio src:ambient.mp3 duration:2 volume:0.3
### Shot2
layout:parallel
- image src:road.jpg duration:3
- component duration:2 jsx:"<Narration text='A journey begins' />"
## Chapter2
layout:series
### Shot3
layout:parallel
- image src:mountain.jpg duration:2
### Shot4
layout:transitionSeries transition:fade transitionTime:0.3
- image src:peak1.jpg duration:2
- image src:peak2.jpg duration:2
- image src:peak3.jpg duration:2
## Chapter3
layout:parallel
- image src:sunset.jpg duration:3
