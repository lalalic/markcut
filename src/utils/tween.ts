/**
 * Tween animation resolver for JSX components rendered via react-jsx-parser.
 *
 * Makes `tween(from, to, easing?)` expressions work inside component JSX
 * by providing it as a binding to JsxParser. The tween function uses
 * Remotion's `interpolate()` with the current frame to produce animated values.
 *
 * Usage in markdown JSX:
 *   <StatCounter value={tween(0, 100)} />
 *   <div style={{ background: tween('#000', '#FFF', 'easeOut') }} />
 *   <div style={{ borderRadius: tween(0, 100, 'easeOut') }} />
 */
import * as React from "react";
import { interpolate, useCurrentFrame, Easing } from "remotion";

/** Built-in easing name → Remotion easing function. */
const EASING_MAP: Record<string, ((t: number) => number) | undefined> = {
  linear: undefined,
  ease: Easing.ease,
  easeIn: Easing.in(Easing.ease),
  easeOut: Easing.out(Easing.ease),
  easeInOut: Easing.inOut(Easing.ease),
};

/** Check if a value looks like a hex color string. */
function isHexColor(v: unknown): v is string {
  return typeof v === "string" && /^#[0-9a-fA-F]{3,8}$/.test(v);
}

/** Parse a hex color (#RGB, #RRGGBB) to a number. */
function hexToNumber(hex: string): number {
  const s = hex.replace(/^#/, "");
  if (s.length === 3) {
    return parseInt(s[0]! + s[0] + s[1]! + s[1] + s[2]! + s[2], 16);
  }
  return parseInt(s, 16);
}

/** Lerp between two numbers. */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * React hook that creates tween-related bindings for react-jsx-parser.
 *
 * Returns an object with:
 *   - `tween(from, to, easing?)` — frame-interpolated value (number or hex color)
 *   - `interpolate` — Remotion's interpolate function (for advanced use)
 *
 * Must be called at the top level of a React component (per Rules of Hooks).
 *
 * @example
 *   const bindings = useTweenBindings(action);
 *   <JsxParser bindings={{ ...stream.data, ...bindings }} />
 */
export function useTweenBindings(action: { start?: number; end?: number }): Record<string, unknown> {
  const frame = useCurrentFrame();
  const actionDurationFrames = Math.max(1, Math.floor(((action.end ?? 1) - (action.start ?? 0)) * 30));

  // Per-render cache: cleared each time frame changes.
  // Only lives for one render — avoids re-computing the same tween()
  // call if it appears multiple times in the JSX on the same frame.
  const cacheRef = React.useRef<Map<string, number | string>>(new Map());
  const prevFrameRef = React.useRef(frame);

  if (prevFrameRef.current !== frame) {
    cacheRef.current = new Map();
    prevFrameRef.current = frame;
  }

  const tween = React.useCallback(
    (from: unknown, to: unknown, easing?: string): unknown => {
      const key = `${from},${to},${easing || "linear"}`;
      const cached = cacheRef.current.get(key);
      if (cached !== undefined) return cached;

      const easingFn = easing ? EASING_MAP[easing] : undefined;

      // Color tween: interpolate each channel
      if (isHexColor(from) && isHexColor(to)) {
        const fromNum = hexToNumber(from);
        const toNum = hexToNumber(to);
        const t = actionDurationFrames > 0
          ? interpolate(frame, [0, actionDurationFrames], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: easingFn,
            })
          : 1;
        const r = Math.round(lerp((fromNum >> 16) & 0xff, (toNum >> 16) & 0xff, t));
        const g = Math.round(lerp((fromNum >> 8) & 0xff, (toNum >> 8) & 0xff, t));
        const b = Math.round(lerp(fromNum & 0xff, toNum & 0xff, t));
        const val = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
        cacheRef.current.set(key, val);
        return val;
      }

      // Numeric tween
      const fromNum = Number(from);
      const toNum = Number(to);
      if (!Number.isFinite(fromNum) || !Number.isFinite(toNum)) {
        return to;
      }

      const val = interpolate(frame, [0, actionDurationFrames], [fromNum, toNum], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: easingFn,
      });
      cacheRef.current.set(key, val);
      return val;
    },
    [frame, actionDurationFrames],
  );

  return { tween, interpolate };
}
