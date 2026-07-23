import * as React from "react";

/**
 * Built-in component rendered by `--storyboard` preview mode instead of a
 * TTS-generated audio clip. Shows the script text as a caption-style bar at
 * the bottom of the frame.
 *
 * Usage in compiled JSON:
 *   <StoryboardCaption script={script} speaker={speaker} />
 *
 * No imports or frontmatter registration needed — it's a built-in.
 */
export interface StoryboardCaptionProps {
  /** The narration/dialogue text */
  script: string;
  /** Optional speaker name (for multi-turn dialogue) */
  speaker?: string;
}

export function StoryboardCaption({ script, speaker }: StoryboardCaptionProps) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: "10%",
        left: "5%",
        right: "5%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          maxWidth: "90%",
          background: "rgba(0,0,0,0.7)",
          backdropFilter: "blur(4px)",
          borderRadius: 16,
          padding: "2.5vh 4vh",
          textAlign: "center",
          color: "#fff",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        }}
      >
        {speaker && (
          <div
            style={{
              fontSize: "2vh",
              fontWeight: 700,
              color: "#93c5fd",
              marginBottom: "0.6vh",
              letterSpacing: "0.04em",
            }}
          >
            {speaker}
          </div>
        )}
        <div
          style={{
            fontSize: "2.6vh",
            lineHeight: 1.5,
            fontWeight: 500,
            textShadow: "0 1px 4px rgba(0,0,0,0.4)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {script}
        </div>
      </div>
    </div>
  );
}
