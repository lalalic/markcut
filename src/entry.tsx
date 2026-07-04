import * as React from "react";
import { AbsoluteFill } from "remotion";
import { ComposeContext, type ComposeContextValue } from "./context/index";

import { FolderLeaf } from "./types/Folder";
import { SubtitleOverlay } from "./types/Subtitle";
import { getDurationInSeconds } from "./utils/index";
import { root as rootSchema, type Root } from "./schema/index";
import {
  compileDescriptiveRoot,
  type CompileOptions,
  type DescriptiveRoot,
} from "./descriptive/compiler";

export interface RemotionEngineProps {
  /** Stream tree. Will be parsed by zod (defaults applied). */
  root: unknown;
  /** Optional host-provided Container + components registry. */
  compose?: Partial<ComposeContextValue>;
  /** Background of the canvas. Defaults to black. */
  background?: string;
}

export interface DescriptiveCompositionProps extends Omit<RemotionEngineProps, "root"> {
  root: DescriptiveRoot;
  compileOptions?: CompileOptions;
}

const DefaultContainer: ComposeContextValue["Container"] = ({ children, style, className }) => (
  <div className={className} style={{ position: "absolute", inset: 0, ...style }}>
    {children}
  </div>
);

export function RemotionEngine({ root, compose, background = "#000" }: RemotionEngineProps) {
  const parsed = React.useMemo<Root>(() => {
    if (!root) {
      // Return a minimal valid root when no data is provided (e.g. studio placeholder)
      return {
        id: "root",
        type: "root",
        width: 1080,
        height: 1920,
        fps: 30,
        visible: true,
        isSeries: false,
        children: [],
        durationInSeconds: 0.1,
      } as unknown as Root;
    }
    return rootSchema.parse(root) as unknown as Root;
  }, [root]);

  // engine pre-pass: stamp durationInSeconds onto every node
  React.useMemo(() => getDurationInSeconds(parsed as any, true), [parsed]);

  const value = React.useMemo<ComposeContextValue>(
    () => ({
      Container: compose?.Container ?? DefaultContainer,
      onError: compose?.onError,
    }),
    [compose],
  );

  return (
    <ComposeContext.Provider value={value}>
      <AbsoluteFill style={{ background }}>
        <FolderLeaf stream={parsed as any} />
        {parsed.subtitle && <SubtitleOverlay subtitle={parsed.subtitle} />}
      </AbsoluteFill>
    </ComposeContext.Provider>
  );
}

export function DescriptiveComposition({
  root,
  compose,
  background = "#000",
  compileOptions,
}: DescriptiveCompositionProps) {
  const compiled = React.useMemo(
    () => compileDescriptiveRoot(root, compileOptions),
    [root, compileOptions],
  );

  return (
    <RemotionEngine
      root={compiled}
      compose={compose}
      background={background}
    />
  );
}

export { rootSchema, FolderLeaf };
export * from "./schema/index";
export * from "./context/index";
export * from "./descriptive/compiler";
export * from "./descriptive/markdown";
export { getDurationInSeconds } from "./utils/index";
export { preloadComponents, useJsxWithImports } from "./types/DynamicLoader";
export { builtinAnimations } from "./types/keyframes";
// Resolve functions (TTS, STT, media probe) are available via
// import from "markcut/descriptive-resolve" for CLI use.
// Not re-exported from entry to avoid bundling Node.js modules
// (node:child_process, node:fs, etc.) into the browser-side render bundle.
