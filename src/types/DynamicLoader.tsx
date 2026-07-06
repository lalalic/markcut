/**
 * Remote component loader for the Remotion engine.
 *
 * Loads React components from a pre-bundled module at render time.
 * JSX usage expressions are rendered via react-jsx-parser — no Babel needed.
 *
 * Uses an import-map shim to prevent React double-bundling when
 * the bundled ESM module imports from "react".
 */
import * as React from "react";
import * as Remotion from "remotion";
import { delayRender, continueRender } from "remotion";
import JsxParser from "react-jsx-parser";

// ── Globals for remote component access ──────────────────────────────────
if (typeof window !== "undefined") {
  (window as any).__React = React;
  (window as any).__Remotion = Remotion;
  globalThis.React = React;
}

// ── Import-map shim ───────────────────────────────────────────────────────
// Redirects `import from "react"` in loaded ESM modules to the same React
// instance Remotion already has loaded. Only injected once.
let reactShimInjected = false;

function ensureReactShim(): void {
  if (reactShimInjected) return;
  if (typeof window === "undefined") return;

  if (document.querySelector('#rmtr-react-shim')) {
    reactShimInjected = true;
    return;
  }

  try {
    const blobReact = new Blob(
      [
        `
        const R = globalThis.React;
        export const {
          useState,
          useEffect,
          useRef,
          useMemo,
          useCallback,
          useContext,
          useReducer,
          useLayoutEffect,
          useImperativeHandle,
          useDebugValue,
          useId,
          useSyncExternalStore,
          useTransition,
          useDeferredValue,
          createElement,
          Fragment,
          Suspense,
          forwardRef,
          Children,
          isValidElement,
          cloneElement,
          createContext,
          PureComponent,
          Component,
          lazy,
          memo,
        } = R;
        export default R;
      `,
      ],
      { type: "application/javascript" },
    );
    const urlReact = URL.createObjectURL(blobReact);

    // Also shim react/jsx-runtime — some esm.sh bundles use the automatic JSX runtime.
    // Uses globalThis.React directly instead of importing from "react" to avoid
    // circular dependency with the import map.
    const blobJsxRuntime = new Blob(
      [
        `
        const R = globalThis.React;
        const { createElement, Fragment } = R;
        export { Fragment };
        export function jsx(type, props, key) {
          return createElement(type, key != null ? { ...props, key } : props);
        }
        export function jsxs(type, props, key) {
          return createElement(type, key != null ? { ...props, key } : props);
        }
        export function jsxDEV(type, props, key, isStaticChildren, source, self) {
          return createElement(type, key != null ? { ...props, key } : props);
        }
      `,
      ],
      { type: "application/javascript" },
    );
    const urlJsxRuntime = URL.createObjectURL(blobJsxRuntime);

    const script = document.createElement("script");
    script.type = "importmap";
    script.id = "rmtr-react-shim";
    script.textContent = JSON.stringify({
      imports: {
        react: urlReact,
        "react/jsx-runtime": urlJsxRuntime,
      },
    });
    document.head.appendChild(script);
    reactShimInjected = true;
  } catch {
    reactShimInjected = true;
  }
}

// ── Dynamic import ────────────────────────────────────────────────────────
const dynamicImport = typeof window !== "undefined"
  ? (url: string) => import(/* webpackIgnore: true */ url)
  : null;

// ── Hook: load component bundle + render JSX via JsxParser ──────────────

export function useJsxWithImports(
  jsx: string | undefined,
  imports: Record<string, string> | undefined,
  data?: Record<string, string>,
  onError?: (err: unknown, ctx: { source: string }) => void,
): React.ComponentType<any> | null {
  const [wrapper, setWrapper] = React.useState<React.ComponentType<any> | null>(null);
  const handleRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!jsx) return;
    handleRef.current = delayRender("Loading component bundle");

    (async () => {
      ensureReactShim();

      // Load all registered components from the pre-bundled module
      let components: Record<string, React.ComponentType<any>> = {};
      const bundleUrl = (window as any).__componentsBundleUrl;

      if (bundleUrl && dynamicImport) {
        try {
          const bundle = await dynamicImport(bundleUrl);
          components = bundle;
        } catch (e) {
          onError?.(e, { source: jsx! });
        }
      }

      // Bindings: data variables available inside JSX expressions
      const bindings: Record<string, unknown> = {};
      if (data) {
        for (const [k, v] of Object.entries(data)) {
          bindings[k] = v;
        }
      }

      // Wrapper component that renders JsxParser with resolved components
      const Wrapper: React.ComponentType<any> = React.forwardRef((_props, _ref) => {
        return React.createElement(JsxParser, {
          jsx: jsx!,
          components,
          bindings,
          renderInWrapper: false,
          showDefaultNames: false,
        });
      });
      Wrapper.displayName = "JsxWrapper";

      setWrapper(() => Wrapper);
      if (handleRef.current) {
        continueRender(handleRef.current);
        handleRef.current = null;
      }
    })();
  }, [jsx, imports, data, onError]);

  return wrapper;
}

export default function Wrapper({ children }: { children?: React.ReactNode }) {
  return React.createElement(React.Fragment, null, children);
}
