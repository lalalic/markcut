/**
 * Component bundler — creates a temp npm project from template imports,
 * installs dependencies, and bundles into a single ESM file.
 *
 * Supports:
 *   - npm re-exports: "export { X } from "npm:pkg"  → installs pkg, re-exports X
 *   - inline functions: "export function X() {...}"  → writes to file, re-exports
 *   - @remotion/* packages auto-pinned to the host markcut version
 *
 * Cached by content hash — re-bundling only when dependencies change.
 */

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const CACHE_DIR = join(ROOT, "public", ".component-cache");

/** Cached bundles: hash → { url, exports } */
const BUNDLED = new Map();

/** Cache for host package.json dependency map. */
let _hostDeps = null;
function getHostDeps() {
  if (_hostDeps) return _hostDeps;
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));
  _hostDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  return _hostDeps;
}

/**
 * Resolve the best version for a package name.
 * If the host (markcut) already depends on it, use that exact version
 * (e.g. @remotion/player → "4.0.469"). Otherwise use "latest".
 *
 * Special handling for @remotion/* packages: they must use the SAME version
 * as markcut's own `remotion` dependency to avoid React context mismatches
 * and duplicate module instances at runtime.
 */
function resolveVersion(pkgName) {
  // All @remotion/* packages must match markcut's remotion version
  if (pkgName.startsWith("@remotion/") || pkgName === "remotion") {
    const hostDeps = getHostDeps();
    const remotionVersion = hostDeps["remotion"];
    if (remotionVersion) {
      // Strip semver range (^/~) for exact pinning
      return remotionVersion.replace(/^[\^~]/, "");
    }
  }
  const hostDeps = getHostDeps();
  return hostDeps[pkgName] || "latest";
}

/**
 * Determine which packages should be externalized from the component bundle.
 * These are packages already bundled in the main player.js that must be shared
 * via import map to avoid duplicate React/Remotion instances (which would break
 * context sharing and create multiple copies of singletons).
 *
 * Must stay in sync with the import map entries created in browser.tsx's
 * `__remotionShared` registry. Only packages listed here AND registered in
 * `__remotionShared` get proper import map resolution.
 *
 * Returns an array of esbuild --external arguments.
 */
function getSharedExternals() {
  return [
    // Core React — always needed
    "react",
    "react/jsx-runtime",
    "react-dom",
    // Remotion core — must be shared for context identity
    "remotion",
    // Commonly used @remotion/* sub-packages
    "@remotion/player",
  ];
}

/**
 * Build a component registry bundle from parsed import entries.
 *
 * @param {Array<{name:string, from?:string, jsx?:string, exports?:string}>} entries  — export entries (component registrations)
 * @param {string[]} [extraSpecs]  — additional dependency specs from import statements (e.g. ["react", "npm:lodash"])
 * @returns {Promise<{url:string|null, exports:string[]}>}
 */
