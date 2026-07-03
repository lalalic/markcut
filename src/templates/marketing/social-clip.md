# video
width:1080 height:1920 fps:30 layout:series theme:${theme}

## Hook
layout:parallel
- component componentName:GradientBackground props:{type:"radial",animated:true,noise:true} isBackground:true duration:15
- effect animation:glitchReveal duration:2
  - component componentName:GlitchReveal props:{text:"${hook}",size:"lg",glitch:true} duration:2

## Demo
layout:parallel
- component componentName:GradientBackground props:{type:"linear",animated:true} isBackground:true duration:6
- component componentName:DeviceMockup props:{type:"phone",src:"${screenshot}",title:"${appTitle}"} duration:6

## Stat
layout:parallel
- component componentName:ParticleField props:{count:50,speed:0.5} isBackground:true duration:3
- component componentName:StatCounter props:{value:${stat},suffix:"${statSuffix}",label:"${statLabel}"} duration:3

## CTA
layout:parallel
- effect animation:bounceIn duration:1.5
  - component componentName:EndTag props:{text:"${cta}"} duration:3
