## Built-in Components (no imports needed)

These components are available directly in `jsx:".."` fields or importable from the `~~~js imports` block via `@lalalic/markcut/components`:

### `<Markdown />` — render markdown content
```md
- component jsx:"<Markdown source='# Hello\n\n**bold** text.' />"
```
- Uses `react-markdown` + `remark-gfm` (tables, strikethrough, task lists)
- Supports `plugins` and `components` props: define custom renderers in imports block and pass them in
- ` ```mermaid ` code fences inside markdown are automatically rendered as Mermaid diagrams
- Importable: `import {Markdown} from "@lalalic/markcut/components"`

### `<Mermaid />` — render Mermaid diagrams as SVG
```md
- component jsx:"<Mermaid source='graph TD; A-->B; A-->C; B-->D;' />"
```
- Theme prop: `theme="default" | "dark" | "forest" | "neutral"` (default: `dark`)
- Uses `delayRender`/`continueRender` for async rendering — diagram is ready before Remotion captures the frame
- Errors shown inline in the output
- Importable: `import {Mermaid} from "@lalalic/markcut/components"`

### Wrapping built-ins in custom components
```js
import {Markdown, Mermaid} from "@lalalic/markcut/components"

export function SuperMarkdown({ source }) {
  return (
    <Markdown
      source={source}
      components={{
        li: ({children}) => <li style={{color:'#ffd700'}}>{children}</li>,
      }}
    />
  )
}
```

## Common npm packages (used via imports block)
- `react-markdown` + `remark-gfm` — already bundled as built-in `<Markdown />` above
    - `remark-toc` — generate table of contents
    - `remark-math` + `rehype-katex` — render math formulas with KaTeX
- `@remotion/shapes` — render shapes like arrows, circles, rectangles, etc
- `@remotion/starburst` — render starburst animations
- `react-webcam-pro` — render webcam video
- `react-chartjs-2` — render charts with Chart.js at `https://react-chartjs-2.js.org/components`
- `@xyflow/react` - render diagrams with `https://reactflow.dev/api-reference`
