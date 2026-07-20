import * as React from "react";
import { Sequence, Audio as RemotionAudio, useRemotionEnvironment, useVideoConfig, staticFile } from "remotion";
import { AudioContext, useFrameEvents } from "../context/index";
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
  const start = stream.start ?? 0;
  const end = stream.end ?? start + (stream.duration ?? 1);
  const totalDur = stream.durationInSeconds ?? end;
  useFrameEvents(stream.on, Math.max(1, Math.floor(totalDur * fps)));
  if (!stream.src) return null;
  if (environment.isStudio) return null;

  const resolvedSrc = resolveAudioSrc(stream.src);
  const startFrom = stream.startFrom ?? 0;
  const endAt = stream.endAt ?? totalDur;
  const volume = stream.volume ?? 1;
  const playbackRate = toPlaybackRate((endAt - startFrom) / (end - start));
  return (
    <Sequence
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
        playbackRate={playbackRate}
        showInTimeline={false}
      />
    </Sequence>
  );
}
