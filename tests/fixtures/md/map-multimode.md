# video
seed:1
width:1080 height:1920 fps:30 layout:series transition:fade transitionTime:0.5

## Multi-Leg-Trip
layout:parallel
- script "We fly to the coast, take a boat across the bay, walk the promenade, then drive to the airport."
- map view:route duration:12 travelMode:DRIVING mapType:roadmap routeColor:"#4285F4" routeWeight:5
  waypoints:[37.8199,-122.4783,"SFO",FLIGHT; 33.94,-118.41,"LAX",BOAT; 33.75,-118.28,"Long Beach",WALKING; 33.77,-118.19,"Promenade",DRIVING; 33.94,-118.41,"LAX"]
