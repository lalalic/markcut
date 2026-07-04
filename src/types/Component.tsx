import * as React from "react";
import { Sequence, useVideoConfig } from "remotion";
import { useJsxWithImports } from "./DynamicLoader";
import type { Component } from "../schema/index";

/**
 * Component leaf — renders a JSX usage expression at runtime.
 * Component tag names are resolved from the `imports` map.
 * See `compileJsxWithImports` in DynamicLoader for compilation details.
 */
export function ComponentLeaf({ stream }: { stream: Component }) {
  const { fps } = useVideoConfig();
  const Comp = useJsxWithImports(stream.jsx, stream.imports ?? undefined);

  if (!Comp) return null;

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
            <Comp action={a} />
          </Sequence>
        );
      })}
    </>
  );
}
