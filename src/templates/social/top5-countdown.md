# video
width:1080 height:1920 fps:30 layout:series theme:${theme}

## Hook
layout:parallel
- component componentName:GradientBackground props:{type:"radial",animated:true,noise:true} isBackground:true duration:28
- component componentName:ParticleField props:{count:40,speed:0.3} isBackground:true duration:28
- effect animation:fadeInDown duration:2
  - component componentName:GlitchReveal props:{text:"TOP 5",size:"sm",color:"primary"} duration:3

## Rank 5
layout:parallel
- effect animation:bounceIn duration:0.8
  - component componentName:GlitchReveal props:{text:"#5",size:"lg",color:"secondary"} duration:1.5
- component componentName:AnimatedHeadline props:{text:"${item5Name}",subtext:"${item5Tagline}"} duration:3 start:1.5

## Rank 4
layout:parallel
- effect animation:bounceIn duration:0.8
  - component componentName:GlitchReveal props:{text:"#4",size:"lg",color:"secondary"} duration:1.5
- component componentName:AnimatedHeadline props:{text:"${item4Name}",subtext:"${item4Tagline}"} duration:3 start:1.5

## Rank 3
layout:parallel
- effect animation:bounceIn duration:0.8
  - component componentName:GlitchReveal props:{text:"#3",size:"lg",color:"secondary"} duration:1.5
- component componentName:AnimatedHeadline props:{text:"${item3Name}",subtext:"${item3Tagline}"} duration:3 start:1.5

## Rank 2
layout:parallel
- effect animation:bounceIn duration:0.8
  - component componentName:GlitchReveal props:{text:"#2",size:"lg",color:"secondary"} duration:1.5
- component componentName:AnimatedHeadline props:{text:"${item2Name}",subtext:"${item2Tagline}"} duration:3 start:1.5

## Rank 1
layout:parallel
- effect animation:bounceIn duration:0.8
  - component componentName:GlitchReveal props:{text:"#1",size:"xl",color:"primary"} duration:2
- component componentName:AnimatedHeadline props:{text:"${item1Name}",subtext:"${item1Tagline}"} duration:4 start:2
- component componentName:ParticleField props:{count:80,speed:0.6} isBackground:true duration:4
