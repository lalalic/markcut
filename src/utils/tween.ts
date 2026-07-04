/**
 * Tween animation parser and resolver for the Remotion engine.
 *
 * Transforms `tween(from?, to, easing?)` string expressions in props into
 * frame-animated values using Remotion's interpolate() and spring().
 *
 * Syntax:
 *   tween(to)                    — 0 → to, linear
 *   tween(from, to)              — from → to, linear
 *   tween(from, to, easeOut)     — from → to, with easing
 *   tween(from, to, spring)      — from → to, spring animation
 *   tween(from, to, spring(damping:12)) — spring with custom params
 *   tween(#000, #FFF)            — color hex → hex
 *   tween(#000, #FFF, easeInOut) — color hex with easing
 */

// ── Helpers ──────────────────────────────────────────────────────────────

/** Regex matching: tween(...) — captures the inner args. */
const TWEEN_RE = /^tween\((.+)\)$/;

/** Regex matching: spring(...) or spring(key:val,...) inside easing position. */
const SPRING_RE = /^spring(?:\((.+)\))?$/;

/** CSS easing name → Remotion easing function name mapping. */
const EASING_ALIASES: Record<string, string> = {
  linear: "identity",
  ease: "ease",
  easeIn: "easeIn",
  easeOut: "easeOut",
  easeInOut: "easeInOut",
  "ease-in": "easeIn",
  "ease-out": "easeOut",
  "ease-in-out": "easeInOut",
};

// ── Types ────────────────────────────────────────────────────────────────

export interface TweenSpec {
  from: number;
  to: number;
  easing: string;       // "linear" | "easeOut" | "spring" | "spring(damping:10)" | ...
  easingOptions: Record<string, unknown>;  // { damping?: number, ... }
  isColor: boolean;
}

/** Parsed tween result — either number or hex color. */
export type TweenResult = number | string;

// ── Parsing ──────────────────────────────────────────────────────────────

/**
 * Parse a `tween(...)` string into a TweenSpec.
 * Returns null if the string is not a tween expression.
 */
export function parseTween(value: string): TweenSpec | null {
  const m = TWEEN_RE.exec(value.trim());
  if (!m) return null;

  const args = parseArgs(m[1]!);
  if (args.length === 0) return null;

  const spec: TweenSpec = {
    from: 0,
    to: 100,
    easing: "linear",
    easingOptions: {},
    isColor: false,
  };

  // Detect color hex values
  const isHex = (s: string) => /^#[0-9a-fA-F]{3,8}$/.test(s) || /^rgb[a]?\(/i.test(s);

  if (args.length === 1) {
    // tween(to) — from defaults to 0
    const first = args[0]!;
    if (isHex(first)) {
      spec.from = 0;
      spec.to = 0;
      spec.isColor = false; // can't tween a single color without from
      return null; // single color arg doesn't make sense
    }
    spec.to = Number(first);
    if (!Number.isFinite(spec.to)) return null;
    return spec;
  }

  if (args.length >= 2) {
    const arg0 = args[0]!;
    const arg1 = args[1]!;

    if (isHex(arg0) || isHex(arg1)) {
      // Color tween: tween(#000, #FFF) or tween(#000, #FFF, easeOut)
      spec.isColor = true;
      spec.from = hexToNumber(arg0) ?? 0;
      spec.to = hexToNumber(arg1) ?? 0;
      if (args.length >= 3) {
        parseEasing(args[2]!, spec);
      }
      return spec;
    }

    // Numeric tween
    spec.from = Number(arg0);
    spec.to = Number(arg1);
    if (!Number.isFinite(spec.from) || !Number.isFinite(spec.to)) return null;

    if (args.length >= 3) {
      parseEasing(args[2]!, spec);
    }
    return spec;
  }

  return null;
}

