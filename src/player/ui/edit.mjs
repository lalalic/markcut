/**
 * Edit mode UI controls for the markcut player.
 *
 * Provides the header with close button, bottom edit input bar,
 * and all client-side JavaScript for SSE reload and edit API.
 */
import { getBaseHtml } from "./base.mjs";

/**
 * Generate the full HTML page for edit mode.
 *
 * @param {object} opts
 * @param {string} opts.variantLabel
 * @param {Array}  opts.variantConfigs
 * @returns {string} HTML
 */
export function getEditHtml({ variantLabel = "default", variantConfigs = [] } = {}) {
  const headerContent = `
<div id="header">
  <span id="header-status"></span>
  <div id="header-actions">
    <button id="close-btn" title="Close player and return to terminal">✕</button>
  </div>
</div>`;

  const bottomContent = `
<div id="bottom-bar">
  <input id="edit-input" placeholder="What should change? e.g. make text bigger" />
  <button id="edit-btn" title="Apply edit">&#x2728;</button>
</div>`;

  const extraScripts = `
<script>
// ─── SSE reload ───────────────────────────────────────────────────────
const evtSource = new EventSource("/api/events");
evtSource.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === "reload" && !suppressReload) {
    window.dispatchEvent(new Event("refresh-player"));
  }
};

// ─── Close button ─────────────────────────────────────────────────────
document.getElementById("close-btn")?.addEventListener("click", () => {
  navigator.sendBeacon("/api/shutdown", "{}");
  document.body.innerHTML = "<div style='display:flex;align-items:center;justify-content:center;height:100vh;background:#0a0a0a;color:#555;font-family:sans-serif;font-size:16px'>\u2B61 player closed \u2014 return to terminal</div>";
});

// ─── Edit input ───────────────────────────────────────────────────────
const editInput = document.getElementById("edit-input");
const editBtn = document.getElementById("edit-btn");
const headerStatus = document.getElementById("header-status");

let suppressReload = false;

async function applyEdit() {
  const text = editInput.value.trim();
  if (!text) return;
  editBtn.disabled = true;
  headerStatus.textContent = "\u231B editing...";
  editInput.value = "";
  suppressReload = true;
  try {
    const res = await fetch("/api/edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    if (res.ok) {
      const summary = (data.output || "done").split("\\n")[0].slice(0, 65);
      headerStatus.textContent = summary;
      setTimeout(() => { suppressReload = false; window.dispatchEvent(new Event("refresh-player")); }, 4000);
    } else {
      headerStatus.textContent = "\u274C " + (data.error || "failed");
      suppressReload = false;
    }
  } catch (e) {
    headerStatus.textContent = "\u274C error";
    suppressReload = false;
  }
  editBtn.disabled = false;
}

editBtn?.addEventListener("click", applyEdit);
editInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); applyEdit(); }
});
</script>`;

  return getBaseHtml({
    title: " — Edit",
    variantLabel,
    variantConfigs,
    headerContent,
    bottomContent,
    extraScripts,
    modeFlags: { edit: true },
    showVariantBar: variantConfigs.length > 1,
  });
}
