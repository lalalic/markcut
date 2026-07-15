/**
 * EditControls — edit mode controls for the bottom bar.
 *
 * Renders the edit input + submit button.
 * SSE connection is managed by the app shell (browser.tsx).
 * This component toggles suppressReloadRef during edit to prevent
 * auto-reload from racing with the AI edit output.
 */
import * as React from "react";

interface EditControlsProps {
  /** Called whenever the edit status changes (for HeaderBar) */
  onStatusChange?: (status: string) => void;
  /** Ref shared with app shell — set true during edit to suppress SSE-triggered reload */
  suppressReloadRef?: React.MutableRefObject<boolean>;
  /** Current player time in seconds (sent with edit request for context) */
  currentTime?: number;
  /** Active scene name (sent with edit request for context) */
  activeScene?: string;
}

export function EditControls({ onStatusChange, suppressReloadRef, currentTime, activeScene }: EditControlsProps) {
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // ── Edit submit ──────────────────────────────────────────────────────
  const handleApplyEdit = React.useCallback(
    async (text: string) => {
      if (!text || busy) return;
      setBusy(true);
      onStatusChange?.("\u231B editing...");
      if (inputRef.current) inputRef.current.value = "";
      if (suppressReloadRef) suppressReloadRef.current = true;

      try {
        const res = await fetch("/api/edit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, currentTime, activeScene }),
        });
        const data = await res.json();
        if (res.ok) {
          const summary = data.summary || (data.output || "done").split("\n")[0].slice(0, 65);
          onStatusChange?.(summary);
          setTimeout(() => {
            if (suppressReloadRef) suppressReloadRef.current = false;
            window.dispatchEvent(new Event("refresh-player"));
          }, 4000);
        } else {
          onStatusChange?.("\u274C " + (data.error || "failed"));
          if (suppressReloadRef) suppressReloadRef.current = false;
        }
      } catch {
        onStatusChange?.("\u274C error");
        if (suppressReloadRef) suppressReloadRef.current = false;
      }
      setBusy(false);
    },
    [busy, onStatusChange, suppressReloadRef]
  );

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleApplyEdit((e.target as HTMLInputElement).value);
      }
    },
    [handleApplyEdit]
  );

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div id="bottom-bar">
      <input
        ref={inputRef}
        id="edit-input"
        placeholder="What should change? e.g. make text bigger"
        onKeyDown={handleKeyDown}
      />
      <button
        id="edit-btn"
        title="Apply edit"
        disabled={busy}
        onClick={() => handleApplyEdit(inputRef.current?.value || "")}
      >
        ✨
      </button>
    </div>
  );
}

