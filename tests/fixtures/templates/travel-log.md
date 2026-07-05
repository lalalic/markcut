---
# Travel Log Template — 旅行日志模板
# Use when: travel vlogs, trip highlights, city tours, adventure documentaries
# Structure: Title → Route Map → Stop 1 → Stop 2 → ... → Recap
# Map overlay with animated route, then each stop gets a photo/video + narration

# Key decisions for the agent:
# 1. Route visualization: map node with waypoints for the entire journey
# 2. Each stop: photos (auto-generated or real) + narration about the location
# 3. Use transitionSeries with map-style transitions between locations
# 4. BGM: upbeat travel music, lower volume during narration
# 5. Route markers and travel mode (DRIVING, WALKING, etc.)

# Required external packages/components:
#   - npm:location-card — overlay card with location name, coordinates, date
#   - npm:weather-icon — displays weather icon + temperature for the location
#   - npm:photo-frame — decorative frame around travel photos
#   - npm:travel-stats — displays journey stats (distance, duration, stops)
#   - npm:compass-animation — animated compass rose overlay

# Missing capabilities to add:
#   - TTI: generate travel photos from location description + time of day
#   - Map data: auto-fetch route between waypoints (currently manual lat/lng)
#   - Location metadata: auto-lookup location name, country flag, timezone

tts:
  cli: 'edge-tts --voice "zh-CN-XiaoxiaoNeural" --rate "+5%" --text "{text}" --write-media "{output}"'
tti:
  cli: 'pi --model agnes-2.0-flash --print "generate image: {prompt}" --output "{output}"'
---
# video
width:1080 height:1920 fps:30 layout:series

## TitleCard
layout:parallel script:"Join me on a journey to Japan — Tokyo to Kyoto — 14 days of adventure!"
duration:5
- image src:auto prompt:"epic travel destination photo for Japan — Tokyo to Kyoto, golden hour, cinematic" duration:5 fit:cover
- component duration:5 jsx:"<LocationCard title='Japan — Tokyo to Kyoto' subtitle='March 15-28, 2026' />"

## RouteMap
layout:parallel script:"Here's our route: from Tokyo to Kyoto, covering [X] kilometers."
duration:6
- map duration:6 travelMode:DRIVING waypoints:[lat1,lng1,"Start";lat2,lng2,"Stop1";lat3,lng3,"Stop2";lat4,lng4,"End"] routeColor:"#FF6B6B" routeWeight:5 zoom:8 mapType:roadmap routeMarker:"🚗"
- component duration:6 jsx:"<TravelStats distance='458' duration='14' stops={8} />"
- audio src:bgm/travel-upbeat.mp3 duration:6 volume:0.2 isBackground:true

## Stop1
layout:parallel script:"First stop: Shibuya Crossing — The famous Shibuya Crossing is the busiest pedestrian intersection in the world. Hundreds of people cross from every direction when the lights turn red, creating an organized chaos that defines Tokyo's energy.."
duration:8
- image src:auto prompt:"travel photo of Shibuya Crossing landmark/attraction, natural lighting, photorealistic" duration:8 fit:cover
- component duration:8 jsx:"<LocationCard title='Shibuya Crossing' subtitle='Day 1' variant='stop' />"
- component duration:8 jsx:"<WeatherIcon condition='sunny' temperature={18} />"

## Stop2
layout:parallel script:"Next up: Shibuya Crossing — [description of the experience]."
duration:8
- video src:auto prompt:"travel clip at Shibuya Crossing: a scenic bullet train ride past Mt. Fuji, snow-capped peak against blue sky, cherry blossoms in the foreground" duration:8 volume:0
- component duration:8 jsx:"<LocationCard title='Shibuya Crossing' subtitle='Day 2' variant='stop' />"

## Stop3
layout:parallel script:"My favorite spot: Shibuya Crossing — Walking through the towering bamboo grove at dawn, with sunlight filtering through the green stalks and only the sound of birds, was the most peaceful moment of the entire trip.."
duration:10
- image src:auto prompt:"beautiful travel photo of Shibuya Crossing at sunset/morning, photorealistic, warm tones" duration:10 fit:cover
- component duration:10 jsx:"<PhotoFrame variant='highlight' />"

## Recap
layout:parallel script:"That was an incredible [X] days in Japan — Tokyo to Kyoto. Highlights: Shibuya Crossing at night, Mt. Fuji from the bullet train, Arashiyama bamboo grove at dawn. Until next time!"
duration:8
- image src:auto prompt:"collage-style travel photo of Japan — Tokyo to Kyoto landmarks, warm nostalgic tones" duration:8 fit:cover
- component duration:8 jsx:"<TravelStats distance='458' duration='14' stops={8} variant='summary' />"

~~~js imports
import { LocationCard } from "npm:location-card"
import { WeatherIcon } from "npm:weather-icon"
import { PhotoFrame } from "npm:photo-frame"
import { TravelStats } from "npm:travel-stats"
import { CompassAnimation } from "npm:compass-animation"
~~~
