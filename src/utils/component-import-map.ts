/**
 * Shared-module import map for dynamically loaded component bundles.
 *
 * Component bundles are built with react/react-dom/remotion marked as
 * --external (see player/bundler.mjs getSharedExternals), so their output
 * contains bare imports like `import { useState } from "react"`. The page
 * that dynamically imports such a bundle must provide an import map that
 * resolves those bare specifiers back to the already-loaded module
 * instances — otherwise the import fails ("Failed to resolve module
 * specifier") or, worse, a duplicate React breaks hooks and context.
 *
 * The preview player injects this map itself (player/browser.tsx). This
 * helper provides the same shim for the Remotion render page (headless
 * Chrome during `markcut render`). Both use the `#rmtr-import-map` guard,
 * so whichever runs first wins and the other becomes a no-op.
 */
import * as React from "react";
import * as ReactDOM from "react-dom";
import * as Remotion from "remotion";
import * as MarkcutComponents from "../components/index";

export function ensureSharedImportMap(): void {
  if (typeof document === "undefined") return;
  if (document.querySelector("#rmtr-import-map")) return;

  const g = globalThis as any;
  g.__remotionShared ??= {};
  g.__remotionShared["react"] ??= React;
  g.__remotionShared["react-dom"] ??= ReactDOM;
  g.__remotionShared["remotion"] ??= Remotion;
  g.__remotionShared["@lalalic/markcut"] ??= MarkcutComponents;

  // Stub for node:* imports that some component deps reference at module
  // level for build-time helpers never called during rendering.
  if (!g.__nodeModuleStub) {
    const nodeModuleStubCode = `export function createRequire() { return () => ({ resolve: () => { throw new Error("node:module.createRequire is not available in the browser"); } }); }`;
    g.__nodeModuleStub = URL.createObjectURL(
      new Blob([nodeModuleStubCode], { type: "application/javascript" }),
    );
  }

  try {
    const imports: Record<string, string> = {};
    for (const spec of ["node:module", "node:fs", "node:path", "node:os"]) {
      imports[spec] = g.__nodeModuleStub;
    }

    for (const [specifier, mod] of Object.entries(g.__remotionShared) as [string, any][]) {
      const lines: string[] = [
        `const _mod = globalThis.__remotionShared[${JSON.stringify(specifier)}];`,
      ];
      for (const name of Object.keys(mod)) {
        if (name === "default") continue;
        lines.push(
          `const __${name} = _mod[${JSON.stringify(name)}];`,
          `export { __${name} as ${name} };`,
        );
      }
      if ("default" in mod) lines.push("export default _mod.default;");
      imports[specifier] = URL.createObjectURL(
        new Blob([lines.join("\n")], { type: "application/javascript" }),
      );
    }

    // react/jsx-runtime — built manually because it's a sub-path of react.
    const blobJsx = new Blob(
      [
        `
        const R = globalThis.__remotionShared["react"];
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
    imports["react/jsx-runtime"] = URL.createObjectURL(blobJsx);

    const script = document.createElement("script");
    script.type = "importmap";
    script.id = "rmtr-import-map";
    script.textContent = JSON.stringify({ imports });
    document.head.appendChild(script);
  } catch (e) {
    console.warn("Failed to create shared module import map:", e);
  }
}
