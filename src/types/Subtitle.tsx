import * as React from "react";
import { cancelRender, continueRender, delayRender, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { cssJS, parseVTT } from "../utils/index";
import type { Subtitle, SubtitleCue } from "../schema/index";

function resolveSubtitleSrc(src: string): string {
  if (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("data:") || src.startsWith("/")) {
    return src;
  }
  return staticFile(src);
}

/**
 * Lite subtitle: renders one cue at a time via an absolute-positioned div.
 * Caption animation is just classNames driven by `cue.className`/`stream.name`.
 * The host can theme via root.stylesheet.
 */
export function SubtitleLeaf({ stream }: { stream: Subtitle }) {
  const { fps } = useVideoConfig();
  const currentInSecond = useCurrentFrame() / fps;
  const start = stream.actions[0]?.start ?? 0;
  const end = stream.actions[0]?.end ?? start + 1;
  const [loadedCues, setLoadedCues] = React.useState<SubtitleCue[] | null>(null);

  React.useEffect(() => {
    if (stream.cues?.length || !stream.src) {
      setLoadedCues(null);
      return;
    }

    if (stream.src.includes("-->")) {
      setLoadedCues(parseVTT(stream.src));
      return;
    }

    if (!/\.vtt(?:$|[?#])/.test(stream.src)) {
      setLoadedCues(null);
      return;
    }

    const handle = delayRender(`Loading subtitles: ${stream.src}`);
    let active = true;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      continueRender(handle);
    };
    fetch(resolveSubtitleSrc(stream.src))
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load subtitles (${response.status}): ${stream.src}`);
        }
        return response.text();
      })
      .then((text) => {
        if (!active) return;
        setLoadedCues(parseVTT(text));
        finish();
      })
      .catch((error) => {
        if (!active) return;
        settled = true;
        cancelRender(error);
      });

    return () => {
      active = false;
      finish();
    };
  }, [stream.cues, stream.src]);

  const cues = stream.cues?.length ? stream.cues : loadedCues;

  const cue: (SubtitleCue & { className?: string }) | undefined = React.useMemo(() => {
    if (cues?.length) {
      return cues.find(
        (c) => c.startFrom + start <= currentInSecond && c.endAt + start > currentInSecond,
      );
    }
    if (stream.src) {
      if (stream.src.includes("-->") || /\.vtt(?:$|[?#])/.test(stream.src)) {
        return undefined;
      }
      return {
        text: stream.src,
        startFrom: 0,
        endAt: end - start,
        className: stream.actions[0]?.effectId,
      };
    }
    return undefined;
  }, [currentInSecond, cues, stream, start, end]);

  if (!cue) return null;

  const css = stream.style ? (cssJS(stream.style) as React.CSSProperties) : {};

  // Word-level karaoke rendering: if cue has explicit `words` (per-word timing)
  // OR the className includes "karaoke" (auto-derive from text + cue duration),
  // render each word as a span and apply `.word-active` to the currently spoken
  // word. Time is relative to cue start.
  const cueLocalT = currentInSecond - start - cue.startFrom;
  const wantsKaraoke = (cue.className ?? "").includes("karaoke") || (cue.words?.length ?? 0) > 0;
  let wordEls: React.ReactNode | null = null;
  if (wantsKaraoke) {
    const explicit = cue.words ?? [];
    const tokens = explicit.length
      ? explicit
      : (() => {
          const parts = cue.text.split(/\s+/).filter(Boolean);
          const dur = Math.max(0.001, cue.endAt - cue.startFrom);
          const each = dur / Math.max(1, parts.length);
          return parts.map((t, i) => ({ text: t, start: i * each, end: (i + 1) * each }));
        })();
    wordEls = tokens.map((w, i) => {
      const active = cueLocalT >= w.start && cueLocalT < w.end;
      return (
        <span key={i} className={active ? "word word-active" : "word"}>
          {w.text}
          {i < tokens.length - 1 ? " " : ""}
        </span>
      );
    });
  }

  return (
    <Sequence
      layout="none"
      durationInFrames={Math.max(1, Math.floor((cue.endAt - cue.startFrom) * fps))}
      from={Math.floor(start * fps) + Math.floor(cue.startFrom * fps)}
    >
      <div className={`caption-overlay ${stream.name ?? ""}`} style={{ ...DEFAULT_BOX_STYLE, ...css }}>
        {wordEls ? (
          <span
            className={`caption ${cue.className ?? ""}`}
            style={{ ...DEFAULT_TEXT_STYLE, fontSize: stream.fontSize ?? DEFAULT_TEXT_STYLE.fontSize, fontStyle: stream.fontStyle }}
          >
            {wordEls}
          </span>
        ) : (
          <span
            className={`caption ${cue.className ?? ""}`}
            style={{ ...DEFAULT_TEXT_STYLE, fontSize: stream.fontSize ?? DEFAULT_TEXT_STYLE.fontSize, fontStyle: stream.fontStyle }}
            dangerouslySetInnerHTML={{ __html: cue.text }}
          />
        )}
      </div>
    </Sequence>
  );
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
