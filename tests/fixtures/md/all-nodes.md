# video
width:640 height:480 fps:30 layout:series instruction:"Full node type demo" metadata:"all-nodes"
## Media
layout:parallel
- image src:photo.jpg duration:3 fit:cover
- video src:movie.mp4 startFrom:0.5 endAt:3.5 volume:0.9 playbackRate:1.2
- audio src:bgm.mp3 duration:4 volume:0.5 foreground:true
## Components
layout:parallel
- component duration:3 jsx:"<AnimatedHeadline text='Hello World' gradient />"
- component duration:2 jsx:"<div style={{color:'red'}}>Inline</div>"
## Effects
layout:parallel
- image src:card.jpg duration:2 fit:cover effects:[fadeIn(3)]
- image src:badge.png duration:1 effects:[bounceIn(,ease-out,2)]
## Rhythm
layout:parallel
- rhythm src:beat.mp3 spots:[0.5,1.2,1.9,2.8] volume:0.8
  - image src:flash1.jpg
  - image src:flash2.jpg
  - image src:flash3.jpg
  - image src:flash4.jpg
## Map
layout:parallel
- map duration:4 travelMode:DRIVING waypoints:[37.77,-122.41,"SF";34.05,-118.24,"LA";36.16,-115.15,"LV"]
## Include
layout:parallel
- include src:./child.json duration:3
