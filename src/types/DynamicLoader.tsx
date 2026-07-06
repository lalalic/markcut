/**
 * Remote component loader for the Remotion engine.
 *
 * Loads React components from URLs at render time. Handles:
 *   - `src` URL bundles (ESM via native dynamic import)
 *   - `jsx` usage expressions (compiled via @babel/standalone loaded via <script>)
 *   - Named exports via `exports` field
 *
 * Uses an import-map shim to prevent React double-bundling: any ESM
 * module that `import`s from `"react"` resolves to the same React
 * instance Remotion already loaded. Combined with `?external=react`
 * on esm.sh URLs for belt-and-suspenders protection.
 */
import * as React from "react";
import * as Remotion from "remotion";
import { delayRender, continueRender } from "remotion";

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

/** Append `external=react&standalone` to esm.sh URLs so they exclude React. */
function externalizeReact(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.endsWith("esm.sh")) {
      const params = new URLSearchParams(u.search);
      if (!params.has("external")) {
        params.set("external", "react");
      } else {
        const val = params.get("external")!;
        if (!val.split(",").includes("react")) {
          params.set("external", `react,${val}`);
        }
      }
      params.set("standalone", "");
      u.search = params.toString();
      return u.toString();
    }
  } catch { /* invalid URL */ }
  return url;
}

// ── Dynamic import ────────────────────────────────────────────────────────
// Native dynamic import() handles esm.sh URLs correctly (sub-imports resolve).
// Blob URLs with relative imports are NOT supported (but we don't need them —
// the Babel-compiled Wrapper has no sub-imports after compilation).
const dynamicImport = typeof window !== "undefined"
  ? (url: string) => import(/* webpackIgnore: true */ url)
  : null;

// ── Module cache ─────────────────────────────────────────────────────────
const cache = new Map<string, React.ComponentType<any>>();
const inflight = new Map<string, Promise<React.ComponentType<any>>>();

async function loadComponent(url: string, exportName?: string): Promise<React.ComponentType<any>> {
  const cacheKey = exportName ? `${url}#${exportName}` : url;
  if (cache.has(cacheKey)) return cache.get(cacheKey)!;

  if (!inflight.has(cacheKey)) {
    const promise = (async () => {
      ensureReactShim();
      const loadUrl = externalizeReact(url);

      if (!dynamicImport) {
        throw new Error("Dynamic import not available in this environment");
      }

      const mod = await dynamicImport(loadUrl);
      let Comp: any;
      if (exportName) {
        Comp = mod[exportName];
      } else {
        Comp = mod.default ?? mod;
      }
      if (typeof Comp !== "function") {
        throw new Error(`Component at ${url} did not export a function${exportName ? ` named "${exportName}"` : ""}. Got: ${typeof Comp}`);
      }
      cache.set(cacheKey, Comp);
      return Comp;
    })();

    inflight.set(cacheKey, promise);
    promise.finally(() => inflight.delete(cacheKey));
  }

  return inflight.get(cacheKey)!;
}

// ── Hook ─────────────────────────────────────────────────────────────────

export function useDynamicComponent(
  url: string | undefined,
  exportName?: string,
  onError?: (err: unknown, ctx: { url: string }) => void,
): React.ComponentType<any> | null {
  const cacheKey = url && exportName ? `${url}#${exportName}` : url ?? null;
  const cached = cacheKey ? cache.get(cacheKey) ?? null : null;
  const needsLoad = !!cacheKey && !cached;

  const handleRef = React.useRef<string | null>(null);
  if (needsLoad && !handleRef.current) {
    handleRef.current = delayRender(`Loading remote component: ${url}`);
  }

  const [Comp, setComp] = React.useState<React.ComponentType<any> | null>(() => cached);

  React.useEffect(() => {
    if (!url || !cacheKey || cached) return;
    let active = true;

    loadComponent(url, exportName)
      .then((C) => {
        if (active) setComp(() => C);
      })
      .catch((err) => {
        onError?.(err, { url: url });
      });

    return () => { active = false; };
  }, [url, cacheKey, exportName, onError]);

  // Continue render when component loads
  React.useEffect(() => {
    if (Comp && handleRef.current) {
      continueRender(handleRef.current);
      handleRef.current = null;
    }
  }, [Comp]);

  return Comp;
}

