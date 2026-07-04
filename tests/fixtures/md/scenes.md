# video
width:640 height:480 fps:30 layout:series
## Hook
layout:parallel instruction:"Grab attention fast"
- image src:opener.jpg duration:2 fit:cover
- component duration:2 jsx:"<BigText text='Wow!' />"
## Journey
layout:transitionSeries transition:fade transitionTime:0.5 script:"Follow along on this adventure"
- image src:scene1.jpg duration:2
- image src:scene2.jpg duration:2
- image src:scene3.jpg duration:3
## WrapUp
layout:parallel script:"Thanks for watching"
- image src:final.jpg duration:3 fit:cover
