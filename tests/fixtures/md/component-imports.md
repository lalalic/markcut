---
width: 640
height: 480
fps: 30
---
# video
layout:series
## Demo
layout:parallel
- component duration:2 jsx:"<Hello name='World' />"
- component duration:3 jsx:"<PieChart data={[{value:40,color:'#E38627'},{value:30,color:'#C13C37'},{value:20,color:'#6A2135'}]} lineWidth={20} />"

```js imports
import { PieChart } from "npm:react-minimal-pie-chart"
import { Hello } from "git:user/repo/path/to/Hello.tsx"

export function Hello({ name }) {
  return <div style={{color: '#fff', fontSize: 24, textAlign: 'center'}}>Hello {name}!</div>
}
```
