---
width: 640
height: 480
fps: 30
---
# video
layout:series
## Charts
layout:parallel
- component duration:2 jsx:"<PieChart data={[{name:'A',value:50},{name:'B',value:50}]} />"
- component duration:2 jsx:"<Hello name='World' />"

```js imports
import { PieChart } from "npm:recharts"

export function Hello({ name }) {
  return <div style={{color: '#fff', fontSize: 24}}>Hello {name}</div>
}
```
