import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Mermaid } from "./Mermaid";

/**
 * Built-in component that renders markdown content as styled text.
 *
 * Usage in markdown / compiled JSON:
 *   <Markdown source={"# Hello\n\nThis is **bold** text."} />
 *
 * The `source` prop is the markdown string to render.
 *
 * `highlight` is an array of 0-based list item indices to highlight.
 * Works for both ordered (`ol`) and unordered (`ul`) lists. Matching
 * `<li>` elements get CSS class `highlight-list-item` (intended for use
 * with a `classDef` or a custom stylesheet).
 *
 * Built-in — no imports or frontmatter registration needed.
 */
export interface MarkdownProps {
  children?: string;
  source?: string;
  className?: string;
  plugins?: any[];
  components?: any;
  /** 0-based indices of list items to highlight. */
  highlight?: number[];
}

// Context to pass highlightList down to list renderers
const ListCtx = React.createContext<number[]>([]);

function OrderedList({
  children,
  ...props
}: React.ComponentPropsWithoutRef<"ol">) {
  const hl = React.useContext(ListCtx);
  const items = React.Children.toArray(children).filter(
    (c): c is React.ReactElement => React.isValidElement(c) && c.type === "li",
  );
  return (
    <ol {...props}>
      {items.map((child, i) => {
        if (hl.includes(i)) {
          return React.cloneElement(child, { className: "highlight-list-item", key: (child as any).key } as any);
        }
        return child;
      })}
    </ol>
  );
}

function UnorderedList({
  children,
  ...props
}: React.ComponentPropsWithoutRef<"ul">) {
  const hl = React.useContext(ListCtx);
  const items = React.Children.toArray(children).filter(
    (c): c is React.ReactElement => React.isValidElement(c) && c.type === "li",
  );
  return (
    <ul {...props}>
      {items.map((child, i) => {
        if (hl.includes(i)) {
          return React.cloneElement(child, { className: "highlight-list-item", key: (child as any).key } as any);
        }
        return child;
      })}
    </ul>
  );
}

export function Markdown({
  children,
  source = children,
  className,
  plugins,
  components: propComponents,
  highlight,
}: MarkdownProps) {
  const hl = React.useMemo(() => highlight ?? [], [highlight]);

  // Inject default styles once
  React.useEffect(() => {
    const id = "markcut-markdown-defaults";
    if (document.getElementById(id)) return;
    const el = document.createElement("style");
    el.id = id;
    el.textContent = `
      .highlight-list-item {
        background: rgba(255, 215, 0, 0.15);
        border-left: 3px solid #ffd700;
        padding-left: 8px;
        border-radius: 0 4px 4px 0;
      }
      .slide {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 24px;
        text-align: center;
      }
      .slide h1 { font-size: 2em; margin: 0.4em 0; font-weight: 700; }
      .slide h2 { font-size: 1.6em; margin: 0.35em 0; font-weight: 600; }
      .slide h3 { font-size: 1.3em; margin: 0.3em 0; font-weight: 600; }
      .slide p { margin: 0.6em 0; line-height: 1.6; }
      .slide ul, .slide ol { margin: 0.5em 0; padding-left: 1.5em; text-align: left; }
      .slide li { margin: 0.3em 0; }
      .slide blockquote {
        margin: 0.6em 0;
        padding: 0.4em 1em;
        border-left: 3px solid rgba(255,255,255,.3);
        font-style: italic;
        opacity: .85;
      }
      .slide code {
        background: rgba(255,255,255,.08);
        padding: 0.15em 0.4em;
        border-radius: 4px;
        font-size: 0.9em;
      }
      .slide pre { margin: 0.6em 0; text-align: left; width: 100%; }
      .slide a { color: #4a9eff; text-decoration: none; }
      .slide a:hover { text-decoration: underline; }
    `;
    document.head.appendChild(el);
    return () => { document.getElementById(id)?.remove(); };
  }, []);

  const mergedComponents = React.useMemo(
    () => ({
      ...propComponents,
      ol: OrderedList,
      ul: UnorderedList,
      pre: ({ children: preChildren }: { children: React.ReactNode }) => {
        const code = React.Children.toArray(preChildren)[0] as React.ReactElement<any>;
        if (code?.props?.className === "language-mermaid") {
          return <Mermaid source={String(code.props.children)} />;
        }
        if (propComponents?.pre) {
          return (propComponents.pre as any)({ children: preChildren });
        }
        return <pre>{preChildren}</pre>;
      },
    }),
    [propComponents],
  );

  return (
    <ListCtx.Provider value={hl}>
      <div className={className}>
        <ReactMarkdown
          remarkPlugins={React.useMemo(() => [remarkGfm, ...(plugins || [])], [plugins])}
          components={mergedComponents}
        >
          {source}
        </ReactMarkdown>
      </div>
    </ListCtx.Provider>
  );
}
