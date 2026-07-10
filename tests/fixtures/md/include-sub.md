# sub-video
width:640 height:480 fps:30 layout:series
## SubScene1
layout:parallel
- component duration:3 jsx:"<SubSlide bg='#667eea' scene='1' />"
## SubScene2
layout:parallel
- component duration:3 jsx:"<SubSlide bg='#764ba2' scene='2' />"

```js imports
export function SubSlide({ bg, scene }) {
  return <div style={{
    background: bg,
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'column'
  }}>
    <h1 style={{color:'white', fontSize:48, margin:0}}>Sub Video</h1>
    <p style={{color:'rgba(255,255,255,0.8)', fontSize:24}}>Scene {scene}</p>
  </div>;
}
```
