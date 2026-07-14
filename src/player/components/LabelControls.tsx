/**
 * LabelControls — label mode controls.
 *
 * Renders:
 * - Thumbnail strip with label badges (between header and player)
 * - Timed labels list with delete (below player)
 * - Bottom input bar with save button
 *
 * Scene/time info is pushed up via onSceneChange for HeaderBar.
 */
import * as React from "react";

// ── Types ────────────────────────────────────────────────────────────────
interface Scene {
  name: string;
  start: number;
  end: number;
  duration: number;
  src: string;
  mediaType: string;
}

interface LabelEntry {
  overall: string;
  timed: Record<string, string>;
}

interface VideoInfo {
  scenes: Scene[];
  totalDuration: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────
const VIDEO_EXT: Record<string, number> = {
  ".mov": 1, ".mp4": 1, ".avi": 1, ".mkv": 1, ".webm": 1, ".m4v": 1, ".wmv": 1,
};

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatTime(sec: number): string {
  const mm = Math.floor(sec / 60);
  const ss = Math.floor(sec % 60);
  return mm + ":" + String(ss).padStart(2, "0");
}

// ── Component ────────────────────────────────────────────────────────────
interface LabelControlsProps {
  playerRef: React.RefObject<any>;
  /** Current player time in seconds (from onFrameUpdate, no polling needed) */
  currentTime: number;
  /** Called when scene/time changes, for HeaderBar */
  onSceneChange?: (sceneInfo: string) => void;
}

export function LabelControls({ playerRef, currentTime, onSceneChange }: LabelControlsProps) {
  const [videoInfo, setVideoInfo] = React.useState<VideoInfo | null>(null);
  const [labelData, setLabelData] = React.useState<Record<number, LabelEntry>>({});
  const [currentSceneIdx, setCurrentSceneIdx] = React.useState(0);
  const [selectedOverride, setSelectedOverride] = React.useState(-1);
  const [inputText, setInputText] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // ── Load video info and existing labels ──────────────────────────────
  React.useEffect(() => {
    fetch("/api/video-info")
      .then((r) => r.json())
      .then((info) => {
        setVideoInfo(info);
        if (info.scenes?.[0]) {
          onSceneChange?.(info.scenes[0].name + " (0.0s)");
        }
      })
      .catch(() => {});

    fetch("/api/labels")
      .then((r) => (r.ok ? r.json() : null))
      .then((tree) => {
        if (!tree) return;
        const root = tree.root || tree;
        const children = root.children || [];
        const loaded: Record<number, LabelEntry> = {};
        for (let i = 0; i < children.length; i++) {
          const media = (children[i].children || [])[0];
          if (media && media.userHints) {
            loaded[i] = {
              overall: media.userHints.overall || "",
              timed: media.userHints.timed || {},
            };
          } else if (media && media.description) {
            loaded[i] = { overall: media.description, timed: {} };
          }
        }
        setLabelData(loaded);
      })
      .catch(() => {});
  }, [onSceneChange]);

  // ── Compute current scene from time ──────────────────────────────────
  const scenes = videoInfo?.scenes || [];
  const effectiveIdx =
    selectedOverride >= 0 ? selectedOverride : currentSceneIdx;
  const currentScene = scenes[effectiveIdx];

  // Update current scene index from player time (pushed by parent via onFrameUpdate)
  React.useEffect(() => {
    if (selectedOverride >= 0) return;
    for (let i = 0; i < scenes.length; i++) {
      if (currentTime >= scenes[i].start && currentTime < scenes[i].end) {
        setCurrentSceneIdx(i);
        break;
      }
    }
  }, [currentTime, scenes, selectedOverride]);

  // Clear override when player moves away
  React.useEffect(() => {
    if (selectedOverride >= 0 && currentScene) {
      const scene = scenes[selectedOverride];
      if (scene && (currentTime < scene.start || currentTime >= scene.end)) {
        setSelectedOverride(-1);
      }
    }
  }, [currentTime, selectedOverride, scenes, currentScene]);

  // Push scene info to header
  React.useEffect(() => {
    if (!currentScene) {
      onSceneChange?.(currentTime.toFixed(1) + "s");
    } else if (selectedOverride >= 0) {
      onSceneChange?.(currentScene.name + " (selected)");
    } else {
      onSceneChange?.(currentScene.name + " (" + currentTime.toFixed(1) + "s)");
    }
  }, [currentScene, currentTime, selectedOverride, onSceneChange]);

  // ── Seek to scene ────────────────────────────────────────────────────
  const seekToScene = React.useCallback(
    (index: number) => {
      setSelectedOverride(index);
      setCurrentSceneIdx(index);
      const scene = scenes[index];
      if (scene && playerRef.current) {
        const frame = Math.round(scene.start * 30);
        playerRef.current.seekTo(frame);
      }
    },
    [scenes, playerRef]
  );

  // ── Update input when scene changes ──────────────────────────────────
  React.useEffect(() => {
    const entry = labelData[effectiveIdx];
    setInputText((entry && entry.overall) || "");
  }, [effectiveIdx, labelData]);

  // ── Save label ───────────────────────────────────────────────────────
  const saveLabel = React.useCallback(() => {
    const text = inputText.trim();
    if (!text || saving) return;
    setSaving(true);

    const sceneIdx = effectiveIdx;
    const timeMs = Math.round(currentTime * 1000);
    const scene = scenes[sceneIdx];
    const isImage = scene && scene.mediaType === "image";
    const sceneStart = scene ? scene.start * 1000 : 0;
    const isOverall = isImage || timeMs - sceneStart < 1000;

    // Update local state
    setLabelData((prev) => {
      const next = { ...prev };
      if (!next[sceneIdx]) next[sceneIdx] = { overall: "", timed: {} };
      if (isOverall) {
        next[sceneIdx] = { ...next[sceneIdx], overall: text };
      } else {
        next[sceneIdx] = {
          ...next[sceneIdx],
          timed: { ...next[sceneIdx].timed, ["at_" + timeMs]: text },
        };
      }
      return next;
    });

    // Save to server
    fetch("/api/labels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sceneIndex: sceneIdx,
        description: text,
        time: currentTime,
        overall: isOverall || undefined,
      }),
    })
      .then(() => {
        setInputText("");
        // Show toast
        const toast = document.getElementById("saved-toast");
        if (toast) {
          toast.classList.add("show");
          setTimeout(() => toast.classList.remove("show"), 2000);
        }
      })
      .catch(() => {})
      .finally(() => setSaving(false));
  }, [inputText, saving, effectiveIdx, currentTime, scenes]);

  // ── Delete timed label ───────────────────────────────────────────────
  const deleteTimed = React.useCallback(
    (key: string) => {
      const sceneIdx = effectiveIdx;
      setLabelData((prev) => {
        const entry = prev[sceneIdx];
        if (!entry || !entry.timed[key]) return prev;
        const next = { ...prev };
        const nextEntry = { ...entry, timed: { ...entry.timed } };
        delete nextEntry.timed[key];
        next[sceneIdx] = nextEntry;
        return next;
      });

      fetch("/api/labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sceneIndex: sceneIdx,
          description: "",
          removeTimed: key,
        }),
      }).catch(() => {});
    },
    [effectiveIdx]
  );

  // ── Render thumbnail strip ───────────────────────────────────────────
  const renderThumbnails = () => {
    return (
      <div id="thumbnails">
        {scenes.map((scene, i) => {
          const isActive = i === effectiveIdx;
          const entry = labelData[i];
          const hasLabel =
            entry && (entry.overall || Object.keys(entry.timed).length > 0);

          let thumbContent: React.ReactNode;
          const ext = scene.src.substring(scene.src.lastIndexOf(".")).toLowerCase();
          const isVideo = !!VIDEO_EXT[ext];

          if (scene.src && !isVideo) {
            thumbContent = <img src={scene.src} alt="" loading="lazy" />;
          } else if (scene.src && isVideo) {
            thumbContent = (
              <video
                src={scene.src}
                muted
                preload="metadata"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            );
          } else {
            thumbContent = (
              <div
                style={{
                  width: "100%", height: "100%", display: "flex",
                  alignItems: "center", justifyContent: "center",
                  background: "rgba(255,255,255,.08)",
                  color: "rgba(255,255,255,.3)",
                  fontSize: 16, fontWeight: 600,
                }}
              >
                {(scene.name || "S" + (i + 1)).slice(0, 2).toUpperCase()}
              </div>
            );
          }

          return (
            <div
              key={i}
              className={"thumb-item" + (isActive ? " active" : "")}
              data-index={i}
              onClick={() => seekToScene(i)}
            >
              {thumbContent}
              <div className={"thumb-badge" + (hasLabel ? " has-label" : "")} />
            </div>
          );
        })}
      </div>
    );
  };

  // ── Render timed labels list ─────────────────────────────────────────
  const renderTimedLabels = () => {
    const entry = labelData[effectiveIdx];
    const timed = (entry && entry.timed) || {};
    const keys = Object.keys(timed).sort();

    return (
      <div id="timed-labels">
        {keys.map((k) => {
          const sec = parseInt(k.replace("at_", "")) / 1000;
          return (
            <div key={k} className="timed-label" data-key={k}>
              <span className="tl-time">{formatTime(sec)}</span>
              <span className="tl-text" dangerouslySetInnerHTML={{ __html: escHtml(timed[k]) }} />
              <button className="tl-del" title="Remove" onClick={() => deleteTimed(k)}>
                ×
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  // ── Scene info text ──────────────────────────────────────────────────
  let sceneInfoText = currentTime.toFixed(1) + "s";
  if (currentScene) {
    if (selectedOverride >= 0) {
      sceneInfoText = currentScene.name + " (selected)";
    } else {
      sceneInfoText = currentScene.name + " (" + currentTime.toFixed(1) + "s)";
    }
  }

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <>
      {/* Thumbnail strip */}
      {renderThumbnails()}

      {/* Timed labels list */}
      {renderTimedLabels()}

      {/* Saved toast */}
      <div id="saved-toast">✓ Label saved</div>

      {/* Bottom input bar */}
      <div id="bottom-bar">
        <input
          ref={inputRef}
          id="label-input"
          placeholder="Add label for current scene…"
          value={inputText}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInputText(e.target.value)}
          onKeyDown={(e: React.KeyboardEvent) => {
            if (e.key === "Enter") {
              e.preventDefault();
              saveLabel();
            }
          }}
        />
        <button
          id="label-btn"
          title="Save label"
          disabled={saving || !inputText.trim()}
          onClick={saveLabel}
        >
          📝
        </button>
      </div>
    </>
  );
}
