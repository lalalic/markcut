import * as React from "react";
import { AbsoluteFill, continueRender, delayRender, staticFile } from "remotion";
import { ensureSharedImportMap } from "./utils/component-import-map";
import { ComposeContext, EventProvider, type ComposeContextValue } from "./context/index";

import { FolderLeaf } from "./types/Folder";
import { SubtitleOverlay } from "./types/Subtitle";
import * as AllComponents from "./components/index";
import { getDurationInSeconds } from "./utils/index";
import { root as rootSchema, type Root } from "./schema/index";
import {
  compileDescriptiveRoot,
  type CompileOptions,
  type DescriptiveRoot,
} from "./descriptive/compiler";

export interface MarkCutProps {
  /** Stream tree. Will be parsed by zod (defaults applied). */
  root: unknown;
  /** Optional host-provided Container + components registry. */
  compose?: Partial<ComposeContextValue>;
  /** Background of the canvas. Defaults to black. */
  background?: string;
}

export interface DescriptiveCompositionProps extends Omit<MarkCutProps, "root"> {
  root: DescriptiveRoot;
  compileOptions?: CompileOptions;
}

const DefaultContainer: ComposeContextValue["Container"] = ({ children, style, className }) => (
  <div className={className} style={{ position: "absolute", inset: 0, ...style }}>
    {children}
  </div>
);

/**
 * Built-in components available to every video without registration.
 * Auto-populated from the components barrel file (src/components/index.ts).
 * To add a new built-in: create the component file, export it from the barrel,
 * then rebuild bundles — no manual registration needed.
 *
 * User-provided components (via compose.components or root.imports) take
 * precedence — they can override any builtin by using the same name.
 */
const BUILTIN_COMPONENTS: Record<string, React.ComponentType<any>> = AllComponents as unknown as Record<string, React.ComponentType<any>>;

/**
 * Load the component registry from root.imports.
 * - If string: import it as an ESM module (pre-bundled by server)
 * - If object: use it directly (programmatic API)
 */
function useComponentRegistry(imports: unknown): Record<string, React.ComponentType<any>> | null {
  const [registry, setRegistry] = React.useState<Record<string, React.ComponentType<any>> | null>(null);
  // delayRender() returns a numeric handle that continueRender() consumes.
  const handleRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (!imports) {
      // No registry to load — stay null so ComposeContext falls back to
      // `compose.components` (programmatic API). Returning `{}` here would
      // shadow the host-provided registry with an empty object.
      setRegistry(null);
      return;
    }
    if (typeof imports === "object" && imports !== null && !Array.isArray(imports)) {
      setRegistry(imports as Record<string, React.ComponentType<any>>);
      return;
    }
    if (typeof imports === "string") {
      if (!handleRef.current) {
        handleRef.current = delayRender("Loading component registry: " + imports);
      }
      // Absolute URLs and "/"-rooted paths (preview server) load as-is;
      // relative paths (render CLI stages bundles into publicDir) resolve
      // through staticFile so the Remotion render server can serve them.
      const moduleUrl = /^(https?:|data:|blob:|\/)/.test(imports) ? imports : staticFile(imports);
      ensureSharedImportMap();
      import(/* webpackIgnore: true */ moduleUrl)
        .then((mod: any) => {
          // The bundle exports all components as named exports
          setRegistry(mod.default ?? mod);
          if (handleRef.current) {
            continueRender(handleRef.current);
            handleRef.current = null;
          }
        })
        .catch((err: Error) => {
          console.error("Failed to load component registry:", err);
          setRegistry(null);
          if (handleRef.current) {
            continueRender(handleRef.current);
            handleRef.current = null;
          }
        });
      return;
    }
    setRegistry(null);
  }, [imports]);

  return registry;
}

export function MarkCut({ root, compose, background = "#000" }: MarkCutProps) {
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

  // Load component registry (bundle URL or inline map)
  const registry = useComponentRegistry(parsed.imports);

  // engine pre-pass: stamp durationInSeconds onto every node
  React.useMemo(() => getDurationInSeconds(parsed as any, true), [parsed]);

  const value = React.useMemo<ComposeContextValue>(
    () => {
      const userComponents = registry ?? compose?.components;
      const components = userComponents
        ? { ...BUILTIN_COMPONENTS, ...userComponents }
        : BUILTIN_COMPONENTS;
      return {
        Container: compose?.Container ?? DefaultContainer,
        onError: compose?.onError,
        components,
      };
    },
    [compose, registry],
  );

  return (
    <ComposeContext.Provider value={value}>
      <EventProvider>
        <AbsoluteFill style={{ background }}>
          {parsed.stylesheet && <style>{parsed.stylesheet}</style>}
          <FolderLeaf stream={parsed as any} />
          {parsed.subtitle && <SubtitleOverlay subtitle={parsed.subtitle} />}
        </AbsoluteFill>
      </EventProvider>
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
    <MarkCut
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
export { builtinAnimations } from "./types/keyframes";
// Resolve functions (TTS, STT, media probe) are available via
// import from "markcut/descriptive-resolve" for CLI use.
// Not re-exported from entry to avoid bundling Node.js modules
// (node:child_process, node:fs, etc.) into the browser-side render bundle.
