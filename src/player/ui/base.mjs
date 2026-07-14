/**
 * Base HTML template for the markcut player.
 * Shared structure used by all modes (preview, edit, label).
 *
 * Usage:
 *   getBaseHtml({ title, variantLabel, variantConfigs, headerContent, bottomContent, extraStyles, extraHead, extraScripts })
 *
 * Parameters:
 *   title          – <title> suffix (e.g. " — Edit", " — Label")
 *   variantLabel   – current variant label (e.g. "default", "zh-tiktok")
 *   variantConfigs – array of { label } for the variant switcher
 *   headerContent  – HTML string for the #header bar (close button, status, etc.)
 *   bottomContent  – HTML string for the #bottom-bar content
 *   extraStyles    – additional <style> CSS (appended after shared styles)
 *   extraHead      – additional <head> content (meta, scripts before player.js)
 *   extraScripts   – additional inline <script> blocks (before closing </body>)
 *   modeFlags      – object { label?: boolean, edit?: boolean }
 *   showVariantBar – whether to show the variant switcher bar (default: true)
 */
export function getBaseHtml({
  title = "",
  variantLabel = "default",
  variantConfigs = [],
  headerContent = "",
  bottomContent = "",
  extraStyles = "",
  extraHead = "",
  extraScripts = "",
  modeFlags = {},
  showVariantBar = true,
} = {}) {
  const hasLabel = modeFlags.label ? "true" : "false";
  const hasEdit = modeFlags.edit ? "true" : "false";

  // Build variant switcher links
  const variantLinks = variantConfigs.map(c =>
    `<a href="/${c.label === "default" ? "" : c.label}" class="variant-link${c.label === variantLabel ? " active" : ""}">${c.label}</a>`
  ).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Remotion Player${title}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; overflow: hidden; background: #0a0a0a; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; flex-direction: column; align-items: center; }
  #header { display: flex; align-items: center; justify-content: flex-end; width: 100%; max-width: 500px; padding: 8px 12px; flex-shrink: 0; gap: 8px; }
  #header-status { font-size: 11px; color: rgba(255,255,255,.4); flex: 1; text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #header-actions { display: flex; gap: 6px; align-items: center; flex-shrink: 0; }
  #close-btn { width: 22px; height: 22px; border-radius: 50%; border: 1px solid rgba(255,255,255,.15); background: rgba(0,0,0,.3); color: rgba(255,255,255,.4); font-size: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all .15s; }
  #close-btn:hover { background: rgba(255,60,60,.4); border-color: rgba(255,60,60,.5); color: #fff; }
  #variant-bar { display: flex; gap: 4px; align-items: center; width: 100%; max-width: 500px; padding: 6px 12px; flex-shrink: 0; overflow-x: auto; }
  .variant-link { font-size: 11px; padding: 3px 10px; border-radius: 12px; background: rgba(255,255,255,.06); color: rgba(255,255,255,.4); text-decoration: none; white-space: nowrap; transition: all .15s; }
  .variant-link:hover { background: rgba(255,255,255,.12); color: rgba(255,255,255,.7); }
  .variant-link.active { background: rgba(74,158,255,.2); color: #4a9eff; }
  #player-frame { flex: 1; width: 100%; max-width: 480px; min-height: 0; border-radius: 16px; overflow: hidden; border: 1px solid rgba(255,255,255,.08); background: #000; box-shadow: 0 4px 40px rgba(0,0,0,.6); margin: 0 12px; }
  #root { width: 100%; height: 100%; }
  #reload-toast { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(74,158,255,.9); color: #fff; padding: 12px 24px; border-radius: 10px; font-size: 14px; font-weight: 600; opacity: 0; transition: opacity .3s; pointer-events: none; z-index: 200; backdrop-filter: blur(8px); }
  #reload-toast.show { opacity: 1; }
  #bottom-bar { display: flex; gap: 6px; align-items: center; width: 100%; max-width: 500px; padding: 8px 12px; flex-shrink: 0; }
  #edit-input { flex: 1; padding: 8px 12px; border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.05); color: #eee; border-radius: 8px; font-size: 13px; outline: none; transition: border-color .15s; }
  #edit-input:focus { border-color: rgba(74,158,255,.5); }
  #edit-input::placeholder { color: rgba(255,255,255,.25); }
  #edit-btn { width: 32px; height: 32px; padding: 0; background: rgba(255,255,255,.06); color: rgba(255,255,255,.5); border: 1px solid rgba(255,255,255,.1); border-radius: 8px; cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center; transition: all .15s; flex-shrink: 0; }
  #edit-btn:hover { background: rgba(74,158,255,.2); border-color: rgba(74,158,255,.4); color: #4a9eff; }
  #edit-btn:disabled { opacity: 0.3; cursor: wait; }
  ${extraStyles}
</style>
${extraHead}
</head>
<body>
<script>window.VARIANT = "${variantLabel}";</script>

${headerContent}

${showVariantBar && variantConfigs.length > 1 ? `<div id="variant-bar">${variantLinks}</div>` : ""}

<div id="player-frame">
  <div id="root"></div>
</div>
<div id="reload-toast">🔄 JSON changed — reloading...</div>

${bottomContent}

<script src="/player.js" type="module"></script>

${extraScripts}
</body>
</html>`;
}
