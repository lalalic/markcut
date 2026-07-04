---
width: 640
height: 480
fps: 30
---
# video
layout:series
## Demo
layout:parallel
- component duration:2 jsx:"<Greeting name='World' />"
- component duration:3 jsx:"<Counter value={100} />"

```js imports
export function Greeting({ name }) {
  return <div style={{color: '#fff', fontSize: 28, textAlign: 'center'}}>Hello {name}!</div>
}

export function Counter({ value }) {
  return <div style={{color: '#667eea', fontSize: 64, fontWeight: 'bold', textAlign: 'center'}}>{value}</div>
}
```
