# video
width:1920 height:1080 fps:30 layout:series theme:${theme}

## Before
layout:parallel
- component componentName:GradientBackground props:{type:"solid",colors:["#2d1b1b","#1a0f0f"]} isBackground:true duration:4
- component componentName:CalloutBox props:{text:"Before: ${beforeTitle}",style:"danger"} duration:4
- component componentName:TypewriterText props:{text:"${beforeDesc}",speed:50,size:"sm",color:"#ff6b6b"} duration:4 start:1.5

## Comparison
layout:parallel
- component componentName:ComparisonSlider props:{before:"${beforeImage}",after:"${afterImage}",beforeLabel:"Before",afterLabel:"After"} duration:8

## After
layout:parallel
- component componentName:GradientBackground props:{type:"solid",colors:["#1b2d1b","#0f1a0f"]} isBackground:true duration:6
- component componentName:CalloutBox props:{text:"After: ${afterTitle}",style:"success"} duration:6
- component componentName:TypewriterText props:{text:"${afterDesc}",speed:50,size:"sm",color:"#51cf66"} duration:6 start:1.5
- component componentName:StatCounter props:{value:${statValue},suffix:"${statSuffix}",label:"${statLabel}"} duration:4 start:2

## CTA
layout:parallel
- component componentName:GradientBackground props:{type:"radial",animated:true} isBackground:true duration:5
- effect animation:fadeInUp duration:1.5
  - component componentName:EndTag props:{text:"${cta}"} duration:3.5
