# video
width:1920 height:1080 fps:30 layout:series theme:${theme}

## Title
layout:parallel
- component componentName:LightLeak props:{intensity:0.5} isBackground:true duration:6
- effect animation:fadeInDown duration:2
  - component componentName:AnimatedHeadline props:{text:"${title}",size:"xl",glow:true,gradient:true} duration:4
- effect animation:fadeInUp duration:1.5 start:3
  - component componentName:TypewriterText props:{text:"${subtitle}",speed:40,size:"md"} duration:3

## Spotlight 1
layout:parallel
- component componentName:SpotlightReveal props:{spotlight:"${feature1}",description:"${feature1Desc}",icon:"${feature1Icon}"} duration:4

## Spotlight 2
layout:parallel
- component componentName:SpotlightReveal props:{spotlight:"${feature2}",description:"${feature2Desc}",icon:"${feature2Icon}"} duration:4

## Split
layout:parallel
- effect animation:zoomIn duration:1.5
  - component componentName:SplitScreen props:{left:{type:"image",src:"${leftImage}"},right:{type:"image",src:"${rightImage}"},caption:"${splitCaption}"} duration:4

## CTA
layout:parallel
- component componentName:ParticleField props:{count:60,speed:0.5} isBackground:true duration:5
- effect animation:pulse duration:1.5
  - component componentName:EndTag props:{text:"${cta}",glow:true} duration:3.5
