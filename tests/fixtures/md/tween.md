# video
width:640 height:480 fps:30 layout:series
## BarChartAnim
layout:parallel
- component duration:4 jsx:"<svg viewBox='0 0 400 300'><rect y={260-tween(0,200)} width={80} height={tween(0,200)} fill='#E38627' /><rect x={100} y={260-tween(0,160)} width={80} height={tween(0,160)} fill='#C13C37' /><rect x={200} y={260-tween(0,240)} width={80} height={tween(0,240)} fill='#6A2135' /></svg>"
## ColorTween
layout:parallel
- component duration:3 jsx:"<div style={{background:tween('#000','#FFF'), width:200, height:200, borderRadius: tween(0,100)}} />"
