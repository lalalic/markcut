import * as React from "react";
import { Sequence, Img, useVideoConfig, staticFile } from "remotion";
import { cssJS } from "../utils/index";
import type { Image } from "../schema/index";
import { FrameSyncStyle } from "./FrameSyncStyle";

function resolveImageSrc(src: string): string {
  if (/^(https?:|data:|blob:|file:|\/)/.test(src)) return src;
  return staticFile(src);
}

export function ImageLeaf({ stream }: { stream: Image }) {
  const { fps } = useVideoConfig();
  if (!stream.src) return null;
  const resolvedSrc = resolveImageSrc(stream.src);

  return (
    <>
      {stream.actions.map((a) => {
        const start = a.start ?? 0;
        const end = a.end ?? start + 1;
        return (
          <Sequence
            key={a.id}
            durationInFrames={Math.max(1, Math.floor(fps * (end - start)))}
            from={Math.floor(fps * start)}
            layout="none"
          >
            <FrameSyncStyle style={cssJS(a.style)}>
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
      })}
    </>
  );
}
