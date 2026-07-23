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
 * Built-in — no imports or frontmatter registration needed.
 */
export interface MarkdownProps {
    children?: string;
  source?: string;
  className?: string;
  plugins?: any[];
  components?: any;
}

export function Markdown({ children, source=children, className, plugins, components }: MarkdownProps) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={React.useMemo(() => [remarkGfm, ...(plugins || [])], [plugins])}
        components={React.useMemo(
          () => ({
            ...components,
            pre: ({ children }) => {
                const code = React.Children.toArray(children)[0] as React.ReactElement<any>;
                if (code?.props?.className === 'language-mermaid') {
                    return <Mermaid source={String(code.props.children)} />
                } else if (components.pre) {
                  return components.pre({ children });
                }
                return <pre>{children}</pre>;
              },
          }),
          [components]  
        )}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
