# video
width:1080 height:1080 fps:30 layout:series theme:${theme}
transition:fade transitionTime:0.25

## Card
layout:parallel
- effect animation:fadeIn animationTimingFunction:ease-out
  - component componentName:GradientBackground props:{type:"linear",animated:false,noise:true} isBackground:true duration:8
  - component componentName:LightLeak props:{intensity:0.3} isBackground:true duration:8
  - component componentName:TypewriterText props:{text:"${accent}",speed:80,size:"sm",color:"#888"} duration:8
- component componentName:TypewriterText props:{text:"${quote}",speed:22,size:"xl",quote:true} duration:7 start:0.5
  - component componentName:TypewriterText props:{text:"${author}",speed:40,size:"md",color:"#ccc"} duration:6 start:1.5
  - component componentName:TypewriterText props:{text:"${authorTitle}",speed:60,size:"sm",color:"#666"} duration:5 start:1.5
