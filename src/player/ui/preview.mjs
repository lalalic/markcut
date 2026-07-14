/**
 * Preview mode UI for the markcut player.
 *
 * Simple player with variant switcher. No edit or label controls.
 */
import { getBaseHtml } from "./base.mjs";

/**
 * Generate the full HTML page for preview mode.
 *
 * @param {object} opts
 * @param {string} opts.variantLabel
 * @param {Array}  opts.variantConfigs
 * @returns {string} HTML
 */
export function getPreviewHtml({ variantLabel = "default", variantConfigs = [] } = {}) {
  return getBaseHtml({
    title: "",
    variantLabel,
    variantConfigs,
    modeFlags: {},
    showVariantBar: variantConfigs.length > 1,
  });
}
