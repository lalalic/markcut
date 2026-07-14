/**
 * UI control components for the markcut player.
 *
 * Each module exports a function that returns the full HTML page
 * for that mode. All modes share the base HTML template from ./base.mjs.
 *
 * Usage:
 *   import { getLabelHtml, getEditHtml, getPreviewHtml } from "./ui/index.mjs";
 *   const html = getLabelHtml({ variantLabel: "default", variantConfigs });
 */

import { getLabelHtml } from "./label.mjs";
import { getEditHtml } from "./edit.mjs";
import { getPreviewHtml } from "./preview.mjs";
export { getBaseHtml } from "./base.mjs";
export { getLabelHtml, getEditHtml, getPreviewHtml };

/**
 * Get the appropriate HTML page for the given mode.
 *
 * @param {"label"|"edit"|"preview"} mode
 * @param {object} opts
 * @returns {string} HTML
 */
export function getHtmlForMode(mode, opts = {}) {
  switch (mode) {
    case "label":
      return getLabelHtml(opts);
    case "edit":
      return getEditHtml(opts);
    case "preview":
    default:
      return getPreviewHtml(opts);
  }
}
