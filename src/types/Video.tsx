import * as React from "react";
import { Sequence, OffthreadVideo, useVideoConfig, staticFile } from "remotion";

function resolveVideoSrc(src: string): string {
  if (/^(https?:|data:|blob:|file:|\/)/.test(src)) return src;
  return staticFile(src);
}
import { ComposeContext, AudioContext } from "../context/index";
import { toPlaybackRate, cssJS } from "../utils/index";
import type { Video } from "../schema/index";
import { FrameSyncStyle } from "./FrameSyncStyle";

export function VideoLeaf({ stream }: { stream: Video }) {
  const { fps } = useVideoConfig();
  const audio = React.useContext(AudioContext);
  if (!stream.src) return null;
  const resolvedSrc = resolveVideoSrc(stream.src);

  return (
    <>
      {stream.actions.map((a) => {
        const start = a.start ?? 0;
        const end = a.end ?? start + 1;
        const startFrom = a.startFrom ?? 0;
        const endAt = a.endAt ?? stream.durationInSeconds ?? end - start;
        const volume = a.volume ?? stream.volume ?? 1;
        const playbackRate = a.loop ? 1 : Math.min(1, toPlaybackRate((endAt - startFrom) / (end - start)));
        const actionStyle = cssJS(a.style);
        const hasAnimation = "animation" in actionStyle;
        return (
          <Sequence
            key={a.id}
            durationInFrames={Math.max(1, Math.floor(fps * (end - start)))}
            from={Math.floor(fps * start)}
            layout="none"
            showInTimeline={false}
          >
            {hasAnimation ? (
              <FrameSyncStyle style={actionStyle}>
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
                style={{ width: "100%", height: "100%", ...actionStyle }}
              />
            )}
          </Sequence>
        );
      })}
    </>
  );
}
