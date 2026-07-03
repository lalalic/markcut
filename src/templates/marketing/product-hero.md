# video
width:1920 height:1080 fps:30 layout:series theme:${theme}

## Hero
layout:parallel
- component componentName:GradientBackground props:{type:"radial",animated:true,noise:true} isBackground:true duration:6
- component componentName:ParticleField props:{count:40,speed:0.3} isBackground:true duration:6
- component componentName:AnimatedHeadline props:{text:"${headline}",subtext:"${subline}",gradient:true,glow:true} duration:6

## Demo
layout:parallel
- component componentName:GradientBackground props:{type:"linear",animated:true} isBackground:true duration:8
- component componentName:DeviceMockup props:{type:"browser",src:"${screenshot}",title:"${appTitle}"} duration:8

## Stats
layout:parallel
- component componentName:ParticleField props:{count:30,speed:0.2} isBackground:true duration:5
- component componentName:StatCounter props:{value:${stat},suffix:"${statSuffix}",label:"${statLabel}"} duration:5

## CTA
layout:parallel
- component componentName:GradientBackground props:{type:"radial",animated:true} isBackground:true duration:4
- effect animation:bounceIn duration:1.5
  - component componentName:EndTag props:{text:"${cta}"} duration:3
