# video
width:1080 height:1920 fps:30 layout:series theme:minimal

## Hook
layout:parallel
- component componentName:GradientBackground props:{type:"radial",animated:false,noise:false,colors:["#f8f9fa","#e9ecef"]} isBackground:true duration:12
- effect animation:fadeInUp duration:1.5
  - component componentName:TypewriterText props:{text:"${hook}",speed:60,size:"md",color:"textMuted"} duration:4

## Swipe
layout:parallel
- component componentName:ComparisonSlider props:{before:"${before}",after:"${after}",beforeLabel:"Then",afterLabel:"Now"} duration:4

## Metrics
layout:series
- component componentName:ProgressBar props:{value:${metric1},max:100,label:"${metric1Label}"} duration:2
- component componentName:ProgressBar props:{value:${metric2},max:100,label:"${metric2Label}"} duration:2
- component componentName:ProgressBar props:{value:${metric3},max:100,label:"${metric3Label}"} duration:2

## Punchline
layout:parallel
- effect animation:bounceIn duration:2
  - component componentName:AnimatedHeadline props:{text:"${punchline}",size:"lg",gradient:false} duration:2
