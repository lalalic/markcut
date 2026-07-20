import * as React from "react";
import { Sequence, OffthreadVideo, useVideoConfig, staticFile } from "remotion";

function resolveVideoSrc(src: string): string {
  if (/^(https?:|data:|blob:|file:|\/)/.test(src)) return src;
  return staticFile(src);
}
import { ComposeContext, AudioContext, useFrameEvents } from "../context/index";
import { toPlaybackRate, cssJS } from "../utils/index";
import type { Video } from "../schema/index";
import { FrameSyncStyle } from "./FrameSyncStyle";

export function VideoLeaf({ stream }: { stream: Video }) {
  const { fps } = useVideoConfig();
  const audio = React.useContext(AudioContext);
  const start = stream.start ?? 0;
  const end = stream.end ?? start + (stream.duration ?? 1);
  const totalDur = stream.durationInSeconds ?? end;
  useFrameEvents(stream.on, Math.max(1, Math.floor(totalDur * fps)));
  if (!stream.src) return null;
  const resolvedSrc = resolveVideoSrc(stream.src);

  const startFrom = stream.startFrom ?? 0;
  const endAt = stream.endAt ?? totalDur;
  const volume = stream.volume ?? 1;
  const playbackRate = Math.min(1, toPlaybackRate((endAt - startFrom) / (end - start)));
  const streamStyle = cssJS(stream.style);
  const hasAnimation = "animation" in streamStyle;
  return (
    <Sequence
      durationInFrames={Math.max(1, Math.floor(fps * (end - start)))}
      from={Math.floor(fps * start)}
      layout="none"
      showInTimeline={false}
    >
      {hasAnimation ? (
        <FrameSyncStyle style={streamStyle}>
          <OffthreadVideo
            src={resolvedSrc}
            startFrom={Math.floor(startFrom * fps)}
            endAt={Math.floor(startFrom * fps) + Math.floor(((endAt - startFrom) * fps) / playbackRate)}
            muted={volume === 0 || !!audio?.foreground}
            volume={volume}
            playbackRate={playbackRate}
            showInTimeline={false}
            style={{ width: "100%", height: "100%" }}
          />
        </FrameSyncStyle>
      ) : (
        <OffthreadVideo
          src={resolvedSrc}
          startFrom={Math.floor(startFrom * fps)}
          endAt={Math.floor(startFrom * fps) + Math.floor(((endAt - startFrom) * fps) / playbackRate)}
          muted={volume === 0 || !!audio?.foreground}
          volume={volume}
          playbackRate={playbackRate}
          showInTimeline={false}
          style={{ width: "100%", height: "100%", ...streamStyle }}
        />
      )}
    </Sequence>
  );
}
