import * as React from "react";
import { cancelRender, continueRender, delayRender, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import * as Subtitles from "remotion-subtitle";
import { cssJS, parseVTT, type Cue } from "../utils/index";
import type { SubtitleOverlay as SubtitleOverlayConfig } from "../schema/index";

const { SubtitleSequence: _SubtitleSeq, ...CaptionComponents } = Subtitles;

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
 * Resolve the caption component from a type string.
 * "typewriter" → TypewriterCaption, "fade" → FadeCaption, etc.
 * Falls back to base Caption component when type is omitted or unknown.
 */
function resolveCaption(type?: string): React.FC<{ text: any; style?: React.CSSProperties }> {
  if (!type) return CaptionComponents.Caption;
  const key = type.charAt(0).toUpperCase() + type.slice(1) + "Caption" as keyof typeof CaptionComponents;
  return (CaptionComponents[key] ?? CaptionComponents.Caption) as React.FC<{ text: any; style?: React.CSSProperties }>;
}

/**
 * Wraps text so that it renders HTML via dangerouslySetInnerHTML while
 * still being compatible with caption components that call .length,
 * .slice(), or .split() on the text prop (e.g. TypewriterCaption).
 *
 * The returned object is a React element (span with innerHTML) augmented
 * with string-like methods so animation components can iterate over
 * characters while respecting HTML tag boundaries.
 */
function supportHtml(text: string): any {
  const el = { ...<span dangerouslySetInnerHTML={{ __html: text }} /> };
  Object.assign(el, {
    length: text.length,
    slice(start: number, end: number) {
      const chars: string[] = [];
      let inTag = false;
      let counter = 0;
      for (const char of text) {
        if (inTag) {
          chars.push(char);
          if (char === ">") inTag = false;
          continue;
        }
        if (char === "<") {
          chars.push(char);
          inTag = true;
        } else if (char === ">") {
          chars.push(char);
          inTag = false;
        } else {
          if (counter <= end) chars.push(char);
          counter++;
        }
      }
      return <span dangerouslySetInnerHTML={{ __html: chars.join("") }} />;
    },
    split(separator: string | RegExp, limit?: number) {
      const stripped = text.replace(/<.*?>/g, "");
      return stripped.split(separator, limit);
    },
  });
  return el;
}

/**
 * Strip HTML tags from text, returning the plain text content.
 * Used to compare cue texts ignoring word-level highlighting markup.
 */
function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, "").trim();
}

/**
 * Group consecutive cues that share the same plain-text content.
 * This is the pattern used by word-level highlighting VTT where each
 * cue contains the full sentence but wraps a different word in HTML
 * (e.g. `<u>` or `<span style="...">`).
 *
 * Grouping them into a single CueFrame keeps the caption component
 * mounted across word transitions, eliminating the flash that occurs
 * when each cue unmounts/remounts its own Sequence.
 */
