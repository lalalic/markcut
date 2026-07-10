# video
width:640 height:480 fps:30 layout:series
## Fades
layout:parallel
- image src:card1.jpg duration:2 effects:[fadeIn(3)]
- image src:card2.jpg duration:2 effects:[fadeOut(3)]
## Slides
layout:parallel
- image src:card3.jpg duration:2 effects:[slideInLeft(3)]
- image src:card4.jpg duration:2 effects:[slideInRight(3)]
## Attention
layout:parallel
- image src:card5.jpg duration:2 effects:[bounceIn(,ease-out,2)]
- image src:card6.jpg duration:2 effects:[pulse(,ease-in-out)]
## CustomKeyframes
layout:parallel
- image src:card7.jpg duration:2 effects:[{"animation":"custom","duration":3,"customKeyframes":{"0":{"opacity":"0","transform":"scale(0.5)"},"50":{"opacity":"0.5","transform":"scale(1.2)"},"100":{"opacity":"1","transform":"scale(1)"}}}]
