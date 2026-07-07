import * as React from "react";
import { Sequence, Series, Loop, useVideoConfig } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { flip } from "@remotion/transitions/flip";
import { clockWipe } from "@remotion/transitions/clock-wipe";

import { ComposeContext, AudioContext } from "../context/index";
import { cssJS, toClassName } from "../utils/index";
import type { Folder as FolderStream, Stream } from "../schema/index";

import { VideoLeaf } from "./Video";
import { AudioLeaf } from "./Audio";
import { ImageLeaf } from "./Image";
import { ComponentLeaf } from "./Component";
import { RhythmLeaf } from "./Rhythm";
import { MapLeaf } from "./Map";
import { IncludeLeaf } from "./Include";
import { SceneLeaf } from "./Scene";
import { EffectWrapper } from "./Effect";

const Leaves: Record<string, React.ComponentType<{ stream: any }>> = {
  video: VideoLeaf,
  audio: AudioLeaf,
  image: ImageLeaf,
  component: ComponentLeaf,
  rhythm: RhythmLeaf,
  map: MapLeaf,
  include: IncludeLeaf,
  scene: SceneLeaf,
};

const TransitionPresets: Record<string, (opts?: any) => any> = {
  fade,
  slide,
  wipe,
  flip,
  clockWipe,
};

const NotSeries = ({ children }: { children: React.ReactNode }) => <>{children}</>;
NotSeries.Sequence = ({ children }: { children: React.ReactNode; durationInFrames?: number; layout?: any }) => (
  <>{children}</>
);

export function FolderLeaf({ stream }: { stream: FolderStream }) {
  const { fps, width, height } = useVideoConfig();
  const { Container } = React.useContext(ComposeContext);
  const parentAudio = React.useContext(AudioContext);

  const isSeries = !!stream.isSeries;
  const transition = stream.transition;
  const transitionTime = stream.transitionTime ?? 0.5;
  const isRoot = stream.id === "root";

  const TypedSeries: any = React.useMemo(() => {
    if (!isSeries) return NotSeries;
    return transition ? TransitionSeries : Series;
  }, [isSeries, transition]);

  const transEl = React.useMemo(() => {
    if (!isSeries || !transition) return null;
    const presentation = TransitionPresets[transition]?.(
      transition === "clockWipe" ? { width, height } : undefined,
    );
    return (
      <TransitionSeries.Transition
        presentation={presentation}
        timing={linearTiming({ durationInFrames: Math.floor(fps * transitionTime) })}
      />
    );
  }, [isSeries, transition, transitionTime, fps, width, height]);

  const visibleChildren = (stream.children as Stream[]).filter((c) => c.visible !== false);

  const sequences = visibleChildren
    .map((child) => {
      const dur = child.durationInSeconds ?? 0;
      const durFrames = Math.max(1, Math.floor(dur * fps));
      const SequenceWrap = TypedSeries.Sequence ?? Sequence;
      const isLeaf = child.type !== "folder" && child.type !== "root" && child.type !== "effect";
      const childContent = isLeaf
        ? React.createElement(Leaves[child.type] ?? (() => null), { stream: child })
        : child.type === "effect"
          ? <EffectWrapper stream={child as any}><FolderLeaf stream={child as any} /></EffectWrapper>
          : React.createElement(FolderLeaf, { stream: child as FolderStream });
      const wrapped = (
          <Container
            id={child.id}
            type={child.type}
            style={cssJS(child.style) as React.CSSProperties}
            className={`${child.type} ${toClassName(child.id ?? "")}`}
          >
            {childContent}
          </Container>
        );

      const seq = (
        <SequenceWrap key={child.id} durationInFrames={durFrames} layout="none">
          {wrapped}
        </SequenceWrap>
      );

      if (child.isBackground && stream.durationInSeconds) {
        const times = Math.max(1, Math.ceil((stream.durationInSeconds * fps) / durFrames));
        return (
          <Loop key={child.id} durationInFrames={durFrames} times={times} showInTimeline={false}>
            {wrapped}
          </Loop>
        );
      }

      return seq;
    })
    .filter(Boolean);

  // interleave transitions
  if (isSeries && transEl) {
    for (let i = 1; i < sequences.length; i += 2) {
      sequences.splice(i, 0, React.cloneElement(transEl, { key: `t${i}` } as any));
    }
  }

  const audioCtx = React.useMemo(
    () => (stream.type !== "folder" ? { id: stream.id, parent: parentAudio } : parentAudio),
    [stream.id, stream.type, parentAudio],
  );

  if (visibleChildren.length === 0 || stream.visible === false) return null;

  const containerStyle = cssJS(stream.style) as React.CSSProperties;
  const orientation = isRoot ? (width > height ? "landscape" : "portrait") : "";

  return (
    <AudioContext.Provider value={audioCtx as any}>
      <Container
        id={stream.id}
        type={stream.type}
        style={containerStyle}
        className={`${orientation} ${stream.type}`.trim()}
      >
        {isSeries ? <TypedSeries>{sequences}</TypedSeries> : sequences}
      </Container>
    </AudioContext.Provider>
  );
}
