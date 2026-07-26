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
  locale?: "en" | "zh";
  onToggleMinimize: () => void;
}

export function EditMessagePanel({ entries, minimized, locale = "en", onToggleMinimize }: EditMessagePanelProps) {
  const listRef = React.useRef<HTMLDivElement>(null);
  const isZh = locale === "zh";

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
        ? (isZh ? "✨ 编辑" : "✨ Edit")
        : isZh
          ? `✨ ${entries.length} 条编辑${latest?.status === "thinking" ? " ⏳" : ""}`
          : `✨ ${entries.length} edit${entries.length > 1 ? "s" : ""}${latest?.status === "thinking" ? " ⏳" : ""}`;
    return (
      <button id="edit-message-bar" onClick={onToggleMinimize} title={isZh ? "显示编辑历史" : "Show edit history"}>
        {label}
      </button>
    );
  }

  return (
    <div id="edit-message-panel">
      <div id="edit-message-header">
        <span>{isZh ? "✨ 编辑历史" : "✨ Edit History"}</span>
        <button
          id="edit-message-minimize"
          onClick={onToggleMinimize}
          title={isZh ? "最小化" : "Minimize"}
          aria-label={isZh ? "最小化编辑面板" : "Minimize edit panel"}
        >
          ─
        </button>
      </div>
      <div id="edit-message-list" ref={listRef}>
        {entries.length === 0 && (
          <div className="edit-message-empty">{isZh ? "暂无编辑记录。请在下方输入修改请求。" : "No edits yet. Type a request below."}</div>
        )}
        {entries.map((entry) => (
          <div key={entry.id} className={`edit-message-entry ${entry.status}`}>
            <div className="edit-message-request">
              <span className="edit-role">{isZh ? "你:" : "You:"}</span> {entry.request}
            </div>
            {entry.status === "thinking" && (
              <div className="edit-message-thinking">
                <span className="edit-role">{isZh ? "助手:" : "Assistant:"}</span> {isZh ? "思考中" : "Thinking"}
                <span className="edit-dots"><span>.</span><span>.</span><span>.</span></span>
              </div>
            )}
            {entry.status === "done" && entry.progress && (
              <div className="edit-message-response">
                <span className="edit-role">{isZh ? "助手:" : "Assistant:"}</span> {entry.progress}
              </div>
            )}
            {entry.status === "error" && (
              <div className="edit-message-error">
                <span className="edit-role">{isZh ? "错误:" : "Error:"}</span> {entry.error || entry.progress || (isZh ? "编辑失败" : "Edit failed")}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
