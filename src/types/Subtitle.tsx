import * as React from "react";
import { cancelRender, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { cssJS, parseVTT, type Cue } from "../utils/index";
import type { SubtitleOverlay as SubtitleOverlayConfig } from "../schema/index";

function resolveSubtitleSrc(src: string): string {
  if (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("data:") || src.startsWith("/")) {
    return src;
  }
  return staticFile(src);
}

const DEFAULT_BOX_STYLE: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  padding: "0 5% 8% 5%",
  pointerEvents: "none",
  zIndex: 100,
};

const DEFAULT_TEXT_STYLE: React.CSSProperties = {
  color: "white",
  fontSize: 56,
  fontWeight: 700,
  textAlign: "center",
  textShadow: "0 2px 12px rgba(0,0,0,0.85)",
  lineHeight: 1.2,
  fontFamily: '"PingFang SC","Noto Sans CJK SC","Hiragino Sans","Helvetica Neue",sans-serif',
};

/**
 * Root-level subtitle overlay. Renders a single VTT file as captions over
 * the entire video. VTT cue timestamps are absolute (seconds from video start),
 * matching useCurrentFrame() / fps directly.
 *
 * Mounted once inside AbsoluteFill in RemotionEngine when root.subtitle is set.
 */
export function SubtitleOverlay({ subtitle }: { subtitle: SubtitleOverlayConfig }) {
  const { fps } = useVideoConfig();
  const currentTime = useCurrentFrame() / fps;
  const [cues, setCues] = React.useState<Cue[] | null>(null);

  React.useEffect(() => {
    const { src } = subtitle;

    // Inline VTT body
    if (src.includes("-->")) {
      setCues(parseVTT(src));
      return;
    }

    if (!/\.vtt(?:$|[?#])/.test(src)) {
      // Plain text — single static caption for the whole video
      setCues([{ startFrom: 0, endAt: Infinity, text: src }]);
      return;
    }

    const handle = delayRender(`Loading subtitles: ${src}`);
    let active = true;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      continueRender(handle);
    };

    fetch(resolveSubtitleSrc(src))
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load subtitles (${r.status}): ${src}`);
        return r.text();
      })
      .then((text) => {
        if (!active) return;
        setCues(parseVTT(text));
        finish();
      })
      .catch((err) => {
        if (!active) return;
        settled = true;
        cancelRender(err);
      });

    return () => {
      active = false;
      finish();
    };
  }, [subtitle.src]);

  const cue = React.useMemo(
    () => cues?.find((c) => c.startFrom <= currentTime && c.endAt > currentTime),
    [cues, currentTime],
  );

  if (!cue) return null;

  const boxCss = subtitle.style ? (cssJS(subtitle.style) as React.CSSProperties) : {};

  return (
    <div className="caption-overlay subtitle-overlay" style={{ ...DEFAULT_BOX_STYLE, ...boxCss }}>
      <span
        className="caption"
        style={{ ...DEFAULT_TEXT_STYLE, fontSize: subtitle.fontSize ?? DEFAULT_TEXT_STYLE.fontSize }}
        dangerouslySetInnerHTML={{ __html: cue.text }}
      />
    </div>
  );
}
