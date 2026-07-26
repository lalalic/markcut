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
  /** UI locale */
  locale?: "en" | "zh";
}

export function HeaderBar({ mode, sceneInfo, sseConnected, locale = "en" }: HeaderBarProps) {
  const isZh = locale === "zh";
  const handleClose = React.useCallback(() => {
    navigator.sendBeacon("/api/shutdown", "{}");
    document.body.innerHTML =
      `<div style='display:flex;align-items:center;justify-content:center;height:100vh;background:#0a0a0a;color:#555;font-family:sans-serif;font-size:16px'>\u2B61 ${isZh ? "播放器已关闭，返回终端" : "player closed — return to terminal"}</div>`;
  }, [isZh]);

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
          title={sseConnected ? (isZh ? "已连接，可自动刷新" : "Connected — auto-reload ready") : (isZh ? "连接断开" : "Disconnected")}
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
        <button id="close-btn" title={isZh ? "关闭播放器并返回终端" : "Close player and return to terminal"} onClick={handleClose}>
          ✕
        </button>
      </div>
    </div>
  );
}