function groupConsecutiveCues(cues: Cue[]): Cue[][] {
  const groups: Cue[][] = [];
  let current: Cue[] = [];

  for (const cue of cues) {
    const plain = stripHtml(cue.text);
    if (current.length === 0) {
      current.push(cue);
    } else {
      const prevPlain = stripHtml(current[current.length - 1]!.text);
      if (plain === prevPlain) {
        current.push(cue);
      } else {
        groups.push(current);
        current = [cue];
      }
    }
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

/**
 * Renders a single cue inside a <Sequence> so Remotion only evaluates it
 * during the cue's active time window — matching the qili-ai pattern.
 * This avoids per-frame cue lookups and lets the caption component mount
 * once per cue rather than re-creating on every frame.
 *
 * When a cue group has multiple entries (same plain text, different HTML
 * highlighting), the component uses useCurrentFrame() to select the
 * active cue's text dynamically — keeping the caption component mounted
 * across word transitions and preventing flash.
 */
function CueFrame({
  cue,
  fps,
  CaptionComponent,
  subtitle,
  cueGroup,
}: {
  cue: Cue;
  fps: number;
  CaptionComponent: React.FC<{ text: any; style?: React.CSSProperties }>;
  subtitle: SubtitleOverlayConfig;
  /** Optional full group of cues sharing the same plain text. When provided,
   * the Sequence spans the entire group and highlights change dynamically. */
  cueGroup?: Cue[];
}) {
  const group = cueGroup ?? [cue];
  const startFrom = group[0]!.startFrom;
  const endAt = group[group.length - 1]!.endAt;

  const durationInFrames = Math.max(1, Math.floor((endAt - startFrom) * fps));
  const from = Math.floor(startFrom * fps);

  const textStyle: React.CSSProperties = React.useMemo(
    () => ({
      ...DEFAULT_TEXT_STYLE,
      fontSize: subtitle.fontSize ?? DEFAULT_TEXT_STYLE.fontSize,
      fontFamily: subtitle.fontFamily ?? DEFAULT_TEXT_STYLE.fontFamily,
      fontStyle: subtitle.fontStyle as any,
    }),
    [subtitle.fontSize, subtitle.fontFamily, subtitle.fontStyle],
  );

  return (
    <Sequence layout="none" durationInFrames={durationInFrames} from={from}>
      <GroupedCueInner
        group={group}
        fps={fps}
        CaptionComponent={CaptionComponent}
        textStyle={textStyle}
      />
    </Sequence>
  );
}

/**
 * Inner component that renders inside the single Sequence.
 * Uses useCurrentFrame() to pick which cue's HTML text to display
 * based on the current time, keeping the caption component mounted
 * across word transitions.
 */
function GroupedCueInner({
  group,
  fps,
  CaptionComponent,
  textStyle,
}: {
  group: Cue[];
  fps: number;
  CaptionComponent: React.FC<{ text: any; style?: React.CSSProperties }>;
  textStyle: React.CSSProperties;
}) {
  const frame = useCurrentFrame();
  const currentTime = frame / fps;

  // Find the active cue based on current time
  let activeCue = group[group.length - 1]!;
  for (const c of group) {
    if (currentTime >= c.startFrom && currentTime < c.endAt) {
      activeCue = c;
      break;
    }
  }

  const captionText = React.useMemo(() => supportHtml(activeCue.text), [activeCue.text]);

  return <CaptionComponent text={captionText} style={textStyle} />;
}

/**
 * Root-level subtitle overlay. Renders a single VTT file as captions over
 * the entire video. VTT cue timestamps are absolute (seconds from video start),
 * matching useCurrentFrame() / fps directly.
 *
 * Each cue is rendered as a separate <Sequence> so Remotion
 * only mounts/evaluates the caption component during its active time window.
 * This avoids per-frame computation for inactive cues.
 *
 * Supports a `type` field to select the caption animation component:
 *   "bounce", "fade", "typewriter", "colorful", "glowing", "neon", etc.
 * Defaults to plain `Caption` when type is omitted.
 *
 * Mounted once inside AbsoluteFill in MarkCut when root.subtitle is set.
 */
export function SubtitleOverlay({ subtitle }: { subtitle: SubtitleOverlayConfig }) {
  const { fps } = useVideoConfig();
  const [cues, setCues] = React.useState<Cue[] | null>(null);

  const CaptionComponent = React.useMemo(
    () => resolveCaption(subtitle.type),
    [subtitle.type],
  );

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

  if (!cues) return null;@

  const boxCss = subtitle.style ? (cssJS(subtitle.style) as React.CSSProperties) : {};@

  // Group consecutive cues with same plain text (word-level highlighting pattern)
  // so the caption component stays mounted across word transitions — no flash.
  const cueGroups = React.useMemo(() => groupConsecutiveCues(cues), [cues]);

  return (
    <div className={`${subtitle.type || "default"} subtitle-overlay`} style={{ ...DEFAULT_BOX_STYLE, ...boxCss }}>
      {cueGroups.map((group, gi) => (
        <CueFrame
          key={`g${gi}-${group[0]!.startFrom}-${group[group.length - 1]!.endAt}`}
          cue={group[0]!}
          cueGroup={group}
          fps={fps}
          CaptionComponent={CaptionComponent}
          subtitle={subtitle}
        />
      ))}
    </div>
  );
}
