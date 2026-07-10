---
---
# video
width:1080 height:1920 fps:30 layout:series instruction:"Full feature demo video" metadata:"v2.0-feature-test" tts:"edge-tts --voice 'zh-CN-XiaoxiaoNeural' --text '{input}' --write-media '{output}'"
## OpeningHook
layout:parallel instruction:"Start with animated headline and BGM"
- script "Welcome to this demo video"
- component duration:3 jsx:"<AnimatedHeadline text='Welcome!' gradient='#667eea→#764ba2' />"
- audio src:bgm/intro.mp3 duration:3 volume:0.3 isBackground:true
## StatShowcase
layout:series
### Counter1
layout:parallel
- component duration:3 jsx:"<StatCounter value={100} label='Performance' />"
### Counter2
layout:parallel
- component duration:3 jsx:"<StatCounter value={99} label='Quality' suffix='%' />"
## MediaMontage
layout:transitionSeries transition:fade transitionTime:0.5
- script "Here are some highlights"
- image src:photos/highlight1.jpg duration:2 fit:cover
- video src:clips/moment1.mp4 duration:3 volume:0.8
- image src:photos/highlight2.jpg duration:2 fit:cover
- video src:clips/moment2.mp4 startFrom:0.5 endAt:4.5 volume:0.9
## AnimatedEffects
layout:parallel
- image src:cards/card1.png duration:1.5 fit:contain effects:[fadeInUp(2)]
- image src:cards/card2.png duration:1.5 fit:contain effects:[zoomIn(2,ease-out)]
- image src:cards/card3.png duration:1.5 fit:contain effects:[flipInX(2,,1)]
## InteractiveMap
layout:parallel
- script "Our journey across the continent"
- map duration:6 travelMode:DRIVING waypoints:[37.77,-122.41,"San Francisco";40.7128,-74.006,"New York City"] routeColor:"#FF6B6B" routeWeight:5 zoom:4 mapType:roadmap routeMarker:"🚗"
- audio src:bgm/map-music.mp3 duration:6 volume:0.25 isBackground:true
## BeatSync
layout:parallel
- rhythm src:audio/drop.mp3 spots:[0.0,0.6,1.2,1.8,2.4,3.0] volume:0.8
  - image src:flash/f1.jpg
  - image src:flash/f2.jpg
  - image src:flash/f3.jpg
  - image src:flash/f4.jpg
  - image src:flash/f5.jpg
  - image src:flash/f6.jpg
## Closing
layout:parallel
- script "Thanks for watching! Don't forget to subscribe"
- image src:photos/ending.jpg duration:4 fit:cover
- component duration:4 jsx:"<Logo variant='white' />"

```js imports
import { AnimatedHeadline } from "npm:@remotion-engine/headline"
import { StatCounter } from "npm:stat-counter@2.1.0"

export function Logo({ variant = 'white' }) {
  const color = variant === 'white' ? '#ffffff' : '#667eea';
  return <div style={{color, fontSize: 48, fontWeight: 'bold'}}>MyBrand</div>
}
```
