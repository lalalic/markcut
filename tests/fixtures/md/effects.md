# video
width:640 height:480 fps:30 layout:series
## Fades
layout:parallel
- effect animation:fadeIn duration:3
  - image src:card1.jpg duration:2
- effect animation:fadeOut duration:3
  - image src:card2.jpg duration:2
## Slides
layout:parallel
- effect animation:slideInLeft duration:3
  - image src:card3.jpg duration:2
- effect animation:slideInRight duration:3
  - image src:card4.jpg duration:2
## Attention
layout:parallel
- effect animation:bounceIn animationTimingFunction:ease-out animationIterationCount:2 duration:3
  - image src:card5.jpg duration:2
- effect animation:pulse animationTimingFunction:ease-in-out duration:3
  - image src:card6.jpg duration:2
## CustomKeyframes
layout:parallel
- effect animation:custom customKeyframes:{"0":{"opacity":"0","transform":"scale(0.5)"},"50":{"opacity":"0.5","transform":"scale(1.2)"},"100":{"opacity":"1","transform":"scale(1)"}} duration:3
  - image src:card7.jpg duration:2
