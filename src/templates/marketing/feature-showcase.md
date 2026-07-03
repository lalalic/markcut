# video
width:1920 height:1080 fps:30 layout:series theme:${theme}

## Intro
layout:parallel
- component componentName:GradientBackground props:{type:"radial",animated:true,noise:true} isBackground:true duration:5
- component componentName:AnimatedHeadline props:{text:"${headline}",subtext:"${subline}",gradient:true} duration:5

## Feature 1
layout:parallel
- component componentName:GradientBackground props:{type:"linear",animated:true} isBackground:true duration:8
- component componentName:DeviceMockup props:{type:"browser",src:"${screenshot1}",title:"${feature1Title}"} duration:8

## Feature 2
layout:parallel
- component componentName:GradientBackground props:{type:"linear",animated:true,colors:["#0f0f23","#1a1a3e"]} isBackground:true duration:8
- component componentName:DeviceMockup props:{type:"phone",src:"${screenshot2}",title:"${feature2Title}"} duration:8

## Feature 3
layout:parallel
- component componentName:GradientBackground props:{type:"linear",animated:true,colors:["#230f0f","#3e1a1a"]} isBackground:true duration:8
- component componentName:DeviceMockup props:{type:"browser",src:"${screenshot3}",title:"${feature3Title}"} duration:8

## CTA
layout:parallel
- component componentName:ParticleField props:{count:50,speed:0.4} isBackground:true duration:5
- effect animation:bounceIn duration:1.5
  - component componentName:EndTag props:{text:"${cta}"} duration:3.5
