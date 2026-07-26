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
  const startSec = stream.start ?? 0;
  const endSec = stream.end ?? startSec + (stream.duration ?? 1);
  const totalDur = stream.durationInSeconds ?? endSec;
  useFrameEvents(stream.on, Math.max(1, Math.floor(totalDur * fps)));

  const styles = React.useMemo(() => {
    const start = Math.ceil(startSec * fps);
    const end = Math.ceil(endSec * fps);
    const durationInFrames = end - start;
    if (durationInFrames <= 0) return [] as Record<string, string>[];

    // Use animationDurationSeconds for animation timing when available
    // (set by wrapWithEffects for background nodes where end is set to parent
    //  duration but the animation spec duration is preserved separately).
    const animDurationSec = stream.animationDurationSeconds ?? stream.durationInSeconds ?? (durationInFrames / fps);
    const animDurationFrames = Math.ceil(animDurationSec * fps);

    const animation = stream.animation;
    const timingFn = stream.animationTimingFunction;
    const iterCount = stream.animationIterationCount ?? 1;
    const style = (cssJS(stream.style) ?? {}) as Record<string, string>;

    // Handle iteration count: loop the animation within the span.
    // The animation period is animDurationFrames (not the full span duration).
    let currentFrame = frame;
    if (iterCount > 0 && animDurationFrames > 0) {
      const iteration = Math.floor((frame - start) / animDurationFrames);
      if (iteration < iterCount) {
        currentFrame = start + ((frame - start) % animDurationFrames);
      }
    }

    if (currentFrame >= start && currentFrame < end) {
      const actionFrame = currentFrame - start;

      if (animation) {
        const config = resolveAnimation(animation, stream.customKeyframes);
        if (config) {
          const animStyle = interpolateKeyframes(config, actionFrame, {
            fps,
            durationInSeconds: animDurationSec,
            timingFunction: timingFn,
          });
          if (animStyle) Object.assign(style, animStyle);
        }
      }
    }

    return Object.keys(style).length > 0 ? [style] : [];
  }, [frame, fps, startSec, endSec, stream.animation, stream.animationTimingFunction, stream.animationIterationCount, stream.customKeyframes, stream.style, stream.animationDurationSeconds, stream.durationInSeconds]);

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
