# video
width:1920 height:1080 fps:30 layout:series theme:${theme}

## Title
layout:parallel
- component componentName:GradientBackground props:{type:"linear",animated:false} isBackground:true duration:4
- effect animation:fadeInDown duration:1.5
  - component componentName:AnimatedHeadline props:{text:"${title}",subtext:"${tagline}"} duration:3

## Route
layout:parallel
- map duration:10 waypoints:[${waypoint1},${waypoint2},${waypoint3}] travelMode:DRIVING routeColor:"#4285F4" routeWeight:4
- component componentName:CalloutBox props:{text:"${stop1Name}",style:"info"} duration:6 start:0
- component componentName:CalloutBox props:{text:"${stop2Name}",style:"info"} duration:6 start:2
- component componentName:CalloutBox props:{text:"${stop3Name}",style:"info"} duration:6 start:4

## Finale
layout:parallel
- component componentName:StatCounter props:{value:${totalDistance},suffix:"km",label:"Total Distance"} duration:3
