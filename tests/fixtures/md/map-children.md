# video
seed:42
width:640 height:480 fps:30 layout:series transition:fade transitionTime:0.5

## Route-Tour
layout:parallel
- script "We tour from the Golden Gate to the airport, stopping at each landmark."
- map view:route travelMode:DRIVING mapType:roadmap routeColor:"#4285F4" routeWeight:5
  waypoints:[37.8199,-122.4783,"Golden Gate"; 37.7749,-122.4194,"Civic Center"; 37.6213,-122.3790,"SFO"]
  - image src:https://picsum.photos/seed/gg-photo/200/200 at:"Golden Gate" duration:3 effects:[zoomIn]
  - image src:https://picsum.photos/seed/civic-photo/200/200 at:"Civic Center" duration:3 effects:[zoomIn]
