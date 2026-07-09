/**
 * Rhythm stream type — audio playback with loop + beat-synced children.
 *
 * The rhythm stream plays audio in a loop. Children are expected to have
 * their timing pre-computed (by a build step or CLI tool) to align with
 * detected beat positions stored in `spots[]`.
 *
 * Usage in stream tree:
 *   { type: "rhythm", src: "beat.mp3", spots: [0.5, 1.2, 1.9], children: [...] }
 */
import * as React from "react";
import { Sequence, Audio as RemotionAudio, useRemotionEnvironment, useVideoConfig, staticFile } from "remotion";
import { useFrameEvents } from "../context/index";
import type { Rhythm } from "../schema/index";

function resolveAudioSrc(src: string): string {
  if (/^(https?:|data:|blob:|file:|\/)/.test(src)) return src;
  return staticFile(src);
}

export function RhythmLeaf({ stream }: { stream: Rhythm }) {
  const { fps } = useVideoConfig();
  const environment = useRemotionEnvironment();
  const totalDur = stream.durationInSeconds ?? stream.actions[0]?.end ?? 1;
  useFrameEvents(stream.on, Math.max(1, Math.floor(totalDur * fps)));

  if (!stream.src || environment.isStudio) return null;

  const resolvedSrc = resolveAudioSrc(stream.src);

  return (
    <>
      {stream.actions.map((a) => {
        const start = a.start ?? 0;
        const end = a.end ?? start + 1;
        const volume = a.volume ?? stream.volume ?? 1;
        return (
          <Sequence
            key={a.id}
            name={stream.src ?? "rhythm"}
            durationInFrames={Math.max(1, Math.floor(fps * (end - start)))}
            from={Math.floor(fps * start)}
            layout="none"
            showInTimeline={false}
          >
            <RemotionAudio
              src={resolvedSrc}
              muted={volume === 0}
              volume={volume}
              loop
              showInTimeline={false}
            />
          </Sequence>
        );
      })}
    </>
  );
}
