# video
width:1080 height:1920 fps:30 layout:series theme:${theme}

## Announce
layout:parallel
- component componentName:GradientBackground props:{type:"radial",animated:true,noise:true} isBackground:true duration:14
- component componentName:ParticleField props:{count:50,speed:0.5} isBackground:true duration:14
- effect animation:glitchReveal duration:2.5
  - component componentName:AnimatedHeadline props:{text:"${productName}",subtext:"${productTagline}",gradient:true,glow:true} duration:2.5
- component componentName:TypewriterText props:{text:"${feature1}",speed:50,size:"md"} duration:2.5 start:3.5
- component componentName:TypewriterText props:{text:"${feature2}",speed:50,size:"md"} duration:2.5 start:6.5
- component componentName:TypewriterText props:{text:"${feature3}",speed:50,size:"md"} duration:2.5 start:9.5
- effect animation:fadeInUp duration:1.5 start:12.5
  - component componentName:EndTag props:{text:"${cta}",style:"accent"} duration:1.5
