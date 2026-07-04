# video
width:640 height:480 fps:30 layout:series
## RoadTrip
layout:parallel
- map duration:5 travelMode:DRIVING waypoints:[37.77,-122.41,"San Francisco";34.05,-118.24,"Los Angeles";36.16,-115.15,"Las Vegas"] routeColor:"#FF5733" routeWeight:6 zoom:8 mapType:roadmap routeMarker:"🚗"
## WalkingTour
layout:parallel
- map duration:4 travelMode:WALKING waypoints:[48.8566,2.3522,"Paris";48.8575,2.3644,"Louvre"] mapType:hybrid zoom:15 routeMarker:"🚶" routeColor:"#33FF57" routeWeight:3
## DetailedWaypoints
layout:parallel
- map duration:3 waypoints:[35.6762,139.6503,"Tokyo";35.7146,139.7967,"Asakusa";35.7101,139.8107,"Skytree"] travelMode:TRANSIT mapType:satellite zoom:12 routeMarker:"🗼"
