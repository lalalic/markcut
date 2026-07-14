import * as React from "react";
import { Sequence, Img, useVideoConfig, staticFile } from "remotion";
import { cssJS } from "../utils/index";
import { useFrameEvents } from "../context/index";
import type { Image } from "../schema/index";
import { FrameSyncStyle } from "./FrameSyncStyle";

function resolveImageSrc(src: string): string {
  if (/^(https?:|data:|blob:|file:|\/)/.test(src)) return src;
  return staticFile(src);
}

export function ImageLeaf({ stream }: { stream: Image }) {
  const { fps } = useVideoConfig();
  const start = stream.start ?? 0;
  const end = stream.end ?? start + (stream.duration ?? 1);
  const totalDur = stream.durationInSeconds ?? end;
  useFrameEvents(stream.on, Math.max(1, Math.floor(totalDur * fps)));
  if (!stream.src) return null;
  const resolvedSrc = resolveImageSrc(stream.src);

  return (
    <Sequence
      durationInFrames={Math.max(1, Math.floor(fps * (end - start)))}
      from={Math.floor(fps * start)}
      layout="none"
    >
      <FrameSyncStyle style={cssJS(stream.style)}>
        <Img
          src={resolvedSrc}
          style={{
            width: "100%",
            height: "100%",
            objectFit: stream.fit,
          }}
          onDragStart={(e) => {
            e.stopPropagation();
            return false;
          }}
        />
      </FrameSyncStyle>
    </Sequence>
  );
}
