import * as React from "react";
import mermaid from "mermaid";

/**
 * Built-in component that renders a Mermaid diagram as inline SVG.
 *
 * Usage in markdown / compiled JSON:
 *   <Mermaid source={"graph TD;\n  A-->B;\n  A-->C;\n  B-->D;\n  C-->D;"} />
 *   <Mermaid source={diagram} theme="dark" />
 *
 * Props:
 *   source       — Mermaid diagram definition string
 *   theme        — Mermaid theme: "default" | "dark" | "forest" | "neutral" (default: "dark")
 *   className    — Optional container className
 *   style        — Container inline style
 *   highlight    — Node name(s) to highlight. String or array of strings.
 *                  Toggles CSS class `highlight` on matching SVG elements.
 *                  The diagram source should define the class, e.g.:
 *                    classDef highlight fill:#ffd700,stroke:#ff6600,stroke-width:3px
 *   animateEdges — Edge(s) to animate with a flowing dash effect.
 *                  true = animate all edges.
 *                  string[] = animate specific edges by source->target alias,
 *                  e.g. ["A->B", "D->C"]. Edge paths are found via Mermaid's
 *                  SVG id pattern: {prefix}-L_{source}_{target}_{index}.
 *                  Adds CSS class `edge-animated` with a stroke-dashoffset
 *                  keyframe animation.
 *
 * The diagram is rendered asynchronously via the mermaid library.
 *
 * Built-in — no imports or frontmatter registration needed.
 */
export interface MermaidProps {
  source?: string;
  children?: string;
  theme?: "default" | "dark" | "forest" | "neutral";
  className?: string;
  style?: React.CSSProperties;
  highlight?: string | string[];
  animateEdges?: boolean | string[];
}

let initialized = false;

/**
 * Recursively extract plain text from JsxParser children.
 * JsxParser may wrap template literals in nested React elements.
 */
function extractText(x: unknown): string {
  if (typeof x === "string") return x;
  if (Array.isArray(x)) return x.map(extractText).join("");
  if (x && typeof x === "object" && "props" in (x as any)) {
    return extractText((x as any).props?.children);
  }
  return "";
}

/**
 * Find the SVG element representing a named node.
 * Strategy: search <text> + <title> elements by textContent,
 * walk up to the containing <g> cluster.
 */
function findNodeGroup(svg: SVGSVGElement, name: string): Element | null {
  // Strategy 1: SVG id containing the alias (e.g. `flowchart-A-1234` for "A")
  // Mermaid embeds node aliases in auto-generated IDs.
  const byId = svg.querySelector(`[id*="-${CSS.escape(name)}-"]`);
  if (byId) {
    let el: Element | null = byId;
    while (el && el.tagName !== "g") el = el.parentElement;
    return el || byId;
  }
  // Strategy 2: <text> elements whose text starts with the name
  for (const t of svg.querySelectorAll<SVGTextElement>("text")) {
    const text = t.textContent?.trim() ?? "";
    if (text.startsWith(name)) {
      let el: Element | null = t;
      while (el && el.tagName !== "g") el = el.parentElement;
      return el || t;
    }
  }
  // Strategy 3: <title> elements (class diagram titles, state labels)
  for (const t of svg.querySelectorAll("title")) {
    if ((t.textContent?.trim() ?? "").startsWith(name) && t.parentElement) {
      return t.parentElement;
    }
  }
  return null;
}

/**
 * Apply edge animation to matching paths in the rendered Mermaid SVG.
 * Mermaid edge paths have IDs like `{prefix}-L_{source}_{target}_{index}`.
 *
 * @param svg - The rendered SVG element
 * @param spec - true = animate all edges, string[] = specific edges by "A->B" pattern
 */
function applyEdgeAnimation(svg: SVGSVGElement, spec: boolean | string[] | undefined): void {
  if (!spec) return;

  const allEdges = Array.from(svg.querySelectorAll<SVGPathElement>(
    'path[id*="-L_"]',
  ));

  if (spec === true) {
    // Animate all edges
    for (const path of allEdges) {
      path.classList.add("edge-animated");
    }
    return;
  }

  // spec is string[] — parse patterns like "A->B"
  for (const pattern of spec) {
    const match = pattern.match(/^(\w+)\s*->\s*(\w+)$/);
    if (!match) continue;
    const source = match[1]!;
    const target = match[2]!;

    // Find matching path by ID pattern: *L_{source}_{target}_*
    const suffix = `L_${source}_${target}_`;
    for (const path of allEdges) {
      if (path.id.includes(suffix)) {
        path.classList.add("edge-animated");
      }
    }
  }
}

