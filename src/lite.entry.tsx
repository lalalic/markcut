import * as React from "react";
import { AbsoluteFill } from "remotion";
import { ComposeContext, type ComposeContextValue } from "./context/index";
import { ThemeProvider, resolveTheme, type Theme } from "./themes";
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
  /** Theme preset name, theme object, {base, ...overrides}, or JSON string. */
  theme?: string | Theme | Record<string, unknown>;
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

export function RemotionEngine({ root, compose, background = "#000", theme }: RemotionEngineProps) {
  const parsed = React.useMemo<Root>(() => rootSchema.parse(root), [root]);

  // engine pre-pass: stamp durationInSeconds onto every node
  React.useMemo(() => getDurationInSeconds(parsed as any, true), [parsed]);

  const resolvedTheme = React.useMemo(
    () => resolveTheme(theme ?? (root as any)?.theme),
    [theme, root],
  );

  const value = React.useMemo<ComposeContextValue>(
    () => ({
      Container: compose?.Container ?? DefaultContainer,
      components: compose?.components ?? {},
      onError: compose?.onError,
    }),
    [compose],
  );

  return (
    <ComposeContext.Provider value={value}>
      <ThemeProvider theme={resolvedTheme}>
        <AbsoluteFill style={{ background: background || resolvedTheme.colors.background }}>
          <FolderLeaf stream={parsed as any} />
          {parsed.subtitle && <SubtitleOverlay subtitle={parsed.subtitle} />}
        </AbsoluteFill>
      </ThemeProvider>
    </ComposeContext.Provider>
  );
}

export function DescriptiveComposition({
  root,
  compose,
  background = "#000",
  theme,
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
      theme={theme}
    />
  );
}

export { rootSchema, FolderLeaf };
export * from "./schema/index";
export * from "./context/index";
export * from "./descriptive/compiler";
export * from "./descriptive/markdown";
export {
  resolveMediaDurations,
  resolveScripts,
  resolveAll,
} from "./descriptive/resolve";
export type {
  ResolveMediaOptions,
  ResolveScriptOptions,
  ResolveAllOptions,
} from "./descriptive/resolve";
export { getDurationInSeconds } from "./utils/index";
export { preloadComponents } from "./types/DynamicLoader";
export { builtinAnimations } from "./types/keyframes";
