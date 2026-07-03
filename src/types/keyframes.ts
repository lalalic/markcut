/**
 * Frame-accurate CSS keyframe interpolation using Remotion's interpolate().
 * No browser DOM deps.
 *
 * Keyframes are defined as JSON: { "0": { opacity: "0" }, "100": { opacity: "1" } }
 * Bundled presets cover common animate.css animations.
 */
import { interpolate, Easing } from "remotion";

/** Percentage → style properties. Keys are stringified percentages (0–100). */
export type KeyframeData = Record<string, Record<string, string>>;

export interface KeyframeConfig {
  steps: number[]; // sorted descending (100, 50, 0, …)
  styles: Record<string, Record<string, string>>;
  timingFunction?: string;
}

export function parseKeyframeData(data: KeyframeData): KeyframeConfig {
  const styles: Record<string, Record<string, string>> = {};
  const steps: number[] = [];
  for (const [key, style] of Object.entries(data)) {
    const perc = parseFloat(key);
    styles[String(perc)] = style;
    if (!steps.includes(perc)) steps.push(perc);
  }
  steps.sort((a, b) => b - a);
  return { steps, styles };
}

// ---------------------------------------------------------------------------
// Easing helpers
// ---------------------------------------------------------------------------

function getEasing(timing?: string): ((t: number) => number) | undefined {
  if (!timing) return undefined;
  const parts = timing.split(/[(),]/);
  const fx = (parts[0] ?? "").trim();
  switch (fx) {
    case "linear":
      return Easing.linear;
    case "cubic-bezier":
      return Easing.bezier(
        parseFloat(parts[1] ?? "0"),
        parseFloat(parts[2] ?? "0"),
        parseFloat(parts[3] ?? "0"),
        parseFloat(parts[4] ?? "0"),
      );
    case "ease":
      return Easing.ease;
    case "ease-in":
      return Easing.in(Easing.ease);
    case "ease-out":
      return Easing.out(Easing.ease);
    case "ease-in-out":
      return Easing.inOut(Easing.ease);
    default:
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// Value interpolation — replaces numbers inside CSS value strings
// ---------------------------------------------------------------------------

function interpolateValue(
  from: string,
  to: string,
  fn: (range: [number, number]) => number,
): string {
  const numRe = /(-?[\d.]+)/g;
  const toNums = to.match(numRe);
  const fromNums = from.match(numRe);
  if (!fromNums && !toNums) return to;
  if (!fromNums || !toNums || fromNums.length !== toNums.length) return to;
  let i = 0;
  return from.replace(numRe, () => {
    const result = fn([parseFloat(fromNums[i] ?? "0"), parseFloat(toNums[i] ?? "0")]);
    i++;
    return String(Math.round(result * 1000) / 1000);
  });
}

// ---------------------------------------------------------------------------
// Main interpolation
// ---------------------------------------------------------------------------

export function interpolateKeyframes(
  config: KeyframeConfig,
  frame: number,
  opts: { fps: number; durationInSeconds: number; timingFunction?: string },
): Record<string, string> | null {
  const { fps, durationInSeconds, timingFunction } = opts;
  const durationInFrames = durationInSeconds * fps;
  if (durationInFrames <= 0) return null;

  const perc = (frame * 100) / durationInFrames;
  const { steps, styles } = config;

  // Find the two keyframe stops bracketing the current percentage
  const i = steps.findIndex((s) => s <= perc);
  if (i === -1) return null;

  const fromPerc = steps[i]!;
  const toPerc = steps[i - 1] ?? fromPerc;
  const fromStyle = styles[String(fromPerc)];
  const toStyle = styles[String(toPerc)] ?? fromStyle;
  if (!fromStyle || !toStyle) return null;

  const frameRange: [number, number] = [
    Math.floor((fromPerc * durationInFrames) / 100),
    Math.floor((toPerc * durationInFrames) / 100),
  ];

  const easing = getEasing(timingFunction || config.timingFunction);

  const result: Record<string, string> = {};
  for (const key of Object.keys(toStyle)) {
    if (key === "animationTimingFunction") continue;
    const fromVal = fromStyle[key] ?? toStyle[key];
    const toVal = toStyle[key] ?? fromVal;
    if (!fromVal || !toVal) continue;
    result[key] = interpolateValue(fromVal, toVal, (valueRange) => {
      if (valueRange[0] === valueRange[1] || frameRange[0] === frameRange[1]) {
        return valueRange[0];
      }
      return interpolate(frame, frameRange, valueRange, {
        easing,
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
    });
  }

  return Object.keys(result).length > 0 ? result : null;
}

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

export function resolveAnimation(
  name: string,
  custom?: KeyframeData,
): KeyframeConfig | null {
  if (custom) return parseKeyframeData(custom);
  return builtinAnimations[name] ?? null;
}

// ---------------------------------------------------------------------------
// Bundled animations (animate.css subset, all properties explicit per step)
// ---------------------------------------------------------------------------

export const builtinAnimations: Record<string, KeyframeConfig> = {
  // ── Fades ──────────────────────────────────────────────────────────────
  fadeIn: parseKeyframeData({
    "0": { opacity: "0" },
    "100": { opacity: "1" },
  }),
  fadeOut: parseKeyframeData({
    "0": { opacity: "1" },
    "100": { opacity: "0" },
  }),
  fadeInDown: parseKeyframeData({
    "0": { opacity: "0", transform: "translate3d(0, -100%, 0)" },
    "100": { opacity: "1", transform: "translate3d(0, 0, 0)" },
  }),
  fadeInUp: parseKeyframeData({
    "0": { opacity: "0", transform: "translate3d(0, 100%, 0)" },
    "100": { opacity: "1", transform: "translate3d(0, 0, 0)" },
  }),
  fadeInLeft: parseKeyframeData({
    "0": { opacity: "0", transform: "translate3d(-100%, 0, 0)" },
    "100": { opacity: "1", transform: "translate3d(0, 0, 0)" },
  }),
  fadeInRight: parseKeyframeData({
    "0": { opacity: "0", transform: "translate3d(100%, 0, 0)" },
    "100": { opacity: "1", transform: "translate3d(0, 0, 0)" },
  }),
  fadeOutDown: parseKeyframeData({
    "0": { opacity: "1", transform: "translate3d(0, 0, 0)" },
    "100": { opacity: "0", transform: "translate3d(0, 100%, 0)" },
  }),
  fadeOutUp: parseKeyframeData({
    "0": { opacity: "1", transform: "translate3d(0, 0, 0)" },
    "100": { opacity: "0", transform: "translate3d(0, -100%, 0)" },
  }),
  fadeOutLeft: parseKeyframeData({
    "0": { opacity: "1", transform: "translate3d(0, 0, 0)" },
    "100": { opacity: "0", transform: "translate3d(-100%, 0, 0)" },
  }),
  fadeOutRight: parseKeyframeData({
    "0": { opacity: "1", transform: "translate3d(0, 0, 0)" },
    "100": { opacity: "0", transform: "translate3d(100%, 0, 0)" },
  }),

  // ── Slides ─────────────────────────────────────────────────────────────
  slideInDown: parseKeyframeData({
    "0": { transform: "translate3d(0, -100%, 0)" },
    "100": { transform: "translate3d(0, 0, 0)" },
  }),
  slideInUp: parseKeyframeData({
    "0": { transform: "translate3d(0, 100%, 0)" },
    "100": { transform: "translate3d(0, 0, 0)" },
  }),
  slideInLeft: parseKeyframeData({
    "0": { transform: "translate3d(-100%, 0, 0)" },
    "100": { transform: "translate3d(0, 0, 0)" },
  }),
  slideInRight: parseKeyframeData({
    "0": { transform: "translate3d(100%, 0, 0)" },
    "100": { transform: "translate3d(0, 0, 0)" },
  }),

  // ── Zooms ──────────────────────────────────────────────────────────────
  zoomIn: parseKeyframeData({
    "0": { opacity: "0", transform: "scale3d(0.3, 0.3, 0.3)" },
    "50": { opacity: "1", transform: "scale3d(0.65, 0.65, 0.65)" },
    "100": { opacity: "1", transform: "scale3d(1, 1, 1)" },
  }),
  zoomOut: parseKeyframeData({
    "0": { opacity: "1", transform: "scale3d(1, 1, 1)" },
    "50": { opacity: "0", transform: "scale3d(0.3, 0.3, 0.3)" },
    "100": { opacity: "0", transform: "scale3d(0.3, 0.3, 0.3)" },
  }),

  // ── Attention seekers ──────────────────────────────────────────────────
  pulse: parseKeyframeData({
    "0": { transform: "scale3d(1, 1, 1)" },
    "50": { transform: "scale3d(1.05, 1.05, 1.05)" },
    "100": { transform: "scale3d(1, 1, 1)" },
  }),
  flash: parseKeyframeData({
    "0": { opacity: "1" },
    "25": { opacity: "0" },
    "50": { opacity: "1" },
    "75": { opacity: "0" },
    "100": { opacity: "1" },
  }),
  bounce: parseKeyframeData({
    "0": { transform: "translate3d(0, 0, 0)" },
    "20": { transform: "translate3d(0, 0, 0)" },
    "40": { transform: "translate3d(0, -30px, 0) scaleY(1.1)" },
    "43": { transform: "translate3d(0, -30px, 0) scaleY(1.1)" },
    "53": { transform: "translate3d(0, 0, 0)" },
    "70": { transform: "translate3d(0, -15px, 0) scaleY(1.05)" },
    "80": { transform: "translate3d(0, 0, 0) scaleY(0.95)" },
    "90": { transform: "translate3d(0, -4px, 0) scaleY(1.02)" },
    "100": { transform: "translate3d(0, 0, 0)" },
  }),
  heartBeat: parseKeyframeData({
    "0": { transform: "scale(1)" },
    "14": { transform: "scale(1.3)" },
    "28": { transform: "scale(1)" },
    "42": { transform: "scale(1.3)" },
    "70": { transform: "scale(1)" },
    "100": { transform: "scale(1)" },
  }),
  rubberBand: parseKeyframeData({
    "0": { transform: "scale3d(1, 1, 1)" },
    "30": { transform: "scale3d(1.25, 0.75, 1)" },
    "40": { transform: "scale3d(0.75, 1.25, 1)" },
    "50": { transform: "scale3d(1.15, 0.85, 1)" },
    "65": { transform: "scale3d(0.95, 1.05, 1)" },
    "75": { transform: "scale3d(1.05, 0.95, 1)" },
    "100": { transform: "scale3d(1, 1, 1)" },
  }),
  shakeX: parseKeyframeData({
    "0": { transform: "translate3d(0, 0, 0)" },
    "10": { transform: "translate3d(-10px, 0, 0)" },
    "20": { transform: "translate3d(10px, 0, 0)" },
    "30": { transform: "translate3d(-10px, 0, 0)" },
    "40": { transform: "translate3d(10px, 0, 0)" },
    "50": { transform: "translate3d(-10px, 0, 0)" },
    "60": { transform: "translate3d(10px, 0, 0)" },
    "70": { transform: "translate3d(-10px, 0, 0)" },
    "80": { transform: "translate3d(10px, 0, 0)" },
    "90": { transform: "translate3d(-10px, 0, 0)" },
    "100": { transform: "translate3d(0, 0, 0)" },
  }),

  // ── Bouncing entrances ─────────────────────────────────────────────────
  bounceIn: parseKeyframeData({
    "0": { opacity: "0", transform: "scale3d(0.3, 0.3, 0.3)" },
    "20": { opacity: "0.3", transform: "scale3d(1.1, 1.1, 1.1)" },
    "40": { opacity: "0.6", transform: "scale3d(0.9, 0.9, 0.9)" },
    "60": { opacity: "1", transform: "scale3d(1.03, 1.03, 1.03)" },
    "80": { opacity: "1", transform: "scale3d(0.97, 0.97, 0.97)" },
    "100": { opacity: "1", transform: "scale3d(1, 1, 1)" },
  }),

  // ── Rotations ──────────────────────────────────────────────────────────
  rotateIn: parseKeyframeData({
    "0": { opacity: "0", transform: "rotate(-200deg)" },
    "100": { opacity: "1", transform: "rotate(0deg)" },
  }),
  rotateOut: parseKeyframeData({
    "0": { opacity: "1", transform: "rotate(0deg)" },
    "100": { opacity: "0", transform: "rotate(200deg)" },
  }),
  rotateInDownLeft: parseKeyframeData({
    "0": { opacity: "0", transform: "rotate3d(0, 0, 1, -45deg)" },
    "100": { opacity: "1", transform: "rotate3d(0, 0, 1, 0deg)" },
  }),
  rotateInDownRight: parseKeyframeData({
    "0": { opacity: "0", transform: "rotate3d(0, 0, 1, 45deg)" },
    "100": { opacity: "1", transform: "rotate3d(0, 0, 1, 0deg)" },
  }),
  rotateInUpLeft: parseKeyframeData({
    "0": { opacity: "0", transform: "rotate3d(0, 0, 1, 45deg)" },
    "100": { opacity: "1", transform: "rotate3d(0, 0, 1, 0deg)" },
  }),
  rotateInUpRight: parseKeyframeData({
    "0": { opacity: "0", transform: "rotate3d(0, 0, 1, -45deg)" },
    "100": { opacity: "1", transform: "rotate3d(0, 0, 1, 0deg)" },
  }),

  // ── Flips ──────────────────────────────────────────────────────────────
  flipInX: parseKeyframeData({
    "0": { opacity: "0", transform: "perspective(400px) rotate3d(1, 0, 0, 90deg)" },
    "40": { opacity: "1", transform: "perspective(400px) rotate3d(1, 0, 0, -20deg)" },
    "60": { transform: "perspective(400px) rotate3d(1, 0, 0, 10deg)" },
    "80": { transform: "perspective(400px) rotate3d(1, 0, 0, -5deg)" },
    "100": { opacity: "1", transform: "perspective(400px)" },
  }),
  flipInY: parseKeyframeData({
    "0": { opacity: "0", transform: "perspective(400px) rotate3d(0, 1, 0, 90deg)" },
    "40": { opacity: "1", transform: "perspective(400px) rotate3d(0, 1, 0, -20deg)" },
    "60": { transform: "perspective(400px) rotate3d(0, 1, 0, 10deg)" },
    "80": { transform: "perspective(400px) rotate3d(0, 1, 0, -5deg)" },
    "100": { opacity: "1", transform: "perspective(400px)" },
  }),

  // ── Slides out ─────────────────────────────────────────────────────────
  slideOutDown: parseKeyframeData({
    "0": { transform: "translate3d(0, 0, 0)" },
    "100": { transform: "translate3d(0, 100%, 0)" },
  }),
  slideOutLeft: parseKeyframeData({
    "0": { transform: "translate3d(0, 0, 0)" },
    "100": { transform: "translate3d(-100%, 0, 0)" },
  }),
  slideOutRight: parseKeyframeData({
    "0": { transform: "translate3d(0, 0, 0)" },
    "100": { transform: "translate3d(100%, 0, 0)" },
  }),
  slideOutUp: parseKeyframeData({
    "0": { transform: "translate3d(0, 0, 0)" },
    "100": { transform: "translate3d(0, -100%, 0)" },
  }),

  // ── Zoom variants ──────────────────────────────────────────────────────
  zoomInDown: parseKeyframeData({
    "0": { opacity: "0", transform: "scale3d(0.1, 0.1, 0.1) translate3d(0, -1000px, 0)" },
    "60": { opacity: "1", transform: "scale3d(0.475, 0.475, 0.475) translate3d(0, 60px, 0)" },
    "100": { opacity: "1", transform: "scale3d(1, 1, 1) translate3d(0, 0, 0)" },
  }),
  zoomInLeft: parseKeyframeData({
    "0": { opacity: "0", transform: "scale3d(0.1, 0.1, 0.1) translate3d(-1000px, 0, 0)" },
    "60": { opacity: "1", transform: "scale3d(0.475, 0.475, 0.475) translate3d(10px, 0, 0)" },
    "100": { opacity: "1", transform: "scale3d(1, 1, 1) translate3d(0, 0, 0)" },
  }),
  zoomInRight: parseKeyframeData({
    "0": { opacity: "0", transform: "scale3d(0.1, 0.1, 0.1) translate3d(1000px, 0, 0)" },
    "60": { opacity: "1", transform: "scale3d(0.475, 0.475, 0.475) translate3d(-10px, 0, 0)" },
    "100": { opacity: "1", transform: "scale3d(1, 1, 1) translate3d(0, 0, 0)" },
  }),
  zoomInUp: parseKeyframeData({
    "0": { opacity: "0", transform: "scale3d(0.1, 0.1, 0.1) translate3d(0, 1000px, 0)" },
    "60": { opacity: "1", transform: "scale3d(0.475, 0.475, 0.475) translate3d(0, -60px, 0)" },
    "100": { opacity: "1", transform: "scale3d(1, 1, 1) translate3d(0, 0, 0)" },
  }),

  // ── Attention seekers (extended) ───────────────────────────────────────
  shakeY: parseKeyframeData({
    "0": { transform: "translate3d(0, 0, 0)" },
    "10": { transform: "translate3d(0, -10px, 0)" },
    "20": { transform: "translate3d(0, 10px, 0)" },
    "30": { transform: "translate3d(0, -10px, 0)" },
    "40": { transform: "translate3d(0, 10px, 0)" },
    "50": { transform: "translate3d(0, -10px, 0)" },
    "60": { transform: "translate3d(0, 10px, 0)" },
    "70": { transform: "translate3d(0, -10px, 0)" },
    "80": { transform: "translate3d(0, 10px, 0)" },
    "90": { transform: "translate3d(0, -10px, 0)" },
    "100": { transform: "translate3d(0, 0, 0)" },
  }),
  swing: parseKeyframeData({
    "20": { transform: "rotate3d(0, 0, 1, 15deg)" },
    "40": { transform: "rotate3d(0, 0, 1, -10deg)" },
    "60": { transform: "rotate3d(0, 0, 1, 5deg)" },
    "80": { transform: "rotate3d(0, 0, 1, -5deg)" },
    "100": { transform: "rotate3d(0, 0, 1, 0deg)" },
  }),
  tada: parseKeyframeData({
    "0": { transform: "scale3d(1, 1, 1)" },
    "10": { transform: "scale3d(0.9, 0.9, 0.9) rotate3d(0, 0, 1, -3deg)" },
    "20": { transform: "scale3d(0.9, 0.9, 0.9) rotate3d(0, 0, 1, -3deg)" },
    "30": { transform: "scale3d(1.1, 1.1, 1.1) rotate3d(0, 0, 1, 3deg)" },
    "50": { transform: "scale3d(1.1, 1.1, 1.1) rotate3d(0, 0, 1, 3deg)" },
    "70": { transform: "scale3d(1.1, 1.1, 1.1) rotate3d(0, 0, 1, 3deg)" },
    "90": { transform: "scale3d(1.1, 1.1, 1.1) rotate3d(0, 0, 1, 3deg)" },
    "100": { transform: "scale3d(1, 1, 1)" },
  }),
  wobble: parseKeyframeData({
    "0": { transform: "translate3d(0, 0, 0)" },
    "15": { transform: "translate3d(-25%, 0, 0) rotate3d(0, 0, 1, -5deg)" },
    "30": { transform: "translate3d(20%, 0, 0) rotate3d(0, 0, 1, 3deg)" },
    "45": { transform: "translate3d(-15%, 0, 0) rotate3d(0, 0, 1, -3deg)" },
    "60": { transform: "translate3d(10%, 0, 0) rotate3d(0, 0, 1, 2deg)" },
    "75": { transform: "translate3d(-5%, 0, 0) rotate3d(0, 0, 1, -1deg)" },
    "100": { transform: "translate3d(0, 0, 0)" },
  }),
  jello: parseKeyframeData({
    "0": { transform: "translate3d(0, 0, 0)" },
    "11.1": { transform: "translate3d(0, 0, 0)" },
    "22.2": { transform: "skewX(-12.5deg) skewY(-12.5deg)" },
    "33.3": { transform: "skewX(6.25deg) skewY(6.25deg)" },
    "44.4": { transform: "skewX(-3.125deg) skewY(-3.125deg)" },
    "55.5": { transform: "skewX(1.5625deg) skewY(1.5625deg)" },
    "66.6": { transform: "skewX(-0.78125deg) skewY(-0.78125deg)" },
    "77.7": { transform: "skewX(0.390625deg) skewY(0.390625deg)" },
    "88.8": { transform: "skewX(-0.1953125deg) skewY(-0.1953125deg)" },
    "100": { transform: "translate3d(0, 0, 0)" },
  }),

  // ── Specials ───────────────────────────────────────────────────────────
  rollIn: parseKeyframeData({
    "0": { opacity: "0", transform: "translate3d(-100%, 0, 0) rotate3d(0, 0, 1, -120deg)" },
    "100": { opacity: "1", transform: "translate3d(0, 0, 0)" },
  }),
  rollOut: parseKeyframeData({
    "0": { opacity: "1", transform: "translate3d(0, 0, 0)" },
    "100": { opacity: "0", transform: "translate3d(100%, 0, 0) rotate3d(0, 0, 1, 120deg)" },
  }),
  jackInTheBox: parseKeyframeData({
    "0": { opacity: "0", transform: "scale(0.1) rotate(30deg)" },
    "50": { transform: "rotate(-10deg)" },
    "70": { transform: "rotate(3deg)" },
    "100": { opacity: "1", transform: "scale(1)" },
  }),

  // ── Light speed ────────────────────────────────────────────────────────
  lightSpeedIn: parseKeyframeData({
    "0": { opacity: "0", transform: "translate3d(100%, 0, 0) skewX(-30deg)" },
    "60": { opacity: "1", transform: "skewX(20deg)" },
    "80": { transform: "skewX(-5deg)" },
    "100": { opacity: "1", transform: "translate3d(0, 0, 0)" },
  }),
  lightSpeedOut: parseKeyframeData({
    "0": { opacity: "1", transform: "translate3d(0, 0, 0) skewX(0)" },
    "100": { opacity: "0", transform: "translate3d(100%, 0, 0) skewX(30deg)" },
  }),
};