export async function bundleFromEntries(entries, extraSpecs = []) {
  if ((!entries || entries.length === 0) && extraSpecs.length === 0) return { url: null, exports: [] };

  // Separate npm imports from inline function definitions
  const npmDeps = [];
  const inlineFuncs = [];

  for (const entry of entries || []) {
    if (entry.from) {
      const pkgName = entry.from.startsWith("npm:") ? entry.from.slice(4) : entry.from;
      const exportName = entry.exports || "default";
      npmDeps.push({ name: entry.name, pkgName, exportName });
    } else if (entry.jsx) {
      inlineFuncs.push({ name: entry.name, source: entry.jsx });
    }
  }

  // Add extra dependency specs (from import statements) that don't overlap with existing npmDeps
  const existingPkgs = new Set(npmDeps.map(d => d.pkgName));
  for (const spec of extraSpecs) {
    const pkgName = spec.startsWith("npm:") ? spec.slice(4) : spec;
    if (!existingPkgs.has(pkgName)) {
      existingPkgs.add(pkgName);
      npmDeps.push({ name: pkgName, pkgName, exportName: null }); // no re-export needed
    }
  }

  // Extract dependencies from inline function sources.
  // Inline functions (export function X() {...}) often contain `import ... from "pkg"`
  // statements (prepended by extractImportLines in the compiler). These packages
  // must be in package.json for esbuild to resolve them. The server only passes
  // `entry.from` specs via extraSpecs — import statements inside inline defs
  // are invisible to the server, so we scan them here.
  for (const inline of inlineFuncs) {
    const re = /from\s+["'`](npm:)?([^"'`\s]+)["'`]/g;
    let m;
    while ((m = re.exec(inline.source)) !== null) {
      const pkgName = m[2];
      // Skip relative paths (./foo, ../foo) and bare URL imports
      if (pkgName.startsWith(".") || /^https?:/.test(pkgName)) continue;
      if (!existingPkgs.has(pkgName)) {
        existingPkgs.add(pkgName);
        npmDeps.push({ name: pkgName, pkgName, exportName: null });
      }
    }
  }

  if (npmDeps.length === 0 && inlineFuncs.length === 0) return { url: null, exports: [] };

  // Create a stable hash from sorted entries
  const all = [...npmDeps, ...inlineFuncs].sort((a, b) => a.name.localeCompare(b.name));
  const hashInput = all.map(e => {
    const kind = e.source ? "inline:" : "npm:";
    const detail = e.source || e.pkgName + "+" + e.exportName;
    return e.name + "=" + kind + detail;
  }).join(",");
  const hash = createHash("md5").update(hashInput).digest("hex").slice(0, 8);

  if (BUNDLED.has(hash)) return BUNDLED.get(hash);

  const dir = join(CACHE_DIR, hash);
  mkdirSync(dir, { recursive: true });

  // Build package.json with all dependencies
  const pkgJson = { type: "module", private: true, dependencies: {} };
  for (const dep of npmDeps) {
    pkgJson.dependencies[dep.pkgName] = resolveVersion(dep.pkgName);
  }
  writeFileSync(join(dir, "package.json"), JSON.stringify(pkgJson, null, 2));

  // Build index.js — one file per inline function + re-exports for npm
  const lines = [];
  for (const inline of inlineFuncs) {
    writeFileSync(join(dir, inline.name + ".jsx"), inline.source + "\n");
    lines.push("export { " + inline.name + " } from \"./" + inline.name + '.jsx";');
  }
  for (const dep of npmDeps) {
    if (dep.exportName === null) {
      // Side-effect / internal dep — add bare import so the module is loaded
      // for its side effects (e.g. `import "@remotion/tailwind-v4"`).
      // Inline function sources may also import this package, but a second
      // bare import is harmless (ESM caches the module).
      lines.push('import "' + dep.pkgName + '";');
      continue;
    }
    if (dep.exportName === "default") {
      // Default export: use namespace import with fallback chain
      lines.push(
        'import * as __' + dep.name + ' from "' + dep.pkgName + '";' +
        '\nconst ' + dep.name + ' = __' + dep.name + '.default ?? __' + dep.name + '.' + dep.name +
        ' ?? Object.values(__' + dep.name + ').find(v => typeof v === "function" || v?.$$typeof);' +
        '\nexport { ' + dep.name + ' };'
      );
    } else {
      lines.push('export { ' + dep.exportName + ' as ' + dep.name + ' } from "' + dep.pkgName + '";');
    }
  }
  writeFileSync(join(dir, "index.js"), lines.join("\n\n") + "\n");

  // npm install (skip if node_modules already exists)
  if (!existsSync(join(dir, "node_modules"))) {
    const depNames = npmDeps.map(d => d.pkgName);
    console.log("  \ud83d\udce6 Installing components: " + depNames.join(", "));
    try {
      execSync("npm install --no-audit --no-fund --prefer-offline --loglevel=error", {
        cwd: dir,
        stdio: "pipe",
        timeout: 60000,
      });
    } catch (e) {
      console.error("  \u26a0\ufe0f  npm install failed:", e.stderr?.toString().slice(0, 300));
      throw new Error("Failed to install dependencies: " + (e.stderr?.toString().slice(0, 200) || e.message));
    }
  } else {
    console.log("  \ud83d\udce6 Dependencies cached");
  }

  // Bundle with esbuild
  // Externalize shared packages (React, Remotion, @remotion/*) so the component
  // bundle uses the same instances already loaded in the main player.js via import map.
  // Also externalize node: protocol imports (node:module, etc.) which are not
  // available in browser contexts — some packages use them for build-time helpers
  // that aren't actually called during rendering.
  const outFile = join(CACHE_DIR, hash + ".js");
  const externals = getSharedExternals();
  const externalArgs = [
    ...externals.map(p => `--external:${p}`),
    "--external:node:*",
  ].join(" ");
  if (!existsSync(outFile)) {
    console.log("  \ud83d\udd27 Bundling components \u2192 " + hash + ".js");
    try {
      execSync(
        'npx esbuild index.js --bundle --format=esm --outfile="' + outFile + '" ' +
        externalArgs + " " +
        "--platform=browser --target=es2020",
        { cwd: dir, stdio: "pipe", timeout: 30000 }
      );
    } catch (e) {
      console.error("  \u26a0\ufe0f  esbuild failed:", e.stderr?.toString().slice(0, 300));
      throw new Error("Failed to bundle components: " + (e.stderr?.toString().slice(0, 200) || e.message));
    }
  } else {
    console.log("  \ud83d\udce6 Components cached \u2192 " + hash + ".js");
  }

  const result = {
    url: outFile,
    exports: all.filter(e => e.exportName !== null).map(e => e.name),
  };
  BUNDLED.set(hash, result);
  return result;
}