function parseArgs(raw: string): string[] {
  const out: string[] = [];
  let cur = "";
  let depth = 0;
  for (const ch of raw) {
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    if (depth === 0 && ch === ",") {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function parseEasing(raw: string, spec: TweenSpec): void {
  const trimmed = raw.trim();
  const alias = EASING_ALIASES[trimmed];
  if (alias) {
    spec.easing = alias;
    return;
  }

  const sm = SPRING_RE.exec(trimmed);
  if (sm) {
    spec.easing = "spring";
    if (sm[1]) {
      // spring(damping:10, mass:2)
      for (const part of sm[1].split(",")) {
        const eqIdx = part.indexOf(":");
        if (eqIdx > 0) {
          const k = part.slice(0, eqIdx).trim();
          const v = part.slice(eqIdx + 1).trim();
          spec.easingOptions[k] = Number(v);
        }
      }
    }
    return;
  }

  // Treat unrecognized as CSS cubic-bezier or pass-through
  spec.easing = trimmed;
}

// ── Resolution ───────────────────────────────────────────────────────────

/**
 * Resolve a TweenSpec to a number for the given frame.
 *
 * @param spec - Parsed tween spec
 * @param frame - Current frame (from useCurrentFrame())
 * @param startFrame - Start frame of the action
 * @param endFrame - End frame of the action
 * @param fps - Video FPS
 * @param interpolateFn - Remotion's interpolate function
 * @param springFn - Remotion's spring function
 * @returns The animated value (number, or hex color string)
 */
export function resolveTween(
  spec: TweenSpec,
  frame: number,
  startFrame: number,
  endFrame: number,
  fps: number,
  interpolateFn: (input: number | number[], inputRange: number[], outputRange: number[], opts?: any) => number,
  springFn?: (opts: { from?: number; to?: number; fps?: number; frame?: number; config?: Record<string, unknown> }) => number,
): TweenResult {
  const durationFrames = Math.max(1, endFrame - startFrame);
  const relativeFrame = frame - startFrame;

  if (spec.isColor) {
    const t = interpolateFn(relativeFrame, [0, durationFrames], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: getEasingFn(spec.easing),
    });
    return numberToHex(lerp(spec.from, spec.to, t));
  }

  if (spec.easing === "spring" && springFn) {
    return springFn({
      from: spec.from,
      to: spec.to,
      fps,
      frame: relativeFrame,
      config: spec.easingOptions as any,
    });
  }

  return interpolateFn(relativeFrame, [0, durationFrames], [spec.from, spec.to], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: getEasingFn(spec.easing),
  });
}

// ── Deep walk: find and resolve all tween strings in props ───────────────

/**
 * Deeply walk a props object and resolve every `tween(...)` string.
 * Returns a shallow-cloned props tree with computed values.
 */
export function resolveTweensInProps(
  props: Record<string, unknown>,
  frame: number,
  startFrame: number,
  endFrame: number,
  fps: number,
  interpolateFn: (input: number | number[], inputRange: number[], outputRange: number[], opts?: any) => number,
  springFn?: (opts: any) => number,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(props)) {
    result[key] = resolveTweenInValue(value, frame, startFrame, endFrame, fps, interpolateFn, springFn);
  }

  return result;
}

function resolveTweenInValue(
  value: unknown,
  frame: number,
  startFrame: number,
  endFrame: number,
  fps: number,
  interpolateFn: (input: number | number[], inputRange: number[], outputRange: number[], opts?: any) => number,
  springFn?: (opts: any) => number,
): unknown {
  if (typeof value === "string") {
    const spec = parseTween(value);
    if (spec) {
      return resolveTween(spec, frame, startFrame, endFrame, fps, interpolateFn, springFn);
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) =>
      resolveTweenInValue(item, frame, startFrame, endFrame, fps, interpolateFn, springFn),
    );
  }

  if (value !== null && typeof value === "object") {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      obj[k] = resolveTweenInValue(v, frame, startFrame, endFrame, fps, interpolateFn, springFn);
    }
    return obj;
  }

  return value;
}

// ── Color utilities ──────────────────────────────────────────────────────

function hexToNumber(hex: string): number | null {
  const s = hex.replace(/^#/, "");
  const n = parseInt(s, 16);
  return isNaN(n) ? null : n;
}

function numberToHex(n: number): string {
  const clamped = Math.max(0, Math.min(0xffffff, Math.round(n)));
  return `#${clamped.toString(16).padStart(6, "0")}`;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ── Easing function resolution ───────────────────────────────────────────

import { Easing } from "remotion";

/**
 * Map a tween easing name to a Remotion easing function.
 * Falls back to identity (linear) for unknown names.
 */
function getEasingFn(
  easing: string,
): ((t: number) => number) | undefined {
  if (easing === "identity" || easing === "linear") return undefined;

  switch (easing) {
    case "ease":
    case "easeIn":
      return Easing.in(Easing.ease);
    case "easeOut":
      return Easing.out(Easing.ease);
    case "easeInOut":
      return Easing.inOut(Easing.ease);
    default:
      return undefined;
  }
}
