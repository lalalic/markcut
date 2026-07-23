import * as React from "react";
import { delayRender, continueRender } from "remotion";
import mermaid from "mermaid";

/**
 * Built-in component that renders a Mermaid diagram as inline SVG.
 *
 * Usage in markdown / compiled JSON:
 *   <Mermaid source={"graph TD;\n  A-->B;\n  A-->C;\n  B-->D;\n  C-->D;"} />
 *   <Mermaid source={diagram} theme="dark" />
 *
 * Props:
 *   source   — Mermaid diagram definition string
 *   theme    — Mermaid theme: "default" | "dark" | "forest" | "neutral" (default: "dark")
 *  className — Optional container className
 *
 * The diagram is rendered asynchronously via the mermaid library.
 * Uses delayRender/continueRender to ensure the SVG is ready before
 * the frame is captured by Remotion.
 *
 * Built-in — no imports or frontmatter registration needed.
 */
export interface MermaidProps {
  source?: string;
  children?: string;
  theme?: "default" | "dark" | "forest" | "neutral";
    className?: string;
}

let initialized = false;

export function Mermaid({ children, source=children, theme = "dark", className}: MermaidProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [handle] = React.useState(() => delayRender("Mermaid rendering"));

  React.useEffect(() => {
    if (!source || !ref.current) return;

    // Initialize once — mermaid.initialize is idempotent but we guard to avoid
    // redundant config writes on re-renders.
    if (!initialized) {
      mermaid.initialize({
        startOnLoad: false,
        theme,
        securityLevel: "loose",
      });
      initialized = true;
    }

    const id = "mmd-" + Math.random().toString(36).slice(2, 10);

    mermaid
      .render(id, source)
      .then((result) => {
        if (ref.current) ref.current.innerHTML = result.svg;
        continueRender(handle);
      })
      .catch((err) => {
        console.error("Mermaid error:", err);
        // Show error inline so the user can diagnose diagram syntax
        if (ref.current) {
          ref.current.innerHTML = `<div style="color:#f87171;padding:1em;border:2px dashed #f87171;border-radius:8px;font-family:monospace;font-size:14px;">
            <strong>⚠ Mermaid Error</strong><br/>${String(err).replace(/</g, "&lt;").replace(/>/g, "&gt;")}
          </div>`;
        }
        continueRender(handle);
      });
  }, [source, theme, handle]);

  return (
    <div
      ref={ref}
      className={className}
    />
  );
}
