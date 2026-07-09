/**
 * Effect stream type — wraps children with keyframe-based CSS animation.
 *
 * Usage in stream tree:
 *   { type: "effect", animation: "fadeIn", children: [{ type: "video", ... }] }
 *
 * The animation is computed frame-by-frame via Remotion's interpolate(),
 * producing a wrapper <div> with the animated styles.
 */
import * as React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { cssJS } from "../utils/index";
import { useFrameEvents } from "../context/index";
import { resolveAnimation, interpolateKeyframes } from "./keyframes";
import type { Effect as EffectStream } from "../schema/index";

export function EffectWrapper({
  stream,
  children,
}: {
  stream: EffectStream;
  children: React.ReactNode;
}) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const totalDur = stream.durationInSeconds ?? stream.actions[0]?.end ?? 1;
  useFrameEvents(stream.on, Math.max(1, Math.floor(totalDur * fps)));

  const actions = stream.actions ?? [];

  const styles = React.useMemo(() => {
    const result: Record<string, string>[] = [];

    for (const action of actions) {
      const start = Math.ceil(action.start * fps);
      const end = Math.ceil(action.end * fps);
      const durationInFrames = end - start;
      if (durationInFrames <= 0) continue;

      const animation = stream.animation;
      const timingFn = stream.animationTimingFunction;
      const iterCount = stream.animationIterationCount ?? 1;
      const style = (cssJS(action.style) ?? {}) as Record<string, string>;

      // Handle iteration count: loop the animation within the action range
      let currentFrame = frame;
      if (iterCount > 0 && durationInFrames > 0) {
        const iteration = Math.floor((frame - start) / durationInFrames);
        if (iteration < iterCount) {
          currentFrame = start + ((frame - start) % durationInFrames);
        }
      }

      if (currentFrame >= start && currentFrame < end) {
        const actionFrame = currentFrame - start;

        if (animation) {
          const config = resolveAnimation(animation, stream.customKeyframes);
          if (config) {
            const animStyle = interpolateKeyframes(config, actionFrame, {
              fps,
              durationInSeconds: durationInFrames / fps,
              timingFunction: timingFn,
            });
            if (animStyle) Object.assign(style, animStyle);
          }
        }

        if (Object.keys(style).length > 0) {
          result.push(style);
        }
      }
    }

    return result;
  }, [frame, fps, actions, stream.animation, stream.animationTimingFunction, stream.animationIterationCount, stream.customKeyframes]);

  if (styles.length === 0) return <>{children}</>;

  return (
    <div
      style={Object.assign({ width, height, position: "absolute" as const, inset: 0 }, ...styles)}
      className="effect"
    >
      {children}
    </div>
  );
}
