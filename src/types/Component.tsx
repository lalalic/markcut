import * as React from "react";
import { Sequence, useVideoConfig } from "remotion";
import { ComposeContext } from "../context/index";
import JsxParser from "react-jsx-parser";
import type { Component } from "../schema/index";

/**
 * Component leaf — renders a JSX usage expression at runtime.
 * Component tag names are resolved from ComposeContext.components
 * (populated by the engine from root.imports).
 */
export function ComponentLeaf({ stream }: { stream: Component }) {
  const { fps } = useVideoConfig();
  const { components } = React.useContext(ComposeContext);

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
            <JsxParser
              style={{ width: "100%", height: "100%" }}
              components={components}
              bindings={stream.data}
              jsx={stream.jsx}
              blacklistedAttrs={[]}
              disableKeyGeneration={true}
              onError={error => console.warn({jsx: stream.jsx, error: error.message})}
              renderError={({ error }) => <div style={{ color: "red", padding: 20, fontSize: "larger" }}>{error}</div>}
          />
          </Sequence>
        );
      })}
    </>
  );
}
