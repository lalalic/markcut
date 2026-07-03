# video
width:1080 height:1920 fps:30 layout:series theme:${theme}

## Card
layout:parallel
- component componentName:GradientBackground props:{type:"radial",animated:true,noise:true} isBackground:true duration:10
- component componentName:ParticleField props:{count:60,speed:0.4,size:3} isBackground:true duration:10
- effect animation:fadeInDown
  - component componentName:TypewriterText props:{text:"${teaser}",speed:60,size:"md",color:"textMuted"} duration:6

## Stat
layout:parallel
- effect animation:zoomIn
  - component componentName:StatCounter props:{value:${statValue},prefix:"${statPrefix}",suffix:"${statSuffix}",label:"${statLabel}"} duration:3
- effect animation:fadeInUp duration:2 start:3
  - component componentName:TypewriterText props:{text:"${callout}",speed:30,size:"lg",color:"primary"} duration:4
