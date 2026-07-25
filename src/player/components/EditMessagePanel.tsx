/**
 * EditMessagePanel — displays edit session messages chronologically.
 *
 * Shows user edit requests and assistant responses in a scrollable panel
 * that can be minimized to a compact bar. Replaces the old one-line
 * edit-status in the header.
 */
import * as React from "react";

export interface EditEntry {
  id: number;
  request: string;
  /** Accumulated assistant response text */
  progress: string;
  status: "thinking" | "done" | "error";
  error?: string;
}

interface EditMessagePanelProps {
  entries: EditEntry[];
  minimized: boolean;
  onToggleMinimize: () => void;
}

export function EditMessagePanel({ entries, minimized, onToggleMinimize }: EditMessagePanelProps) {
  const listRef = React.useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when entries change
  React.useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [entries]);

  // Minimized bar: show count + latest status
  if (minimized) {
    const latest = entries[entries.length - 1];
    const label =
      entries.length === 0
        ? "✨ Edit"
        : `✨ ${entries.length} edit${entries.length > 1 ? "s" : ""}${latest?.status === "thinking" ? " ⏳" : ""}`;
    return (
      <button id="edit-message-bar" onClick={onToggleMinimize} title="Show edit history">
        {label}
      </button>
    );
  }

  return (
    <div id="edit-message-panel">
      <div id="edit-message-header">
        <span>✨ Edit History</span>
        <button
          id="edit-message-minimize"
          onClick={onToggleMinimize}
          title="Minimize"
          aria-label="Minimize edit panel"
        >
          ─
        </button>
      </div>
      <div id="edit-message-list" ref={listRef}>
        {entries.length === 0 && (
          <div className="edit-message-empty">No edits yet. Type a request below.</div>
        )}
        {entries.map((entry) => (
          <div key={entry.id} className={`edit-message-entry ${entry.status}`}>
            <div className="edit-message-request">
              <span className="edit-role">You:</span> {entry.request}
            </div>
            {entry.status === "thinking" && (
              <div className="edit-message-thinking">
                <span className="edit-role">Assistant:</span> Thinking
                <span className="edit-dots"><span>.</span><span>.</span><span>.</span></span>
              </div>
            )}
            {entry.status === "done" && entry.progress && (
              <div className="edit-message-response">
                <span className="edit-role">Assistant:</span> {entry.progress}
              </div>
            )}
            {entry.status === "error" && (
              <div className="edit-message-error">
                <span className="edit-role">Error:</span> {entry.error || entry.progress || "Edit failed"}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
