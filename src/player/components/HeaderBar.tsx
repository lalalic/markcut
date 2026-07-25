/**
 * HeaderBar — shared header for all modes.
 *
 * Always renders the close button (→ /api/shutdown).
 * Edit mode: shows SSE connection status + edit result feedback.
 * Label mode: shows current scene name + time.
 */
import * as React from "react";

interface HeaderBarProps {
  /** "preview" | "edit" | "label" */
  mode: string;
  /** Label mode scene info text (e.g. "slide1 (1.2s)") */
  sceneInfo?: string;
  /** Whether SSE is connected */
  sseConnected?: boolean;
}

export function HeaderBar({ mode, sceneInfo, sseConnected }: HeaderBarProps) {
  const handleClose = React.useCallback(() => {
    navigator.sendBeacon("/api/shutdown", "{}");
    document.body.innerHTML =
      "<div style='display:flex;align-items:center;justify-content:center;height:100vh;background:#0a0a0a;color:#555;font-family:sans-serif;font-size:16px'>\u2B61 player closed \u2014 return to terminal</div>";
  }, []);

  return (
    <div id="header">
      {/* Left: mode-specific info */}
      <span style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
        {mode === "label" && sceneInfo && (
          <span id="scene-info">{sceneInfo}</span>
        )}
        {/* SSE indicator — shown in all modes */}
        <span
          id="sse-indicator"
          title={sseConnected ? "Connected — auto-reload ready" : "Disconnected"}
          style={{
            display: "inline-block",
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: sseConnected ? "#4ade80" : "#555",
            flexShrink: 0,
          }}
        />
      </span>
      {/* Right: close button */}
      <div id="header-actions">
        <button id="close-btn" title="Close player and return to terminal" onClick={handleClose}>
          ✕
        </button>
      </div>
    </div>
  );
}
