## Built-in Components (no imports needed)

These components are available directly in `jsx:".."` fields or importable from the `~~~js imports` block via `@lalalic/markcut/components`:

### `<Markdown />` — render markdown content
```md
- component jsx:"<Markdown source='# Hello\n\n**bold** text.' />"
```
- Uses `react-markdown` + `remark-gfm` (tables, strikethrough, task lists)
- Supports `plugins` and `components` props: define custom renderers in imports block and pass them in
- ` ```mermaid ` code fences inside markdown are automatically rendered as Mermaid diagrams
- **`highlight`** — array of 0-based list item indices to highlight (e.g., `highlight={[0,2]}`).
  Matching `<li>` elements receive CSS class `highlight-list-item` with a default golden
  left-border and background tint. Works for both ordered and unordered lists.
  ```md
  <Markdown highlight={[0,2]}
    source={"1. First item\n2. Second item\n3. Third item\n4. Fourth item"} />
  ```
- Importable: `import {Markdown} from "@lalalic/markcut/components"`

### `<Mermaid />` — render Mermaid diagrams as SVG
```md
- component jsx:"<Mermaid source='graph TD; A-->B; A-->C; B-->D;' />"
```
- Theme prop: `theme="default" | "dark" | "forest" | "neutral"` (default: `dark`)
- **`highlight`** — node name(s) to highlight. String or array of strings.
  Toggles CSS class `highlight` on matching SVG elements. The diagram source
  must define the class via `classDef`:
  ```md
  classDef highlight fill:#ffd700,stroke:#ff6600,stroke-width:3px,color:#000
  ```
- **`animateEdges`** — edge(s) to animate with a flowing dash effect.
  `true` = animate all edges. `string[]` = specific edges by source→target alias:
  ```md
  animateEdges={["A->B","D->F","F->G"]}
  ```
  Animates matching edge `<path>` elements via CSS `stroke-dasharray` + `stroke-dashoffset` keyframes.
- Source from code fences: use `~~~mermaid` to define the diagram source in a
  separate block, then reference it as `source={mermaid}` in the JSX:
  ```md
  - component id:flowChart duration:12
    ~~~jsx
    <Mermaid highlight={highlight} animateEdges={animateEdges}
             theme='dark' source={mermaid}/>
    ~~~
    ~~~mermaid
    graph TD
      A["Receive Request"] --> B["Validate Input"]
      B --> C{"Valid?"}
      classDef highlight fill:#ffd700,stroke:#ff6600,stroke-width:3px
    ~~~
    highlight:"A"
    animateEdges:true
  ```
- Dynamic highlight/edges via events: define `on` specs that mutate the
  component's registered id:
  ```md
  - event duration:3 start:3 on:(start, flowChart.highlight="B")
  - event duration:3 start:6 on:(start, flowChart.highlight="C")
  - event duration:3 start:9 on:(start, flowChart.highlight=["D","G"])
  ```
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
