# main-video
width:640 height:480 fps:30 layout:series
## Intro
layout:parallel
- component duration:2 jsx:"<div style={{background:'#1a1a2e',width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center'}}><h1 style={{color:'#e94560',fontSize:36}}>Main Video</h1></div>"
## EmbeddedContent
layout:parallel
- include src:./include-sub.md
## Outro
layout:parallel
- component duration:2 jsx:"<div style={{background:'#16213e',width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center'}}><h1 style={{color:'#0f3460',fontSize:36}}>The End</h1></div>"
