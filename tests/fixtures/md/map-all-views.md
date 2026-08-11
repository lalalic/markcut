# video
seed:2668727180
width:640 height:480 fps:30 layout:series transition:fade transitionTime:0.5

## Satellite-Dolly
layout:parallel
- script "We begin high above San Francisco, then dive into the city."
- map view:overview mapType:satellite duration:4 center:{lat:37.7749,lng:-122.4194} camera:{zoom:tween(6, 12, easeInOut)}

## Route
layout:parallel
- script "The route winds from the Golden Gate to the airport, with photos at each stop."
- map view:route duration:6 travelMode:DRIVING mapType:roadmap routeColor:"#4285F4" routeWeight:5 routeMarker:"🚗" waypoints:[37.8199,-122.4783,"Golden Gate","https://picsum.photos/seed/gg-bridge/96/96"; 37.7749,-122.4194,"Civic Center","https://picsum.photos/seed/civic-center/96/96"; 37.6213,-122.3790,"SFO","https://picsum.photos/seed/sfo-airport/96/96"]

## Cinematic
layout:parallel
- script "The camera tilts and chases the road like a drone."
- map view:cinematic duration:8 travelMode:DRIVING mapType:satellite routeMarker:"🚗" cinematic:{mode:flyAlong, headingFollow:true, tilt:tween(0, 45, easeInOut)} camera:{zoom:tween(12, 14, easeInOut)} waypoints:[37.8199,-122.4783,"Golden Gate"; 37.7749,-122.4194,"Civic Center"; 37.6213,-122.3790,"SFO"]

## Street-View
layout:parallel
- script "And finally, we land on the street itself."
- map view:streetview duration:8 streetView:{location:{lat:37.7793,lng:-122.4193}, radius:50, pov:{heading:tween(200, 420, easeInOut), pitch:tween(0, -8)}, zoom:tween(0, 0.6, easeInOut)}

## Street-View-Walk
layout:parallel
- script "A quick walk down the block."
- map view:streetview duration:6 streetView:{route:[{lat:37.7793,lng:-122.4193}, {lat:37.7785,lng:-122.4185}, {lat:37.7777,lng:-122.4178}, {lat:37.7769,lng:-122.4170}], radius:50, pov:{heading:tween(0, 40, easeInOut), pitch:-5}}
