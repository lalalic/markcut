import * as React from "react";
import { Sequence, Audio as RemotionAudio, useRemotionEnvironment, useVideoConfig, staticFile } from "remotion";
import { AudioContext } from "../context/index";
import { toPlaybackRate } from "../utils/index";
import type { Audio } from "../schema/index";

function resolveAudioSrc(src: string): string {
  if (/^(https?:|data:|blob:|file:|\/)/.test(src)) return src;
  return staticFile(src);
}

export function AudioLeaf({ stream }: { stream: Audio }) {
  const { fps } = useVideoConfig();
  const environment = useRemotionEnvironment();
  const ctx = React.useContext(AudioContext);
  if (!stream.src) return null;
  if (environment.isStudio) return null;

  const resolvedSrc = resolveAudioSrc(stream.src);

  return (
    <>
      {stream.actions.map((a) => {
        const start = a.start ?? 0;
        const end = a.end ?? start + 1;
        const startFrom = a.startFrom ?? 0;
        const endAt = a.endAt ?? stream.durationInSeconds ?? end - start;
        const volume = a.volume ?? stream.volume ?? 1;
        const playbackRate = a.loop ? 1 : toPlaybackRate((endAt - startFrom) / (end - start));
        return (
          <Sequence
            key={a.id}
            name={stream.src ?? "audio"}
            durationInFrames={Math.max(1, Math.floor(fps * (end - start)))}
            from={Math.floor(fps * start)}
            layout="none"
            showInTimeline={false}
          >
            <RemotionAudio
              src={resolvedSrc}
              startFrom={Math.floor(startFrom * fps)}
              endAt={Math.floor(startFrom * fps) + Math.floor(((endAt - startFrom) * fps) / playbackRate)}
              muted={volume === 0 || !!ctx?.foreground}
              volume={volume}
              loop={(a.loop ?? 1) > 1}
              playbackRate={playbackRate}
              showInTimeline={false}
            />
          </Sequence>
        );
      })}
    </>
  );
}