/** Pre-warm the cache for a list of URLs. */
export function preloadComponents(urls: string[], exportNames?: string[]): Promise<void> {
  ensureReactShim();
  return Promise.all(urls.map((u, i) => loadComponent(u, exportNames?.[i]).catch(() => {}))).then(() => {});
}

// ── Inline JSX compilation via @babel/standalone ─────────────────────────
const jsxCache = new Map<string, React.ComponentType<any>>();
const jsxInflight = new Map<string, Promise<React.ComponentType<any>>>();

let babelPromise: Promise<BabelLike | null> | null = null;

interface BabelLike {
  transform(code: string, opts: Record<string, unknown>): { code: string };
}

async function loadBabel(): Promise<BabelLike | null> {
  if (typeof window === "undefined") return null;
  if (!babelPromise) {
    babelPromise = new Promise((resolve) => {
      // Babel standalone is loaded via <script> tag as window.Babel
      // Poll until it's available (script may load after player.js)
      const check = () => {
        const Babel = (window as any).Babel;
        if (Babel && typeof Babel.transform === "function") {
          resolve(Babel as BabelLike);
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }
  return babelPromise;
}

export function useJsxWithImports(
  jsx: string | undefined,
  imports: Record<string, string> | undefined,
  data?: Record<string, string>,
  onError?: (err: unknown, ctx: { source: string }) => void,
): React.ComponentType<any> | null {
  const cacheKey = React.useMemo(() => {
    if (!jsx) return null;
    const importKeys = imports ? Object.keys(imports).sort().join(",") : "";
    const dataKeys = data ? Object.keys(data).sort().join(",") : "";
    return `${importKeys}|${dataKeys}\n${jsx}`;
  }, [jsx, imports, data]);

  const cached = cacheKey ? jsxCache.get(cacheKey) ?? null : null;
  const needsLoad = !!cacheKey && !cached;

  const handleRef = React.useRef<string | null>(null);
  if (needsLoad && !handleRef.current) {
    handleRef.current = delayRender(`Compiling JSX with imports`);
  }

  const [Comp, setComp] = React.useState<React.ComponentType<any> | null>(() => cached);

  React.useEffect(() => {
    if (!cacheKey || cached) return;
    let active = true;

    compileJsxWithImports(jsx!, imports ?? {}, data ?? {})
      .then((C) => {
        if (active) setComp(() => C);
      })
      .catch((err) => {
        onError?.(err, { source: jsx! });
      });

    return () => { active = false; };
  }, [cacheKey, data, onError]);

  // Continue render when component loads
  React.useEffect(() => {
    if (Comp && handleRef.current) {
      continueRender(handleRef.current);
      handleRef.current = null;
    }
  }, [Comp]);

  return Comp;
}

async function compileJsxWithImports(
  usageJsx: string,
  imports: Record<string, string>,
  data?: Record<string, string>,
): Promise<React.ComponentType<any>> {
  ensureReactShim();

  const names = Object.keys(imports).filter((n) => !imports[n]!.startsWith("__jsx__:"));
  const loaded = new Map<string, React.ComponentType<any>>();
  const loadErrors: string[] = [];

  // ── Try the pre-bundled component module first ──────────────────────
  const bundleUrl = (window as any).__componentsBundleUrl;
  if (bundleUrl && names.length > 0 && dynamicImport) {
    try {
      const bundle = await dynamicImport(bundleUrl);
      for (const name of names) {
        if (typeof bundle[name] === "function") {
          loaded.set(name, bundle[name]);
        }
      }
    } catch (e) {
      loadErrors.push(`bundle: ${(e as Error)?.message || e}`);
    }
  }

  // ── Fallback: load remaining components individually from CDN ──────
  const remaining = names.filter((n) => !loaded.has(n));
  if (remaining.length > 0 && dynamicImport) {
    await Promise.all(
      remaining.map(async (name) => {
        const url = imports[name]!;
        const loadUrl = externalizeReact(url);
        try {
          const mod = await dynamicImport(loadUrl);
          let Comp = mod.default ?? mod;
          // If not a function, scan all exports for the first function
          if (typeof Comp !== "function") {
            const funcs = Object.values(mod).filter((v: any) => typeof v === "function");
            if (funcs.length === 1) Comp = funcs[0];
          }
          if (typeof Comp === "function") {
            loaded.set(name, Comp);
          } else {
            loadErrors.push(`${name}: loaded but not a function (type=${typeof Comp})`);
          }
        } catch (e) {
          loadErrors.push(`${name}: ${(e as Error)?.message || e}`);
        }
      }),
    );
  }

  const Babel = await loadBabel();
  if (!Babel) {
    throw new Error("@babel/standalone failed to load; cannot compile JSX");
  }

  // Check for any failed imports and throw detailed error if critical ones failed
  if (loadErrors.length > 0) {
    const failed = names.filter((n) => !loaded.has(n));
    if (failed.length > 0) {
      console.error("Failed to load imports:", loadErrors);
      throw new Error(
        `Failed to load imports: ${failed.join(", ")}.\nDetails:\n${loadErrors.join("\n")}`
      );
    }
  }

  const importId = `__ri_${Math.random().toString(36).slice(2, 8)}`;
  (window as any)[importId] = Object.fromEntries(loaded);
  try {
    const importDecls = names
      .filter((n) => loaded.has(n))
      .map((n) => `const ${n} = window["${importId}"]["${n}"];`)
      .join("\n");

    const source = `
const React = window.__React;
const { useCurrentFrame, interpolate, spring, useVideoConfig, Easing } = window.__Remotion;

// Mutable refs updated on every render — tween() can read them
var __frame = 0, __fpsVal = 30, __actionDurationFrames = 120;
var __cache = {};
var __easingRegistry = {
  linear: undefined,
  easeIn: Easing.in(Easing.ease),
  easeOut: Easing.out(Easing.ease),
  easeInOut: Easing.inOut(Easing.ease),
  ease: Easing.ease,
};

// tween(from, to, easing) — returns interpolated value for current frame
function tween(from, to, easing) {
  var key = from + ',' + to + ',' + (easing || 'linear');
  if (__cache[key] !== undefined) return __cache[key];
  var easingFn = __easingRegistry[easing] || undefined;
  var val = interpolate(__frame, [0, __actionDurationFrames], [from, to], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easingFn,
  });
  __cache[key] = val;
  return val;
}
// Clear cache when frame or action duration changes
function __clearCache(f, dur) { if (f !== __frame || dur !== __actionDurationFrames) { __frame = f; __actionDurationFrames = dur; __cache = {}; } }

${importDecls}

${data ? Object.entries(data).map(([k, v]) => `var ${k} = ${JSON.stringify(v)};`).join("\n") : ""}

function Wrapper(props) {
  var frame = useCurrentFrame();
  var fps = useVideoConfig().fps;
  var action = props.action || {};
  var startFrame = Math.floor((action.start || 0) * fps);
  var endFrame = Math.floor((action.end || 1) * fps);
  var actionDurationFrames = Math.max(1, endFrame - startFrame);
  __clearCache(frame, actionDurationFrames);
  __fpsVal = fps;
  return (${usageJsx.trim()});
}

export default Wrapper;
`;

    const out = Babel.transform(source, {
      filename: "component.jsx",
      presets: [["react", { runtime: "classic" }], "typescript"],
    });
    const code = out.code ?? source;

    const blob = new Blob([code], { type: "text/javascript" });
    const blobUrl = URL.createObjectURL(blob);
    try {
      const mod = await dynamicImport!(blobUrl);
      const Comp = mod.default ?? mod;
      if (typeof Comp !== "function") {
        throw new Error("Compiled JSX did not export a function");
      }
      jsxCache.set(`${names.sort().join(",")}\n${usageJsx}`, Comp);
      return Comp;
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  } finally {
    delete (window as any)[importId];
  }
}
