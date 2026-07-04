---
width: 1920
height: 1080
fps: 24
---
# video
layout:series instruction:"Strict mode demo" metadata:"strict-test"
## SceneOne
layout:parallel script:"This is strict mode"
- image src:photo.jpg duration:3 fit:cover
- video src:clip.mp4 startFrom:0 endAt:2 volume:0.8
- audio src:bgm.mp3 duration:3 volume:0.5 foreground:true
- component duration:2 jsx:"<StatCounter value={42} />"
## SceneTwo
layout:transitionSeries transition:fade transitionTime:0.5
- image src:a.jpg duration:2
- image src:b.jpg duration:3
## SceneThree
layout:parallel
- effect animation:fadeInUp duration:2
  - image src:card.jpg duration:1.5
- map duration:3 travelMode:DRIVING waypoints:[40.7128,-74.006,"NYC";34.0522,-118.2437,"LA"] routeColor:"#4285F4"
- rhythm src:beat.mp3 spots:[0,1,2] volume:0.7
  - image src:f1.jpg
  - image src:f2.jpg
  - image src:f3.jpg

```js imports
import { StatCounter } from "npm:stat-counter"
```
