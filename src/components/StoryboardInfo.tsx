import * as React from "react";

/**
 * Built-in component rendered by `--storyboard` preview mode as the first
 * frame of the video. Shows all project frontmatter config and variant info
 * so the user has full context before reviewing the storyboard scenes.
 *
 * All props are strings (the compiler only collects string bindings).
 *
 * Usage in compiled JSON:
 *   <StoryboardInfo config="width: 1080 · height: 1920 · fps: 30 · layout: series"
 *                   variants="default, zh-tiktok" />
 *
 * No imports or frontmatter registration needed — it's a built-in.
 */
export interface StoryboardInfoProps {
  /** Formatted string of all root config fields (separated by " · ") */
  config?: string;
  /** Comma-separated list of variant labels */
  variants?: string;
  /** Raw YAML frontmatter from the markdown source (if any) */
  frontmatter?: string;
}

export function StoryboardInfo({ config, variants, frontmatter }: StoryboardInfoProps) {
  const parts = (config ?? "").split("  ·  ").filter(Boolean);
  const variantList = (variants ?? "").split(/,\s*/).filter(Boolean);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg,#0f172a,#1e293b,#334155)",
        color: "#fff",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        padding: "8%",
        boxSizing: "border-box",
      }}
    >
      {/* decorative rings */}
      <div
        style={{
          position: "absolute",
          inset: "5%",
          border: "2px solid rgba(255,255,255,0.08)",
          borderRadius: "50%",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: "12%",
          border: "1px solid rgba(255,255,255,0.05)",
          borderRadius: "50%",
        }}
      />

      {/* header icon */}
      <div style={{ fontSize: "6vh", marginBottom: "2.5vh", opacity: 0.7 }}>🎬</div>

      {/* title */}
      <div
        style={{
          fontSize: "4.2vh",
          fontWeight: 800,
          letterSpacing: "0.02em",
          marginBottom: "3vh",
          textAlign: "center",
          textShadow: "0 2px 12px rgba(0,0,0,0.5)",
        }}
      >
        Storyboard Preview
      </div>

      {/* config fields as a table */}
      {parts.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: "1.2vh",
            maxWidth: "85%",
            marginBottom: variantList.length > 0 ? "2.5vh" : 0,
          }}
        >
          {parts.map((entry) => {
            const colonIdx = entry.indexOf(":");
            const label = colonIdx > 0 ? entry.slice(0, colonIdx).trim() : "";
            const value = colonIdx > 0 ? entry.slice(colonIdx + 1).trim() : entry;
            return (
              <div
                key={label || entry}
                style={{
                  background: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 12,
                  padding: "1.2vh 2.2vh",
                  textAlign: "center",
                  minWidth: "16vh",
                }}
              >
                {label && (
                  <div
                    style={{
                      fontSize: "1.6vh",
                      fontWeight: 600,
                      color: "#93c5fd",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase" as const,
                      marginBottom: "0.4vh",
                    }}
                  >
                    {label}
                  </div>
                )}
                <div
                  style={{
                    fontSize: "2.2vh",
                    fontWeight: 700,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    opacity: value.startsWith("http") ? 0.8 : 1,
                  }}
                >
                  {value}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* frontmatter block */}
      {frontmatter && (
        <div
          style={{
            maxWidth: "85%",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 12,
            padding: "1.5vh 2.5vh",
            marginBottom: "2.5vh",
            fontFamily: "monospace",
            fontSize: "1.8vh",
            lineHeight: 1.6,
            color: "rgba(255,255,255,0.8)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            textAlign: "left",
            maxHeight: "28vh",
            overflow: "auto",
          }}
        >
          {frontmatter}
        </div>
      )}

      {/* variants */}
      {variantList.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: "1vh",
          }}
        >
          {variantList.map((v) => (
            <div
              key={v}
              style={{
                background: "rgba(251,191,36,0.15)",
                border: "1px solid rgba(251,191,36,0.35)",
                borderRadius: 999,
                padding: "0.8vh 2vh",
                fontSize: "1.8vh",
                fontWeight: 600,
                color: "#fbbf24",
                letterSpacing: "0.04em",
              }}
            >
              {v}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
