# video
width:1080 height:1920 fps:30 layout:series theme:${theme}

## Hook
layout:parallel
- component componentName:GradientBackground props:{type:"radial",animated:true,noise:true} isBackground:true duration:18
- component componentName:ParticleField props:{count:40,speed:0.3} isBackground:true duration:18
- effect animation:fadeInDown duration:1.5
  - component componentName:AnimatedHeadline props:{text:"${year} in Review",size:"lg",glow:true} duration:2.5

## Stat 1
layout:parallel
- effect animation:zoomIn duration:1.5
  - component componentName:StatCounter props:{value:${stat1Value},label:"${stat1Label}",suffix:"${stat1Suffix}"} duration:3

## Stat 2
layout:parallel
- effect animation:zoomIn duration:1.5
  - component componentName:StatCounter props:{value:${stat2Value},label:"${stat2Label}",suffix:"${stat2Suffix}"} duration:3

## Stat 3
layout:parallel
- effect animation:zoomIn duration:1.5
  - component componentName:StatCounter props:{value:${stat3Value},label:"${stat3Label}",suffix:"${stat3Suffix}"} duration:3

## Stat 4
layout:parallel
- effect animation:zoomIn duration:1.5
  - component componentName:StatCounter props:{value:${stat4Value},label:"${stat4Label}",suffix:"${stat4Suffix}"} duration:3

## Closing
layout:parallel
- effect animation:fadeInUp duration:2
  - component componentName:TypewriterText props:{text:"${closingLine}",speed:30,size:"lg",color:"primary"} duration:3
