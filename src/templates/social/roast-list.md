# video
width:1080 height:1920 fps:30 layout:series theme:neon

## Card
layout:parallel
- component componentName:GradientBackground props:{type:"radial",animated:true,noise:true,colors:["#0a0a0a","#1a1a2e"]} isBackground:true duration:22
- effect animation:bounceIn duration:1.5
  - component componentName:GlitchReveal props:{text:"${category}",size:"sm",color:"primary"} duration:3
- component componentName:TypewriterText props:{text:"${item1Name}",speed:40,size:"lg"} duration:2.5 start:4
- component componentName:TypewriterText props:{text:"${item1Tagline}",speed:60,size:"sm",color:"textMuted"} duration:2.5 start:4
- component componentName:TypewriterText props:{text:"${item2Name}",speed:40,size:"lg"} duration:2.5 start:7.5
- component componentName:TypewriterText props:{text:"${item2Tagline}",speed:60,size:"sm",color:"textMuted"} duration:2.5 start:7.5
- component componentName:TypewriterText props:{text:"${item3Name}",speed:40,size:"lg"} duration:2.5 start:11
- component componentName:TypewriterText props:{text:"${item3Tagline}",speed:60,size:"sm",color:"textMuted"} duration:2.5 start:11
- component componentName:TypewriterText props:{text:"${item4Name}",speed:40,size:"lg"} duration:2.5 start:14.5
- component componentName:TypewriterText props:{text:"${item4Tagline}",speed:60,size:"sm",color:"textMuted"} duration:2.5 start:14.5
- component componentName:TypewriterText props:{text:"${item5Name}",speed:40,size:"lg"} duration:2.5 start:18
- component componentName:TypewriterText props:{text:"${item5Tagline}",speed:60,size:"sm",color:"textMuted"} duration:2.5 start:18
