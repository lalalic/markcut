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
 * Parse an npm specifier into package name and full import specifier.
 *
 * Examples:
 *   "npm:recharts"                   → { pkgName: "recharts",             importSpecifier: "recharts" }
 *   "npm:react-markdown"             → { pkgName: "react-markdown",      importSpecifier: "react-markdown" }
 *   "npm:@remotion/effects"          → { pkgName: "@remotion/effects",   importSpecifier: "@remotion/effects" }
 *   "npm:@remotion/effects/checkerboard" → { pkgName: "@remotion/effects", importSpecifier: "@remotion/effects/checkerboard" }
 *   "npm:package/sub/path"           → { pkgName: "package",             importSpecifier: "package/sub/path" }
 *
 * The pkgName is used for package.json dependencies (npm install).
 * The importSpecifier is used in import/export statements (esbuild resolves it
 * via the installed package's exports map).
 */
function parseNpmSpec(spec) {
  const raw = spec.startsWith("npm:") ? spec.slice(4) : spec;
  // Scoped package: @scope/name[/subpath]
  if (raw.startsWith("@")) {
    const parts = raw.split("/");
    // @scope/name is the package (first two slash-delimited parts)
    const pkgName = parts.slice(0, 2).join("/");
    return { pkgName, importSpecifier: raw };
  }
  // Unscoped package: package[/subpath]
  const slashIdx = raw.indexOf("/");
  if (slashIdx === -1) {
    return { pkgName: raw, importSpecifier: raw };
  }
  return { pkgName: raw.slice(0, slashIdx), importSpecifier: raw };
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
 * @param {string} [rawSource]  — optional raw imports block source. If provided, used as the bundle entry
 *   instead of rebuilding from entries. Entries/extraSpecs are still used for dependency resolution.
 * @returns {Promise<{url:string|null, exports:string[]}>}
 */
export async function bundleFromEntries(entries, extraSpecs = [], rawSource = null) {
  const hasEntries = entries && entries.length > 0;
  const hasRaw = rawSource && rawSource.trim();

  // Separate npm imports from inline function definitions
  const npmDeps = [];

  // Strip npm: prefixes from the raw source so esbuild can resolve them
  if (hasRaw) {
    rawSource = rawSource.replace(/from\s+["'`]npm:([^"'`]+)["'`]/g, 'from "$1"');

    // Extract deps from raw source using the same pattern as extractDependencySpecs
    const fromRe = /from\s+["'`](.+?)["'`]\s*;?\s*$/gm;
    let m;
    while ((m = fromRe.exec(rawSource)) !== null) {
      extraSpecs.push(m[1]);
    }
    // Also catch bare side-effect imports: import "spec"
    const bareRe = /^import\s+["'`](.+?)["'`]\s*;?\s*$/gm;
    while ((m = bareRe.exec(rawSource)) !== null) {
      extraSpecs.push(m[1]);
    }
  }

  if (hasEntries) {
    for (const entry of entries) {
      if (entry.from) {
        const { pkgName, importSpecifier } = parseNpmSpec(entry.from);
        const exportName = entry.exports || "default";
        npmDeps.push({ name: entry.name, pkgName, importSpecifier, exportName });
      }
      // entry.name-only entries (inline function defs) are handled by rawSource — no separate inline file needed
    }
  }

  // Add extra dependency specs that don't overlap with existing npmDeps
  const existingPkgs = new Set(npmDeps.map(d => d.pkgName));
  for (const spec of extraSpecs) {
    const { pkgName, importSpecifier } = parseNpmSpec(spec);
    if (!existingPkgs.has(pkgName)) {
      existingPkgs.add(pkgName);
      npmDeps.push({ name: importSpecifier, pkgName, importSpecifier, exportName: null }); // no re-export needed
    }
  }

  if (npmDeps.length === 0 && !hasRaw) return { url: null, exports: [] };

  // Create a stable hash from sorted inputs
  const hashInput = hasRaw
    ? rawSource
    : sortedDeps.map(d => d.name + "=npm:" + d.importSpecifier + "+" + d.exportName).join(",");
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

  // Build index.jsx — always use rawSource (the original imports block content)
  // Name it .jsx so esbuild enables JSX parsing automatically
  const lines = hasRaw ? [rawSource] : [];
  const entryFile = "index.jsx";
  writeFileSync(join(dir, entryFile), lines.join("\n\n") + "\n");

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
        'npx esbuild ' + entryFile + ' --bundle --format=esm --outfile="' + outFile + '" ' +
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

  // Extract export names from raw source for the log message
  let exportNames;
  if (hasRaw) {
    exportNames = [];
    const exportRe = /export\s+(?:\{([^}]+)\}|function\s+(\w+)|default\s+(\w+))/g;
    let m;
    while ((m = exportRe.exec(rawSource)) !== null) {
      if (m[1]) {
        // export { Name1, Name2 } or export { Name } from "..."
        m[1].split(",").forEach(p => {
          const trimmed = p.trim();
          if (trimmed) exportNames.push(trimmed);
        });
      } else if (m[2]) {
        // export function Name(...)
        exportNames.push(m[2]);
      } else if (m[3]) {
        // export default Name
        exportNames.push(m[3]);
      }
    }
  } else {
    exportNames = (entries || []).map(e => e.name).filter(Boolean);
  }

  const result = {
    url: outFile,
    exports: exportNames,
  };
  BUNDLED.set(hash, result);
  return result;
}