export function Mermaid({
  children,
  source: sourceProp,
  theme = "dark",
  className,
  style,
  highlight,
  animateEdges,
}: MermaidProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const renderedRef = React.useRef(false);
  const styleRef = React.useRef<HTMLStyleElement | null>(null);

  // Inject edge animation CSS once
  React.useEffect(() => {
    if (!styleRef.current) {
      const el = document.createElement("style");
      el.textContent = `
        @keyframes mermaid-edge-flow {
          to { stroke-dashoffset: -24; }
        }
        .edge-animated {
          stroke-dasharray: 8 6 !important;
          animation: mermaid-edge-flow 0.5s linear infinite !important;
        }
      `;
      document.head.appendChild(el);
      styleRef.current = el;
    }
    return () => {
      if (styleRef.current) {
        styleRef.current.remove();
        styleRef.current = null;
      }
    };
  }, []);

  // Resolve source string: children from JsxParser may be nested React
  // elements wrapping template literals.
  const source = React.useMemo(
    () => extractText(sourceProp ?? children),
    [sourceProp, children],
  );

  // Render effect — runs once when source/theme changes
  React.useEffect(() => {
    let cancelled = false;
    if (!source || !ref.current) return;

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
        if (cancelled || !ref.current) return;
        ref.current.innerHTML = result.svg;
        const svg = ref.current.querySelector<SVGSVGElement>("svg");
        if (svg) {
          svg.removeAttribute("width");
          svg.removeAttribute("height");
          svg.style.width = "100%";
          svg.style.height = "100%";

          // Apply initial highlight now that SVG exists.
          // The highlight effect below only fires on prop changes, so the
          // initial highlight would be missed if SVG wasn't ready yet.
          if (highlight) {
            const names = Array.isArray(highlight) ? highlight : [highlight];
            for (const name of names) {
              const node = findNodeGroup(svg, name);
              if (node) node.classList.add("highlight");
            }
          }

          // Apply edge animation now that SVG exists.
          applyEdgeAnimation(svg, animateEdges);
        }
        renderedRef.current = true;
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Mermaid error:", err);
        if (ref.current) {
          ref.current.innerHTML = `<div style="color:#f87171;padding:1em;border:2px dashed #f87171;border-radius:8px;font-family:monospace;font-size:14px;">
            <strong>⚠ Mermaid Error</strong><br/>${String(err).replace(/</g, "&lt;").replace(/>/g, "&gt;")}
          </div>`;
        }
      });

    return () => { cancelled = true; };
  }, [source, theme]);

  // Highlight effect — toggles CSS class `highlight` on matching nodes.
  // The diagram source must define this class with desired styles, e.g.:
  //   classDef highlight fill:#ffd700,stroke:#ff6600,stroke-width:3px
  React.useEffect(() => {
    const svg = ref.current?.querySelector<SVGSVGElement>("svg");
    if (!svg) return;

    // Remove class from all nodes
    svg.querySelectorAll(".highlight").forEach((el) => {
      el.classList.remove("highlight");
    });

    // Apply class to current highlight target(s)
    const names = Array.isArray(highlight) ? highlight : (highlight ? [highlight] : []);
    for (const name of names) {
      const node = findNodeGroup(svg, name);
      if (node) {
        node.classList.add("highlight");
      }
    }
  }, [highlight]);

  // AnimateEdges effect — re-applies edge animation on prop changes.
  // Runs in addition to the initial application in the render callback.
  React.useEffect(() => {
    const svg = ref.current?.querySelector<SVGSVGElement>("svg");
    if (!svg) return;

    // Remove animated class from all edges first
    svg.querySelectorAll(".edge-animated").forEach((el) => {
      el.classList.remove("edge-animated");
    });

    // Re-apply to current spec
    applyEdgeAnimation(svg, animateEdges);
  }, [animateEdges]);

  // Default: center the SVG in the container. User style overrides individual properties.
  const containerStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
    height: "100%",
    ...style,
  };

  return <div ref={ref} className={className} style={containerStyle} />;
}
