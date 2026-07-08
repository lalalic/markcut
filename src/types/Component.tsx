import * as React from "react";
import { Sequence, useVideoConfig } from "remotion";
import { ComposeContext } from "../context/index";
import JsxParser from "react-jsx-parser";
import { useTweenBindings } from "../utils/tween";
import type { Component } from "../schema/index";

/** Find uppercase tag names in JSX that look like component references. */
function findUnknownComponentTags(jsx: string, registered: Record<string, unknown> | undefined): string[] {
  const tags = new Set<string>();
  // Match <TagName or <TagName attr or </TagName>
  const re = /<\s*\/?\s*([A-Z][a-zA-Z0-9]*)/g;
  let m;
  while ((m = re.exec(jsx)) !== null) {
    const tag = m[1]!;
    if (!registered?.[tag]) tags.add(tag);
  }
  return [...tags].sort();
}

/**
 * Wraps JsxParser with tween bindings for the current action.
 * Must be a separate component so useTweenBindings follows Rules of Hooks.
 */
function TweenedJsxParser({
  jsx,
  components,
  data,
  action,
}: {
  jsx: string;
  components: Record<string, React.ComponentType<any>> | undefined;
  data: Record<string, unknown> | undefined;
  action: { start?: number; end?: number };
}) {
  const tweenBindings = useTweenBindings(action);
  const unknownTags = React.useMemo(() => findUnknownComponentTags(jsx, components), [jsx, components]);
  const [jsxError, setJsxError] = React.useState<string | null>(null);

  return (
    <>
      {unknownTags.length > 0 && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0,
          background: "rgba(255, 200, 0, 0.85)", color: "#000",
          padding: "6px 12px", fontSize: 12, fontFamily: "monospace",
          zIndex: 100, whiteSpace: "pre-wrap", wordBreak: "break-all",
        }}>
          ⚠ Missing component{unknownTags.length > 1 ? "s" : ""}: {unknownTags.join(", ")}
          {components ? ` (${Object.keys(components).length} registered)` : " (0 registered)"}
        </div>
      )}
      {jsxError && (
        <div style={{ color: "red", padding: 20, fontSize: "larger" }}>{jsxError}</div>
      )}
      <JsxParser
        style={{ width: "100%", height: "100%" }}
        components={components}
        bindings={{ ...data, ...tweenBindings }}
        jsx={jsx}
        blacklistedAttrs={[]}
        disableKeyGeneration={true}
        onError={error => {
    console.warn({jsx, error: error.message});
    setJsxError(error.message);
  }}
        renderError={({ error }) => <div style={{ color: "red", padding: 20, fontSize: "larger" }}>{error}</div>}
      />
    </>
  );
}

/**
 * Component leaf — renders a JSX usage expression at runtime.
 * Component tag names are resolved from ComposeContext.components
 * (populated by the engine from root.imports).
 */
export function ComponentLeaf({ stream }: { stream: Component }) {
  const { fps } = useVideoConfig();
  const { components } = React.useContext(ComposeContext);
  const bindings = React.useMemo(() => ({ components, ...stream.data }), [stream.data]);

  if (!stream.jsx) return null;

  return (
    <>
      {stream.actions.map((a) => {
        const start = a.start ?? 0;
        const end = a.end ?? start + 1;
        return (
          <Sequence
            key={a.id}
            durationInFrames={Math.max(1, Math.floor(fps * (end - start)))}
            from={Math.floor(fps * start)}
            layout="none"
          >
            <TweenedJsxParser
              jsx={stream.jsx}
              components={components}
              data={bindings}
              action={a}
            />
          </Sequence>
        );
      })}
    </>
  );
}
