/**
 * Label mode UI controls for the markcut player.
 *
 * Provides the HTML header (scene info), thumbnails strip, timed labels list,
 * bottom label input, and all client-side JavaScript for label operations.
 */
import { getBaseHtml } from "./base.mjs";

/**
 * Generate the full HTML page for label mode.
 *
 * @param {object} opts
 * @param {string} opts.variantLabel
 * @param {Array}  opts.variantConfigs
 * @returns {string} HTML
 */
export function getLabelHtml({ variantLabel = "default", variantConfigs = [] } = {}) {
  const extraStyles = `
  #scene-info { font-size: 11px; color: rgba(255,255,255,.4); flex: 1; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #thumbnails { display: flex; gap: 6px; width: 100%; max-width: 500px; padding: 4px 12px; flex-shrink: 0; overflow-x: auto; scrollbar-width: thin; }
  #thumbnails::-webkit-scrollbar { height: 4px; }
  #thumbnails::-webkit-scrollbar-thumb { background: rgba(255,255,255,.15); border-radius: 2px; }
  .thumb-item { flex-shrink: 0; width: 64px; height: 48px; border-radius: 6px; overflow: hidden; cursor: pointer; border: 2px solid transparent; transition: all .15s; position: relative; background: rgba(255,255,255,.05); }
  .thumb-item:hover { border-color: rgba(74,158,255,.4); }
  .thumb-item.active { border-color: #4a9eff; box-shadow: 0 0 8px rgba(74,158,255,.3); }
  .thumb-item img { width: 100%; height: 100%; object-fit: cover; }
  .thumb-item .thumb-badge { position: absolute; top: 2px; right: 2px; width: 10px; height: 10px; border-radius: 50%; background: #4ade80; border: 1px solid rgba(0,0,0,.4); display: none; }
  .thumb-item .thumb-badge.has-label { display: block; }
  #label-input { flex: 1; padding: 8px 12px; border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.05); color: #eee; border-radius: 8px; font-size: 13px; outline: none; transition: border-color .15s; }
  #label-input:focus { border-color: rgba(74,158,255,.5); }
  #label-input::placeholder { color: rgba(255,255,255,.25); }
  #label-btn { width: 32px; height: 32px; padding: 0; background: rgba(255,255,255,.06); color: rgba(255,255,255,.5); border: 1px solid rgba(255,255,255,.1); border-radius: 8px; cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center; transition: all .15s; flex-shrink: 0; }
  #label-btn:hover { background: rgba(74,158,255,.2); border-color: rgba(74,158,255,.4); color: #4a9eff; }
  #label-btn:disabled { opacity: 0.3; cursor: wait; }
  #timed-labels { width: 100%; max-width: 500px; padding: 2px 12px; flex-shrink: 0; display: flex; flex-direction: column; gap: 2px; max-height: 80px; overflow-y: auto; }
  .timed-label { display: flex; align-items: center; gap: 6px; padding: 3px 6px; border-radius: 4px; background: rgba(255,255,255,.04); font-size: 11px; color: rgba(255,255,255,.6); }
  .timed-label .tl-time { flex-shrink: 0; font-family: monospace; font-size: 10px; color: rgba(74,158,255,.7); min-width: 32px; }
  .timed-label .tl-text { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .timed-label .tl-del { width: 16px; height: 16px; border: none; background: rgba(255,60,60,.15); color: rgba(255,60,60,.5); border-radius: 3px; cursor: pointer; font-size: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; padding: 0; line-height: 1; }
  .timed-label .tl-del:hover { background: rgba(255,60,60,.3); color: #fff; }
  #saved-toast { position: fixed; bottom: 70px; left: 50%; transform: translateX(-50%); background: rgba(74,222,128,.9); color: #fff; padding: 8px 16px; border-radius: 8px; font-size: 12px; font-weight: 500; opacity: 0; transition: opacity .3s; pointer-events: none; z-index: 200; backdrop-filter: blur(8px); }
  #saved-toast.show { opacity: 1; }
  `;

  const headerContent = `
<div id="header">
  <span id="scene-info"></span>
  <div id="header-actions">
    <button id="close-btn" title="Close">✕</button>
  </div>
</div>
<div id="thumbnails"></div>
<div id="timed-labels"></div>
<div id="saved-toast">✓ Label saved</div>`;

  const bottomContent = `
<div id="bottom-bar">
  <input id="label-input" placeholder="Add label for current scene…" />
  <button id="label-btn" title="Save label">&#x1F4DD;</button>
</div>`;

  const extraScripts = `
<script>
// ─── State ────────────────────────────────────────────────────────────
var labelData = {};
var currentTime = 0;
var currentSceneIndex = 0;
var selectedSceneOverride = -1;

// ─── DOM refs ─────────────────────────────────────────────────────────
var labelInput = document.getElementById("label-input");
var labelBtn = document.getElementById("label-btn");
var savedToast = document.getElementById("saved-toast");
var sceneInfo = document.getElementById("scene-info");
var cachedInfo = null;

// ─── Load existing labels from stream tree ───────────────────────────
fetch("/api/labels").then(function(r) {
  if (r.ok) return r.json();
  return null;
}).then(function(tree) {
  if (tree) {
    var root = tree.root || tree;
    var children = root.children || [];
    for (var i = 0; i < children.length; i++) {
      var media = (children[i].children || [])[0];
      if (media && media.userHints) {
        labelData[i] = { overall: media.userHints.overall || "", timed: media.userHints.timed || {} };
      } else if (media && media.description) {
        labelData[i] = { overall: media.description, timed: {} };
      }
    }
  }
  loadSceneInfo();
}).catch(function() {});

// ─── Scene info & thumbnails ─────────────────────────────────────────
function loadSceneInfo(refresh) {
  if (cachedInfo && !refresh) {
    updateSceneInfo(cachedInfo);
    return;
  }
  fetch("/api/video-info").then(function(r) { return r.json(); }).then(function(info) {
    if (info.scenes && info.totalDuration) {
      cachedInfo = info;
      updateSceneInfo(info);
    }
  }).catch(function() {
    if (cachedInfo) updateSceneInfo(cachedInfo);
  });
}

function updateSceneInfo(info) {
  if (!sceneInfo) return;
  var scenes = info.scenes || [];
  var prevIndex = currentSceneIndex;
  if (selectedSceneOverride >= 0) {
    var selScene = scenes[selectedSceneOverride];
    if (selScene) {
      currentSceneIndex = selectedSceneOverride;
      sceneInfo.textContent = selScene.name + " (selected)";
      if (prevIndex !== currentSceneIndex) { updateLabelInput(); updateTimedLabelsUI(); }
      renderThumbnails(info);
      return;
    }
  }
  var currentScene = null;
  for (var i = 0; i < scenes.length; i++) {
    if (currentTime >= scenes[i].start && currentTime < scenes[i].end) {
      currentScene = scenes[i];
      currentSceneIndex = i;
      break;
    }
  }
  if (currentScene) {
    sceneInfo.textContent = currentScene.name + " (" + currentTime.toFixed(1) + "s)";
  } else {
    sceneInfo.textContent = currentTime.toFixed(1) + "s";
  }
  if (prevIndex !== currentSceneIndex) { updateLabelInput(); updateTimedLabelsUI(); }
  if (prevIndex !== currentSceneIndex) renderThumbnails(info);
}

function renderThumbnails(info) {
  var container = document.getElementById("thumbnails");
  if (!container) return;
  var scenes = info.scenes || [];
  var html = "";
  var isVideoExt = {".mov":1,".mp4":1,".avi":1,".mkv":1,".webm":1,".m4v":1,".wmv":1};
  for (var i = 0; i < scenes.length; i++) {
    var s = scenes[i];
    var isActive = i === currentSceneIndex ? " active" : "";
    var d = labelData[i];
    var hasLabel = (d && (d.overall || Object.keys(d.timed).length > 0)) ? " has-label" : "";
    var thumbSrc = s.src || "";
    var ext = thumbSrc.substring(thumbSrc.lastIndexOf(".")).toLowerCase();
    var isVideo = isVideoExt[ext] || false;
    var img;
    if (thumbSrc && !isVideo) {
      img = "<img src='" + thumbSrc + "' alt='' loading='lazy' />";
    } else if (thumbSrc && isVideo) {
      img = "<video src='" + thumbSrc + "' muted preload='metadata' style='width:100%;height:100%;object-fit:cover'></video>";
    } else {
      img = "<div style='width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.08);color:rgba(255,255,255,.3);font-size:16px;font-weight:600'>" + (s.name || "S" + (i+1)).slice(0,2).toUpperCase() + "</div>";
    }
    html += "<div class='thumb-item" + isActive + "' data-index='" + i + "'>"
      + img
      + "<div class='thumb-badge" + hasLabel + "'></div>"
      + "</div>";
  }
  container.innerHTML = html;
}

function updateLabelInput() {
  var data = labelData[currentSceneIndex];
  if (labelInput) {
    labelInput.value = (data && data.overall) || "";
  }
}

function updateTimedLabelsUI() {
  var container = document.getElementById("timed-labels");
  if (!container) return;
  var data = labelData[currentSceneIndex];
  var timed = (data && data.timed) || {};
  var keys = Object.keys(timed).sort();
  var html = "";
  for (var k of keys) {
    var sec = parseInt(k.replace("at_", "")) / 1000;
    var mm = Math.floor(sec / 60);
    var ss = Math.floor(sec % 60);
    html += "<div class='timed-label' data-key='" + k + "'><span class='tl-time'>" + mm + ":" + String(ss).padStart(2,"0") + "</span><span class='tl-text'>" + escapedHtml(timed[k]) + "</span><button class='tl-del' title='Remove' data-key='" + k + "'>\u00d7</button></div>";
  }
  container.innerHTML = html;
}

function escapedHtml(s) {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// ─── Thumbnail click delegation ──────────────────────────────────────
document.getElementById("thumbnails")?.addEventListener("click", function(e) {
  var item = e.target.closest(".thumb-item");
  if (item) {
    var index = parseInt(item.getAttribute("data-index"), 10);
    if (!isNaN(index)) seekToScene(index);
  }
});

function seekToScene(index) {
  selectedSceneOverride = index;
  currentSceneIndex = index;
  updateLabelInput();
  updateTimedLabelsUI();
  loadSceneInfo();
  fetch("/api/video-info").then(function(r) { return r.json(); }).then(function(info) {
    var scene = (info.scenes || [])[index];
    if (scene && window.__remotionSeekTo) {
      window.__remotionSeekTo(scene.start);
    }
  }).catch(function() {});
}

// ─── Poll player time ────────────────────────────────────────────────
setInterval(function() {
  var playerText = document.getElementById("player-frame")?.textContent || "";
  var match = playerText.match(/(\\d+):(\\d+)\\s*\\//);
  if (match) {
    var prevTime = currentTime;
    currentTime = parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
    if (prevTime !== currentTime && prevTime > 0 && selectedSceneOverride >= 0) {
      selectedSceneOverride = -1;
    }
  }
  loadSceneInfo();
}, 1000);

// ─── Label save ──────────────────────────────────────────────────────
function showSavedToast() {
  savedToast?.classList.add("show");
  setTimeout(function() { savedToast?.classList.remove("show"); }, 2000);
}

function saveLabel() {
  var text = labelInput.value.trim();
  if (!text) return;
  labelBtn.disabled = true;

  var sceneIndex = currentSceneIndex;
  var timeMs = Math.round(currentTime * 1000);

  if (!labelData[sceneIndex]) labelData[sceneIndex] = { overall: "", timed: {} };
  var scenes = cachedInfo ? cachedInfo.scenes : [];
  var scene = scenes[sceneIndex];
  var isImage = scene && scene.mediaType === "image";
  var sceneStart = scene ? scene.start * 1000 : 0;

  if (isImage || timeMs - sceneStart < 1000) {
    labelData[sceneIndex].overall = text;
  } else {
    labelData[sceneIndex].timed["at_" + timeMs] = text;
  }

  fetch("/api/labels", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sceneIndex: sceneIndex,
      description: text,
      time: currentTime,
      overall: !(isImage || timeMs - sceneStart < 1000) ? undefined : true,
    }),
  }).then(function(res) {
    if (res.ok) {
      labelInput.value = "";
      showSavedToast();
      updateTimedLabelsUI();
      renderThumbnails(cachedInfo);
    }
  }).catch(function(e) {
    console.error("Failed to save label:", e);
  }).finally(function() {
    labelBtn.disabled = false;
  });
}

labelBtn?.addEventListener("click", saveLabel);
labelInput?.addEventListener("keydown", function(e) {
  if (e.key === "Enter") { e.preventDefault(); saveLabel(); }
});

// ─── Timed label delete delegation ───────────────────────────────────
document.addEventListener("click", function(e) {
  var delBtn = e.target.closest(".tl-del");
  if (!delBtn) return;
  var key = delBtn.getAttribute("data-key");
  if (!key) return;
  var sceneIndex = currentSceneIndex;
  if (labelData[sceneIndex] && labelData[sceneIndex].timed[key]) {
    delete labelData[sceneIndex].timed[key];
    fetch("/api/labels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sceneIndex: sceneIndex,
        description: labelData[sceneIndex].overall || "",
        removeTimed: key,
      }),
    }).then(function(res) {
      if (res.ok) updateTimedLabelsUI();
    });
  }
});

// ─── Close button ────────────────────────────────────────────────────
document.getElementById("close-btn")?.addEventListener("click", () => {
  navigator.sendBeacon("/api/shutdown", "{}");
  document.body.innerHTML = "<div style='display:flex;align-items:center;justify-content:center;height:100vh;background:#0a0a0a;color:#555;font-family:sans-serif;font-size:16px'>\u2B61 player closed</div>";
});
</script>`;

  return getBaseHtml({
    title: " — Label",
    variantLabel,
    variantConfigs,
    headerContent,
    bottomContent,
    extraStyles,
    extraScripts,
    modeFlags: { label: true },
    showVariantBar: variantConfigs.length > 1,
  });
}
