/**
 * Asset-relative validation for stream trees.
 *
 * Render contract (2026-08-10): every local asset in the compiled tree is a
 * path RELATIVE to the source folder — the source .md file's folder, the
 * "default root". Remotion serves that folder via `--public-dir` (render) and
 * the player serves it as the document root (preview). Absolute filesystem
 * paths, paths starting with "/", or `..` escapes all break staticFile()
 * resolution → 404 in render / broken media in preview.
 *
 *   validateAssetsRelative(tree, baseDir) → string[]  (empty = all OK)
 *
 * Used by:
 *   - `markcut verify`  — walks the parsed descriptive tree (skips include.src,
 *     which legitimately resolves against its own baseDir)
 *   - `markcut render`  — guards the compiled tree right before rendering
 */
import { isAbsolute, relative, resolve } from "node:path";

const REMOTE_RE = /^(https?:|data:|blob:|file:)/i;
/** Subtitle `src` is only a file when it points at a .vtt — otherwise it is inline caption text. */
const VTT_RE = /\.vtt(?:$|[?#])/i;
const INLINE_VTT_RE = /-->/;

/**
 * Classify a single asset reference:
 *   "remote"        — http(s)/data/blob/file URI, loaded as-is (OK)
 *   "root-absolute" — starts with "/", rooted at the serve root, NOT source-folder-relative (ERROR)
 *   "absolute"      — absolute filesystem path (ERROR)
 *   "escapes"       — relative but starts with ".." (ERROR)
 *   "relative"      — looks safe; callers should re-check against baseDir for nested ".."
 *   "text"          — not a path at all (inline subtitle text / inline VTT body)
 *   "empty"         — falsy
 */
export function classifyAssetPath(src, { subtitle = false } = {}) {
  if (!src) return "empty";
  if (subtitle && (INLINE_VTT_RE.test(src) || !VTT_RE.test(src))) return "text";
  if (REMOTE_RE.test(src)) return "remote";
  if (src.startsWith("/")) return "root-absolute";
  if (isAbsolute(src)) return "absolute";
  if (src.startsWith("..")) return "escapes";
  return "relative";
}

function collectNodeAssets(node, path, out, skipIncludeSrc) {
  if (!node || typeof node !== "object") return;

  if (node.type === "include") {
    // include.src may legitimately point outside baseDir in *descriptive* trees
    // (it is compiled against its own baseDir, then relativized to the outer
    // baseDir). Callers that validate descriptive trees pass skipIncludeSrc.
    if (!skipIncludeSrc && typeof node.src === "string" && node.src) {
      out.push({ node, field: "src", value: node.src, path, subtitle: false });
    }
    // NOTE: include.imports is a module bundle URL (dynamic import), not a
    // staticFile asset — intentionally not validated.
  } else {
    const isSubtitle = node.type === "subtitle";
    if (typeof node.src === "string" && node.src) {
      out.push({ node, field: "src", value: node.src, path, subtitle: isSubtitle });
    }
    if (Array.isArray(node.waypoints)) {
      node.waypoints.forEach((wp, i) => {
        if (wp && typeof wp.media === "string" && wp.media) {
          out.push({ node, field: `waypoints[${i}].media`, value: wp.media, path, subtitle: false });
        }
      });
    }
  }

  if (Array.isArray(node.children)) {
    node.children.forEach((c, i) => collectNodeAssets(c, `${path}.children[${i}]`, out, skipIncludeSrc));
  }
}

/**
 * Collect every asset reference in a tree.
 *
 * @param {object} tree - root node (may carry root.subtitle) or plain node
 * @param {{skipIncludeSrc?: boolean}} [opts]
 * @returns {Array<{node: object, field: string, value: string, path: string, subtitle: boolean}>}
 */
export function collectTreeAssets(tree, { skipIncludeSrc = false } = {}) {
  const out = [];
  if (tree && typeof tree.subtitle === "object" && tree.subtitle &&
      typeof tree.subtitle.src === "string" && tree.subtitle.src) {
    out.push({ node: tree, field: "subtitle.src", value: tree.subtitle.src, path: "root", subtitle: true });
  }
  if (tree && Array.isArray(tree.children)) {
    tree.children.forEach((c, i) => collectNodeAssets(c, `root.children[${i}]`, out, skipIncludeSrc));
  }
  return out;
}

function formatError(ref, problem, baseDir) {
  const where = ref.node?.id
    ? `node "${ref.node.id}"`
    : ref.node?.name
      ? `node "${ref.node.name}"`
      : ref.path;
  const type = ref.node?.type ? ` (type: ${ref.node.type})` : "";
  return [
    `Asset not relative to baseDir: ${where}${type} — field ${ref.field} = "${ref.value}"`,
    `  ${problem}. Local assets must be relative to the source folder: ${baseDir}`,
    `  (e.g. assets/x.png or .markcut/generated/...) — absolute paths and ".." escapes 404 in render`,
    `  because Remotion serves media from --public-dir = the source folder.`,
    `  Fix: re-run resolve/render so the path is emitted source-folder-relative, or move the file under the source folder.`,
  ].join("\n");
}

/**
 * Walk a tree and return actionable errors for every asset that is not
 * relative to `baseDir`. Empty array = all assets are baseDir-relative.
 *
 * @param {object} tree - root node of the (descriptive or compiled) tree
 * @param {string} baseDir - source folder (md file's folder) assets must stay inside
 * @param {{skipIncludeSrc?: boolean}} [opts] - pass skipIncludeSrc:true for descriptive trees
 * @returns {string[]}
 */
export function validateAssetsRelative(tree, baseDir, opts = {}) {
  const errors = [];
  for (const ref of collectTreeAssets(tree, opts)) {
    const kind = classifyAssetPath(ref.value, { subtitle: ref.subtitle });
    let problem = null;
    if (kind === "root-absolute") {
      problem = `It starts with "/" — that is rooted at the serve root, not the source folder`;
    } else if (kind === "absolute") {
      problem = "It is an absolute filesystem path";
    } else if (kind === "escapes") {
      problem = 'It escapes the source folder via ".."';
    } else if (kind === "relative") {
      // Nested ".." like "a/../../x" isn't caught by the prefix check.
      if (relative(baseDir, resolve(baseDir, ref.value)).startsWith("..")) {
        problem = 'It escapes the source folder via ".."';
      }
    }
    if (problem) errors.push(formatError(ref, problem, baseDir));
  }
  return errors;
}
