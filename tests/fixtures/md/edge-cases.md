# video
width:640 height:480 fps:30 layout:series
## Empty
layout:parallel
- include
## SpecialChars
layout:parallel
- image src:"my photo.jpg" duration:2
- audio src:"bgm (copy).mp3" duration:3 volume:0.5
## QuotedScripts
layout:parallel
- image src:a.jpg duration:2
- script "Special chars: #hash, $dollar, %percent, &ampersand"
- video src:b.mp4 duration:3
- script "Path with spaces: /Users/me/my video.mp4"
## LongDuration
layout:parallel
- image src:long.jpg duration:60
## ZeroDuration
layout:parallel
- component duration:0 jsx:"<Test />"
## VisibleFalse
layout:parallel
- image src:hidden.jpg duration:2 visible:false
- image src:shown.jpg duration:2
## BackgroundAudio
layout:parallel
- audio src:bgm.mp3 duration:10 volume:0.2 isBackground:true
## StartOffsets
layout:parallel
- image src:a.jpg duration:3 start:1
- image src:b.jpg duration:2 start:0
- image src:c.jpg duration:4 start:2
