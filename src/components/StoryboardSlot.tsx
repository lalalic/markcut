import * as React from "react";

/**
 * Built-in component rendered by `--storyboard` preview mode instead of a
 * generated image (TTI) or video (TTV). Shows the generation prompt with a
 * clear type indicator so the user can review the story structure fast and
 * chat to reshape it before committing to slow media generation.
 *
 * Usage in markdown / compiled JSON:
 *   <StoryboardSlot kind="image" prompt={prompt} />
 *   <StoryboardSlot kind="video" prompt={prompt} />
 *
 * The `prompt` variable comes from the component node's data bindings.
 * No imports or frontmatter registration needed — it's a built-in.
 */
export interface StoryboardSlotProps {
  kind: "image" | "video";
  prompt?: string;
}

export function StoryboardSlot({ kind, prompt }: StoryboardSlotProps) {
  const isVideo = kind === "video";

  const bgGrad = isVideo
    ? "linear-gradient(135deg,#7c2d12,#b91c1c)"
    : "linear-gradient(135deg,#1e3a8a,#6d28d9)";
  const accentColor = isVideo ? "#fbbf24" : "#93c5fd";
  const label = isVideo ? "Video" : "Image";
  const emoji = isVideo ? "🎬" : "🖼️";

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: bgGrad,
        color: "#fff",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        padding: "6%",
        boxSizing: "border-box",
      }}
    >
      {/* dashed border frame */}
      <div
        style={{
          position: "absolute",
          inset: "4%",
          border: "3px dashed rgba(255,255,255,0.35)",
          borderRadius: 24,
          pointerEvents: "none",
        }}
      />

      {/* type badge */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5em",
          background: "rgba(0,0,0,0.35)",
          border: `2px solid ${accentColor}`,
          borderRadius: 999,
          padding: "0.5em 1.1em",
          fontSize: "2.2vh",
          fontWeight: 800,
          letterSpacing: "0.12em",
          marginBottom: "3vh",
        }}
      >
        <span style={{ fontSize: "3.4vh", lineHeight: 1 }}>{emoji}</span>
      </div>

      {/* prompt text */}
      <div
        style={{
          position: "relative",
          maxWidth: "88%",
          textAlign: "center",
          fontSize: "3.4vh",
          lineHeight: 1.4,
          fontWeight: 600,
          textShadow: "0 2px 8px rgba(0,0,0,0.5)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {prompt ?? (isVideo ? "(no video prompt)" : "(no image prompt)")}
      </div>
    </div>
  );
}
