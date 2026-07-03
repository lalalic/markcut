# video
width:1920 height:1080 fps:30 layout:series theme:${theme}

## Intro
layout:parallel
- component componentName:GradientBackground props:{type:"radial",animated:true} isBackground:true duration:3
- component componentName:AnimatedHeadline props:{text:"${title}",subtext:"${subtitle}",gradient:true} duration:3

## Walkthrough
layout:transitionSeries transition:fade transitionTime:0.3
- component componentName:DeviceMockup props:{type:"browser",src:"${screenshot1}",title:"${step1Title}"} duration:6
- component componentName:DeviceMockup props:{type:"browser",src:"${screenshot2}",title:"${step2Title}"} duration:6
- component componentName:DeviceMockup props:{type:"browser",src:"${screenshot3}",title:"${step3Title}"} duration:6
- component componentName:CursorFlyover props:{src:"${screenshot4}",clicks:[{x:200,y:300,label:"Click here"}],title:"${step4Title}"} duration:6

## Outro
layout:parallel
- component componentName:GradientBackground props:{type:"radial",animated:true} isBackground:true duration:5
- effect animation:bounceIn duration:1.5
  - component componentName:EndTag props:{text:"${cta}"} duration:3.5
