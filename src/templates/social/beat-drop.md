# video
width:1080 height:1920 fps:30 layout:series theme:neon

## Beat Drop
layout:parallel
- component componentName:GradientBackground props:{type:"radial",animated:true} isBackground:true duration:16
- component componentName:ParticleField props:{count:60,speed:0.6,mode:"burst"} isBackground:true duration:16
- rhythm src:${beatAudio} spots:[0,4,8,12,16]
  - component componentName:AnimatedHeadline props:{text:"${feature1}",size:"md"} duration:4
  - component componentName:AnimatedHeadline props:{text:"${feature2}",size:"md"} duration:4
  - component componentName:AnimatedHeadline props:{text:"${feature3}",size:"md"} duration:4
  - component componentName:AnimatedHeadline props:{text:"${feature4}",size:"md"} duration:4
- effect animation:heartBeat duration:2 start:12
  - component componentName:StatCounter props:{value:${statValue},suffix:"${statSuffix}",label:"${statLabel}"} duration:2.5
- effect animation:rubberBand duration:1.5 start:14.5
  - component componentName:EndTag props:{text:"${cta}"} duration:1.5
