# video
width:640 height:480 fps:30 layout:series
## Test
layout:parallel
- image src:photo_${width}x${height}.jpg duration:2
- component duration:3 jsx:"<div style={{width:'100%',height:'100%',background:'#333',display:'flex',alignItems:'center',justifyContent:'center'}}><h1 style={{color:'white',fontSize:32}}>Size: ${width}x${height}</h1></div>"
