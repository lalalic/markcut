---
width: 640
height: 480
fps: 30
tts: edge-tts --voice "en-US-GuyNeural" --text "{input}" --write-media "{output}"
stt: whisper "{input}" --output_format vtt --output_dir "{output}" --model whisper-1 --language zh
---
# video
layout:series
## Demo
layout:parallel
- component duration:2 jsx:"<StatCounter value={42} label='Test' />"
- component duration:2 jsx:"<Banner text='Hello' />"
- component duration:1 jsx:"<InlineBadge text='Hot' />"

```js imports
import { StatCounter } from "npm:stat-counter"
import { Logo } from "github:foo/bar/src/Logo.tsx"
import { Banner } from "https://cdn.example.com/banner.js"

export function InlineBadge({ text }) {
  return <span style={{color:"#fff",background:"#333",padding:"4px 8px",borderRadius:"4px"}}>{text}</span>
}
```
