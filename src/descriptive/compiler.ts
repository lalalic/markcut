import type {
  Audio,
  Component,
  Effect,
  Folder,
  Image,
  Include,
  MapStream,
  Rhythm,
  Root,
  Scene,
  Stream,
  SubtitleOverlay,
  Video,
} from "../schema/index";
import { uid } from "../utils/index";

export interface CompileOptions {
  defaults?: Partial<Record<"image" | "video" | "audio" | "component" | "rhythm" | "include" | "map" | "effect", number>>;
}

/** A single effect spec — either a bare animation name or an object with options. */
export type EffectSpec = string | {
  animation: string;
  /** Override the animation duration (seconds). Defaults to the node's own duration. */
  duration?: number;
  animationTimingFunction?: "linear" | "ease" | "ease-in" | "ease-out" | "ease-in-out";
  animationIterationCount?: number;
  customKeyframes?: Record<string, Record<string, string>>;
};

export interface DescriptiveBaseNode {
  id?: string;
  instruction?: string;
  script?: string;
  style?: string;
  visible?: boolean;
  isBackground?: boolean;
  duration?: number;
  start?: number;
  /** Effects applied to this node (e.g. `["fadeIn", {animation: "bounceIn", animationTimingFunction: "ease-out"}]`).
   *  Compiles into Effect wrapper streams at compile time, so the descriptive layer
   *  doesn't need explicit `effect` parent nodes. */
  effects?: EffectSpec[];
}


export interface DescriptiveVideo extends DescriptiveBaseNode {
  type: "video";
  src?: string;
  /** Text-to-video generation prompt. When set without src, triggers TTV pipeline. */
  prompt?: string;
  volume?: number;
  playbackRate?: number;
  width?: number;
  height?: number;
  startFrom?: number;
  endAt?: number;
}

export interface DescriptiveAudio extends DescriptiveBaseNode {
  type: "audio";
  src: string;
  volume?: number;
  foreground?: boolean;
  startFrom?: number;
  endAt?: number;
  loop?: number;
}

export interface DescriptiveImage extends DescriptiveBaseNode {
  type: "image";
  src?: string;
  /** Text-to-image generation prompt. When set without src, triggers TTI pipeline. */
  prompt?: string;
  fit?: "contain" | "cover" | "fill";
}

export interface DescriptiveComponent extends DescriptiveBaseNode {
  type: "component";
  /** Inline JSX usage expression, compiled at runtime with frontmatter imports in scope.
   *  e.g. "<BarChart data={[{name:'A',value:80}]} />".
   *  Component tag names are resolved from root.imports. */
  jsx: string;
}

/** Single entry in the frontmatter `imports:` array.
 *  Defines where a component comes from and how to load it. */
export interface ImportEntry {
  /** Component name (used as JSX tag and lookup key). */
  name: string;
  /** Source spec: `npm:`, `git:`, `github:`, `https://`, or local path. */
  from?: string;
  /** Named export to pick from the module (default: "default"). */
  exports?: string;
  /** Inline JSX component definition source (alternative to `from`).
   *  e.g. "export default ({text}) => <span>{text}</span>" */
  jsx?: string;

}

export interface DescriptiveRhythm extends DescriptiveBaseNode {
  type: "rhythm";
  src: string;
  volume?: number;
  spots?: number[];
  children?: DescriptiveNode[];
}

export interface DescriptiveInclude extends DescriptiveBaseNode {
  type: "include";
  src?: string;
  volume?: number;
  children?: DescriptiveNode[];
}

export interface DescriptiveScene extends DescriptiveBaseNode {
  type: "scene";
  name?: string;
  title?: string;
  tts?: string;
  layout?: "series" | "parallel" | "transitionSeries";
  transition?: string;
  transitionTime?: number;
  children: DescriptiveNode[];
}

export interface DescriptiveEffect extends DescriptiveBaseNode {
  type: "effect";
  animation?: string;
  animationTimingFunction?: "linear" | "ease" | "ease-in" | "ease-out" | "ease-in-out";
  animationIterationCount?: number;
  customKeyframes?: Record<string, Record<string, string>>;
  children: DescriptiveNode[];
}

export interface DescriptiveMapWaypoint {
  lat: number;
  lng: number;
  label?: string;
  media?: string;
}

export interface DescriptiveMap extends DescriptiveBaseNode {
  type: "map";
  waypoints: DescriptiveMapWaypoint[];
  routeColor?: string;
  routeWeight?: number;
  zoom?: number;
  center?: { lat: number; lng: number };
  mapType?: "roadmap" | "satellite" | "hybrid" | "terrain";
  travelMode?: "DRIVING" | "WALKING" | "BICYCLING" | "TRANSIT";
  routeMarker?: string;
}

export interface DescriptiveContainer extends DescriptiveBaseNode {
  type: "series" | "parallel" | "transitionSeries";
  transition?: string;
  transitionTime?: number;
  children: DescriptiveNode[];
}

export type DescriptiveNode =
  | DescriptiveVideo
  | DescriptiveAudio
  | DescriptiveImage
  | DescriptiveComponent
  | DescriptiveRhythm
  | DescriptiveInclude
  | DescriptiveScene
  | DescriptiveEffect
  | DescriptiveMap
  | DescriptiveContainer;

export interface DescriptiveRoot {
  id?: "root";
  width?: number;
  height?: number;
  fps?: number;
  instruction?: string;
  metadata?: string;
  stylesheet?: string;
  tts?: string;
  stt?: string;
  tti?: string;
  ttv?: string;
  layout?: "series" | "parallel" | "transitionSeries";
  transition?: string;
  transitionTime?: number;
  /** Global subtitle overlay. src = VTT file with absolute timestamps. Set by resolveScripts pipeline. */
  subtitle?: SubtitleOverlay;
  /** Frontmatter imports: array of named component registrations. */
  imports?: ImportEntry[];
  /** Raw imports block source (from \`\`\`imports code fence). Parsed by parseImportsBlock. */
  importsBlock?: string;
  children: DescriptiveNode[];
}

interface CompileContext {
  defaults: Record<"image" | "video" | "audio" | "component" | "rhythm" | "include" | "map" | "effect", number>;
}

interface CompileResult {
  stream: Stream;
  duration: number;
}

function isContainer(node: DescriptiveNode): node is DescriptiveContainer {
  return node.type === "series" || node.type === "parallel" || node.type === "transitionSeries";
}

function isScene(node: DescriptiveNode): node is DescriptiveScene {
  return node.type === "scene";
}

function isInclude(node: DescriptiveNode): node is DescriptiveInclude {
  return node.type === "include";
}

function isEffect(node: DescriptiveNode): node is DescriptiveEffect {
  return node.type === "effect";
}

function isMap(node: DescriptiveNode): node is DescriptiveMap {
  return node.type === "map";
}

function isRhythm(node: DescriptiveNode): node is DescriptiveRhythm {
  return node.type === "rhythm";
}

const DEFAULTS: CompileContext["defaults"] = {
  image: 3,
  video: 3,
  audio: 3,
  component: 2,
  rhythm: 4,
  include: 3,
  map: 4,
  effect: 2,
};

function ensureUniqueIds(children: DescriptiveNode[], scopeId: string): void {
  const seen = new Set<string>();
  for (const child of children) {
    if (!child.id) continue;
    if (seen.has(child.id)) {
      console.warn(`duplicate id "${child.id}" in container "${scopeId}"`);
      continue;
    }
    seen.add(child.id);
  }
}

function deriveLeafDuration(node: DescriptiveNode, ctx: CompileContext): number {
  if (typeof node.duration === "number" && node.duration > 0) {
    return node.duration;
  }

  if ((node.type === "video" || node.type === "audio") && typeof node.endAt === "number") {
    const startFrom = node.startFrom ?? 0;
    const inferred = node.endAt - startFrom;
    if (inferred > 0) return inferred;
  }

  const fallback = ctx.defaults[node.type as keyof CompileContext["defaults"]];
  return fallback;
}

/** Normalize an EffectSpec to its object form. */
function normalizeEffectSpec(spec: EffectSpec): {
  animation: string;
  duration?: number;
  animationTimingFunction?: "linear" | "ease" | "ease-in" | "ease-out" | "ease-in-out";
  animationIterationCount?: number;
  customKeyframes?: Record<string, Record<string, string>>;
} {
  if (typeof spec === "string") {
    // Parse optional positional params in parentheses.
    // Syntax: fadeIn  |  fadeIn(1)  |  fadeIn(1,ease-in)  |  fadeIn(1, ease-in, 1)
    // Order: (duration, timingFunction, iterationCount)
    const parenIdx = spec.indexOf("(");
    if (parenIdx === -1) {
      return { animation: spec };
    }
    const animation = spec.slice(0, parenIdx).trim();
    const body = spec.slice(parenIdx + 1, spec.lastIndexOf(")")).trim();
    const result: ReturnType<typeof normalizeEffectSpec> = { animation };
    const parts = body.split(",").map((p) => p.trim());

    if (parts[0]) {
      const n = Number(parts[0]);
      if (Number.isFinite(n)) result.duration = n;
    }
    if (parts[1]) result.animationTimingFunction = parts[1] as any;
    if (parts[2]) {
      const n = Number(parts[2]);
      if (Number.isFinite(n)) result.animationIterationCount = n;
    }
    return result;
  }
  return spec;
}

/** Supported transition names for the compiled schema. */
const VALID_TRANSITIONS = new Set(["fade", "slide", "wipe", "flip", "clockWipe"]);

/**
 * Parse a transition value that may include a parenthesized time, e.g.
 *   "fade"       → { name: "fade", time: undefined }
 *   "fade(0.5)"  → { name: "fade", time: 0.5 }
 */
export function parseTransition(val: string | undefined): { name?: string; time?: number } {
  if (!val) return { name: undefined, time: undefined };
  const parenMatch = val.match(/^(\w+)\((\d+(?:\.\d+)?)\)$/);
  if (parenMatch) {
    return { name: parenMatch[1]!, time: Number(parenMatch[2]) };
  }
  return { name: val, time: undefined };
}

/**
 * Resolve the effective transition name and time from a descriptive node.
 * Supports inline "name(time)" format on `transition`, with `transitionTime`
 * as fallback.
 */
export function resolveTransition(
  transition: string | undefined,
  transitionTime: number | undefined,
): { name: string; time: number } {
  const parsed = parseTransition(transition);
  const name = parsed.name ?? "fade";
  // Separate transitionTime overrides inline time from "fade(0.5)" syntax
  const inlineTime = parsed.time;
  const time = transitionTime ?? inlineTime ?? 0.5;
  // Ensure name is a valid compiled transition
  if (!VALID_TRANSITIONS.has(name as any)) {
    console.warn(`invalid transition "${name}", falling back to "fade"`);
    return { name: "fade", time };
  }
  return { name, time };
}

/**
 * Wrap a compiled stream inside Effect wrapper streams, applying the
 * `effects` specs from the original descriptive node.
 *
 * The innermost effect wraps the leaf; the outermost effect carries
 * the leaf's absolute timing (for correct placement in the parent timeline).
 * Each effect's children have relative (start=0) timing.
 */
function wrapWithEffects(
  node: { effects?: EffectSpec[] },
  result: CompileResult,
  parentKind: "series" | "parallel" | "transitionSeries",
): CompileResult {
  const rawEffects = node.effects;
  if (!rawEffects || rawEffects.length === 0) return result;

  const effects = rawEffects.map(normalizeEffectSpec);
  const innerStream = result.stream;
  const innerActions = (innerStream as any).actions ?? [];
  const firstAction = innerActions[0] ?? {};
  const absStart = firstAction.start ?? 0;
  const absEnd = firstAction.end ?? result.duration;
  const duration = absEnd - absStart;

  // Reset inner stream's actions to be relative (start=0) so the effect
  // wrapper owns the absolute timing. The EffectWrapper renders children
  // with their relative actions inside its own Sequence.
  const resetStream = {
    ...innerStream,
    actions: [{
      ...firstAction,
      id: uid(),
      start: 0,
      end: duration,
    }],
    durationInSeconds: duration,
  } as any;

  // Build nested effect wrappers from innermost → outermost.
  // The outermost effect uses the original absolute timing;
  // inner effects (for multiple effects) are relative to their parent effect.
  let currentStream = resetStream;
  for (let i = effects.length - 1; i >= 0; i--) {
    const spec = effects[i]!;
    const isOutermost = i === effects.length - 1;
    const effStart = isOutermost ? absStart : 0;
    // If spec has explicit duration, use it instead of the leaf's full duration
    const specDuration = spec.duration ?? (isOutermost ? duration : duration);
    const effEnd = isOutermost
      ? (spec.duration != null ? effStart + spec.duration : absEnd)
      : specDuration;

    currentStream = {
      id: uid(),
      type: "effect",
      animation: spec.animation,
      durationInSeconds: spec.duration,
      animationTimingFunction: spec.animationTimingFunction,
      animationIterationCount: spec.animationIterationCount ?? 1,
      customKeyframes: spec.customKeyframes,
      children: [currentStream],
      actions: [{
        id: uid(),
        start: effStart,
        end: effEnd,
      }],
      visible: true,
    } as Effect;
  }

  return { stream: currentStream, duration: result.duration };
}

function compileLeaf(node: Exclude<DescriptiveNode, DescriptiveContainer | DescriptiveScene | DescriptiveInclude | DescriptiveEffect>, ctx: CompileContext, parentKind: "series" | "parallel" | "transitionSeries"): CompileResult {
  const id = node.id ?? uid();
  const start = parentKind === "parallel" ? Math.max(0, node.start ?? 0) : 0;
  const duration = deriveLeafDuration(node, ctx);
  const end = start + duration;

  const base = {
    id,
    style: node.style,
    visible: node.visible ?? true,
    isBackground: node.isBackground,
    durationInSeconds: end,
  };

  const action = {
    id: uid(),
    start,
    end,
    startFrom: node.type === "video" || node.type === "audio" ? node.startFrom : undefined,
    endAt: node.type === "video" || node.type === "audio" ? node.endAt : undefined,
    loop: node.type === "audio" ? node.loop : undefined,
    volume:
      node.type === "video" || node.type === "audio" || node.type === "rhythm"
        ? node.volume
        : undefined,
  };

  switch (node.type) {
    case "video": {
      const stream: Video = {
        ...base,
        type: "video",
        src: node.src,
        volume: node.volume ?? 1,
        playbackRate: node.playbackRate,
        width: node.width ?? 1080,
        height: node.height ?? 1920,
        actions: [action],
      };
      return { stream, duration: end };
    }
    case "audio": {
      const stream: Audio = {
        ...base,
        type: "audio",
        src: node.src,
        volume: node.volume ?? 1,
        foreground: node.foreground,
        actions: [action],
      };
      return { stream, duration: end };
    }
    case "image": {
      const stream: Image = {
        ...base,
        type: "image",
        src: node.src,
        fit: node.fit ?? "contain",
        actions: [action],
      };
      return { stream, duration: end };
    }
    case "component": {
      // Collect extra properties from descriptive node (e.g. `source` from ~~~md source fences)
      const KNOWN_COMPONENT_KEYS = new Set([
        "type", "jsx", "id", "instruction", "script", "style", "visible",
        "isBackground", "duration", "start", "_resolvedRegistry",
      ]);
      const bindings: Record<string, string> = {};
      for (const key of Object.keys(node)) {
        if (!KNOWN_COMPONENT_KEYS.has(key)) {
          const val = (node as any)[key];
          if (typeof val === "string") bindings[key] = val;
        }
      }

      const stream: Component = {
        ...base,
        type: "component",
        jsx: node.jsx,
        data: Object.keys(bindings).length ? bindings : undefined,
        actions: [action],
      };
      return { stream, duration: end };
    }
    case "rhythm": {
      // rhythm without children compiles as a plain audio leaf
      const stream: Rhythm = {
        ...base,
        type: "rhythm",
        src: node.src,
        volume: node.volume ?? 1,
        spots: node.spots,
        children: [],
        actions: [action],
      };
      return { stream, duration: end };
    }
    case "map": {
      const stream: MapStream = {
        ...base,
        type: "map",
        waypoints: node.waypoints,
        routeColor: node.routeColor ?? "#4285F4",
        routeWeight: node.routeWeight ?? 4,
        zoom: node.zoom ?? 10,
        center: node.center,
        mapType: node.mapType ?? "roadmap",
        travelMode: node.travelMode ?? "DRIVING",
        routeMarker: node.routeMarker ?? "🚗",
        actions: [action],
      };
      return { stream, duration: end };
    }
  }
}

function compileChildren(
  children: DescriptiveNode[],
  ctx: CompileContext,
  parentKind: "series" | "parallel" | "transitionSeries",
): CompileResult[] {
  return children
    .filter((child) => child.visible !== false)
    .map((child) => {
      let result: CompileResult;
      if (isContainer(child)) {
        result = compileContainer(child, ctx, parentKind);
      } else if (isScene(child)) {
        result = compileScene(child, ctx, parentKind);
      } else if (isInclude(child)) {
        result = compileInclude(child, ctx, parentKind);
      } else if (isEffect(child)) {
        result = compileEffect(child, ctx, parentKind);
      } else if (isRhythm(child)) {
        result = compileRhythm(child, ctx, parentKind);
      } else if (isMap(child)) {
        result = compileLeaf(child, ctx, parentKind);
      } else {
        result = compileLeaf(child, ctx, parentKind);
      }
      // Apply direct effects on any node (descriptive-layer shorthand).
      // Effect wrapper nodes (type: "effect") already handle their own effects
      // via compileEffect, so skip them to avoid double-wrapping.
      if (!isEffect(child)) {
        result = wrapWithEffects(child, result, parentKind);
      }
      return result;
    });
}

function aggregateDuration(
  children: CompileResult[],
  kind: "series" | "parallel" | "transitionSeries",
  transitionTime?: number,
): number {
  if (kind === "parallel") {
    let max = 0;
    for (const child of children) max = Math.max(max, child.duration);
    return max;
  }

  let total = 0;
  const overlap = kind === "transitionSeries" ? (transitionTime ?? 0.5) : 0;
  for (let i = 0; i < children.length; i++) {
    total += children[i]!.duration;
    if (i > 0 && overlap > 0) total -= overlap;
  }
  return total;
}

function compileScene(
  node: DescriptiveScene,
  ctx: CompileContext,
  parentKind: "series" | "parallel" | "transitionSeries",
): CompileResult {
  const id = node.id ?? uid();
  ensureUniqueIds(node.children, id);

  const sceneKind = node.layout ?? "parallel";
  const resolved = resolveTransition(node.transition, node.transitionTime);
  const compiledChildren = compileChildren(node.children, ctx, sceneKind);
  const sceneChildren = sceneKind === "parallel"
    ? compiledChildren.map((c) => c.stream)
    : [
      {
        id: `${id}-layout`,
        type: "folder",
        visible: true,
        isSeries: true,
        transition: sceneKind === "transitionSeries" ? resolved.name : undefined,
        transitionTime: sceneKind === "transitionSeries" ? resolved.time : 0.5,
        children: compiledChildren.map((c) => c.stream),
        durationInSeconds: aggregateDuration(compiledChildren, sceneKind, resolved.time),
      } as Folder,
    ];

  const sceneContentDuration = sceneKind === "parallel"
    ? aggregateDuration(compiledChildren, "parallel")
    : aggregateDuration(compiledChildren, sceneKind, resolved.time);
  const localDuration = Math.max(node.duration ?? 0, sceneContentDuration);
  const start = parentKind === "parallel" ? Math.max(0, node.start ?? 0) : 0;
  const end = start + localDuration;

  const stream: Scene = {
    id,
    type: "scene",
    name: node.name,
    title: node.title,
    instruction: node.instruction,
    style: node.style,
    visible: node.visible ?? true,
    isBackground: node.isBackground,
    children: sceneChildren,
    durationInSeconds: end,
  };

  return { stream, duration: end };
}

function compileInclude(
  node: DescriptiveInclude,
  ctx: CompileContext,
  parentKind: "series" | "parallel" | "transitionSeries",
): CompileResult {
    const id = node.id ?? uid();
  const start = parentKind === "parallel" ? Math.max(0, node.start ?? 0) : 0;

  const compiledChildren = node.children?.length ? compileChildren(node.children, ctx, "parallel") : [];
  const childrenDuration = aggregateDuration(compiledChildren, "parallel");

  let duration = node.duration ?? 0;
  if (!duration && node.src) {
    duration = ctx.defaults.include;
  }
  if (!duration) {
    duration = childrenDuration;
  }
  if (!duration) {
    duration = ctx.defaults.include;
  }

  const end = start + duration;

  const stream: Include = {
    id,
    type: "include",
    style: node.style,
    visible: node.visible ?? true,
    isBackground: node.isBackground,
    src: node.src,
    volume: node.volume ?? 1,
    children: compiledChildren.map((c) => c.stream),
    actions: [
      {
        id: uid(),
        start,
        end,
      },
    ],
    durationInSeconds: end,
  };

  return { stream, duration: end };
}

function compileEffect(
  node: DescriptiveEffect,
  ctx: CompileContext,
  parentKind: "series" | "parallel" | "transitionSeries",
): CompileResult {
  const id = node.id ?? uid();
  ensureUniqueIds(node.children, id);
  const children = compileChildren(node.children, ctx, "parallel");
  const childrenDuration = aggregateDuration(children, "parallel");

  let duration = node.duration ?? 0;
  if (!duration) duration = childrenDuration;
  if (!duration) duration = ctx.defaults.effect;

  const start = parentKind === "parallel" ? Math.max(0, node.start ?? 0) : 0;
  const end = start + duration;

  const stream: Effect = {
    id,
    type: "effect",
    style: node.style,
    visible: node.visible ?? true,
    isBackground: node.isBackground,
    animation: node.animation,
    animationTimingFunction: node.animationTimingFunction,
    animationIterationCount: node.animationIterationCount ?? 1,
    customKeyframes: node.customKeyframes,
    children: children.map((c) => c.stream),
    actions: [
      {
        id: uid(),
        start,
        end,
      },
    ],
    durationInSeconds: end,
  };

  return { stream, duration: end };
}

function compileRhythm(
  node: DescriptiveRhythm,
  ctx: CompileContext,
  parentKind: "series" | "parallel" | "transitionSeries",
): CompileResult {
  const id = node.id ?? uid();
  const spots = node.spots ?? [];
  const children = node.children ?? [];

  // Duration is derived from spots: last beat + average gap covers last child
  const avgGap = spots.length > 1
    ? (spots[spots.length - 1]! - spots[0]!) / (spots.length - 1)
    : 0;
  const rhythmDuration = spots.length ? spots[spots.length - 1]! + avgGap : 0;

  // Distribute children across beats: child[i] starts at spots[i], ends at spots[i+1] (or last beat + avg gap)
  const compiledChildren: Stream[] = [];
  if (children.length && spots.length) {
    const avgGap = spots.length > 1
      ? (spots[spots.length - 1]! - spots[0]!) / (spots.length - 1)
      : 1;
    for (let i = 0; i < children.length; i++) {
      const beatStart = spots[Math.min(i, spots.length - 1)] ?? 0;
      const beatEnd = i < spots.length - 1
        ? spots[i + 1]!
        : beatStart + avgGap;
      const beatDur = Math.max(0.1, beatEnd - beatStart);

      // Inject beat timing into child via duration override
      const childWithTiming = { ...children[i]!, start: beatStart, duration: beatDur } as DescriptiveNode;
      const compiled = isContainer(childWithTiming)
        ? compileContainer(childWithTiming, ctx, "parallel")
        : isScene(childWithTiming)
          ? compileScene(childWithTiming, ctx, "parallel")
          : isInclude(childWithTiming)
            ? compileInclude(childWithTiming, ctx, "parallel")
            : isEffect(childWithTiming)
              ? compileEffect(childWithTiming, ctx, "parallel")
              : isRhythm(childWithTiming)
                ? compileRhythm(childWithTiming, ctx, "parallel")
                : compileLeaf(childWithTiming, ctx, "parallel");
      compiledChildren.push(compiled.stream);
    }
  }

  const start = parentKind === "parallel" ? Math.max(0, node.start ?? 0) : 0;
  const end = start + rhythmDuration;

  const stream: Rhythm = {
    id,
    type: "rhythm",
    style: node.style,
    visible: node.visible ?? true,
    isBackground: node.isBackground,
    src: node.src,
    volume: node.volume ?? 1,
    spots: node.spots,
    children: compiledChildren,
    actions: [
      {
        id: uid(),
        start,
        end,
        volume: node.volume,
      },
    ],
    durationInSeconds: end,
  };

  return { stream, duration: end };
}

function compileContainer(node: DescriptiveContainer, ctx: CompileContext, parentKind: "series" | "parallel" | "transitionSeries"): CompileResult {
  const id = node.id ?? uid();
  ensureUniqueIds(node.children, id);

  const resolved = node.type === "transitionSeries"
    ? resolveTransition(node.transition, node.transitionTime)
    : { name: "fade", time: 0.5 };
  const children = compileChildren(node.children, ctx, node.type);
  const duration = aggregateDuration(children, node.type, resolved.time);

  const stream: Folder = {
    id,
    type: "folder",
    style: node.style,
    visible: node.visible ?? true,
    isBackground: node.isBackground,
    isSeries: node.type !== "parallel",
    transition: node.type === "transitionSeries" ? resolved.name : undefined,
    transitionTime: node.type === "transitionSeries" ? resolved.time : 0.5,
    children: children.map((c) => c.stream),
    durationInSeconds: duration,
  };

  return { stream, duration };
}

// ── Frontmatter imports resolver ──────────────────────────────────────────
//
// Resolves `root.imports` (ImportEntry[]) and attaches the registry to every
// component node so `compileLeaf` can build the runtime `imports` map.
//
// Each ImportEntry can have:
//   - `from:`  — source spec (npm:/git:/github:/https:/path) → resolved to URL
//   - `jsx:`   — inline JSX component definition source
//   - `exports:` — named export to pick (default: "default")

/** Resolved import data carried through to compilation. */
interface ResolvedImport {
  /** Resolved URL from `from:` spec. */
  src?: string;
  /** Inline component definition JSX source (from imports entry `jsx:`). */
  definitionJsx?: string;
  /** Named export to pick from the module. */
  exports?: string;
}

/**
 * Parse an \`\`\`imports code block into ImportEntry[].
 *
 * Supports:
 *   export { Name } from "spec"             — remote import
 *   export { Name as Alias } from "spec"    — aliased remote import
 *   export { Name1, Name2 } from "spec"     — multiple from same source
 *   export function Name(...) { ... }       — inline component definition
 *   export default function Name(...) { ... } — inline default definition
 *   import "spec"                           — side-effect import (no component registered)
 */

export function parseImportsBlock(source: string): ImportEntry[] {
  const entries: ImportEntry[] = [];
  // Track names brought into scope by import statements, so bare `export { Name }` can resolve them
  const importedNames = new Map<string, { from: string; exports: string }>();
  const lines = source.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!.trim();

    // import { Name } from "spec"  — internal dep, tracks scope but doesn't register
    const namedImport = /^import\s+\{\s*([^}]+)\}\s+from\s+["'`](.+?)["'`]\s*;?\s*$/.exec(line);
    if (namedImport) {
      const namesStr = namedImport[1]!;
      const fromSpec = namedImport[2]!;
      for (const part of namesStr.split(",")) {
        const trimmed = part.trim();
        const asMatch = /^(.+?)\s+as\s+(.+)$/i.exec(trimmed);
        const exportName = asMatch ? asMatch[1]!.trim() : trimmed;
        const name = asMatch ? asMatch[2]!.trim() : trimmed;
        importedNames.set(name, { from: fromSpec, exports: exportName });
      }
      i++;
      continue;
    }

    // import DefaultName from "spec"  — internal dep, tracks scope but doesn't register
    const defaultImport = /^import\s+(\w+)\s+from\s+["'`](.+?)["'`]\s*;?\s*$/.exec(line);
    if (defaultImport) {
      importedNames.set(defaultImport[1]!, { from: defaultImport[2]!, exports: "default" });
      i++;
      continue;
    }

    // import "spec"  — side-effect import, no component registered
    const sideEffectImport = /^import\s+["'`](.+?)["'`]\s*;?\s*$/.exec(line);
    if (sideEffectImport) {
      // No component to register, just ensure the spec is extracted by extractDependencySpecs
      i++;
      continue;
    }

    // export { Name } from "spec"  (re-export with explicit source, registers Name)
    // export { Name as Alias } from "spec"
    // export { Name1, Name2 } from "spec"
    const namedReExport = /^export\s+\{\s*([^}]+)\}\s+from\s+["'`](.+?)["'`]\s*;?\s*$/.exec(line);
    if (namedReExport) {
      const namesStr = namedReExport[1]!;
      const fromSpec = namedReExport[2]!;
      for (const part of namesStr.split(",")) {
        const trimmed = part.trim();
        const asMatch = /^(.+?)\s+as\s+(.+)$/i.exec(trimmed);
        const exportName = asMatch ? asMatch[1]!.trim() : trimmed;
        const name = asMatch ? asMatch[2]!.trim() : trimmed;
        entries.push({ name, from: fromSpec, exports: exportName });
      }
      i++;
      continue;
    }

    // export { Name }  (bare re-export — resolves from importedNames)
    // export { Name as Alias }
    // export { Name1, Name2 }
    const bareReExport = /^export\s+\{\s*([^}]+)\}\s*;?\s*$/.exec(line);
    if (bareReExport) {
      const namesStr = bareReExport[1]!;
      for (const part of namesStr.split(",")) {
        const trimmed = part.trim();
        const asMatch = /^(.+?)\s+as\s+(.+)$/i.exec(trimmed);
        const exportName = asMatch ? asMatch[1]!.trim() : trimmed;
        const name = asMatch ? asMatch[2]!.trim() : trimmed;
        // Look up the source from imported names
        const imported = importedNames.get(exportName);
        if (imported) {
          entries.push({ name, from: imported.from, exports: imported.exports });
        }
      }
      i++;
      continue;
    }

    // export default Name from "spec"  (default re-export, registers Name)
    const defaultReExport = /^export\s+default\s+(\w+)\s+from\s+["'`](.+?)["'`]\s*;?\s*$/.exec(line);
    if (defaultReExport) {
      entries.push({ name: defaultReExport[1]!, from: defaultReExport[2]!, exports: "default" });
      i++;
      continue;
    }

    // export function Name(...) { ... }  or  export default function Name(...) { ... }
    const funcExport = /^export(?:\s+default)?\s+function\s+(\w+)\s*\(/.exec(line);
    if (funcExport) {
      const name = funcExport[1]!;
      const bodyLines: string[] = [line];
      let braceDepth = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
      i++;
      while (i < lines.length && braceDepth > 0) {
        const bl = lines[i]!;
        bodyLines.push(bl);
        braceDepth += (bl.match(/{/g) || []).length;
        braceDepth -= (bl.match(/}/g) || []).length;
        i++;
      }
      // Prepend relevant import statements above the function so the bundled
      // module has access to imported names (e.g. ReactMarkdown from react-markdown)
      const usedImports = importedNames.size > 0
        ? extractImportLines(source, name)
        : "";
      entries.push({ name, jsx: usedImports + bodyLines.join("\n") });
      continue;
    }

    i++;
  }

  return entries;
}

/**
 * Extract import lines from the source that are likely used by the given export function.
 * Finds `import` statements and returns them as a string to prepend to the function body.
 * Strips `npm:` prefix from package specifiers for esbuild compatibility.
 *
 * Skips bare side-effect imports (`import "spec"`) since they don't bring any names
 * into scope and are already handled as bare imports in the generated index.js bundle.
 */
function extractImportLines(source: string, functionName: string): string {
  const lines: string[] = [];
  for (const line of source.split("\n")) {
    const trimmed = line.trim();
    // Skip bare side-effect imports — they don't bind names and are handled by the bundler
    if (/^import\s+["'`]/.test(trimmed) && !/^import\s+[\w{]/.test(trimmed)) continue;
    if (/^import\s/.test(trimmed)) {
      // Strip npm: prefix from package specifiers (e.g. 'npm:react-markdown' → 'react-markdown')
      lines.push(trimmed.replace(/from\s+["'`]npm:([^"'`]+)["'`]/g, 'from "$1"'));
    }
  }
  return lines.length > 0 ? lines.join("\n") + "\n" : "";
}

/**
 * Extract all dependency package specifiers from an imports block.
 * This includes:
 *   - `export { X } from "spec"` and `import { X } from "spec"` (named re-exports / named imports)
 *   - `import "spec"` (side-effect-only imports)
 *
 * Used by the bundler to populate package.json.
 *
 * Returns the raw spec strings (e.g. "npm:recharts", "react", "npm:@remotion/tailwind-v4").
 */
export function extractDependencySpecs(source: string): string[] {
  const specs: string[] = [];
  // Match `from "spec"` in export/import statements
  const fromRe = /from\s+["'`](.+?)["'`]\s*;?\s*$/gm;
  let m;
  while ((m = fromRe.exec(source)) !== null) {
    specs.push(m[1]);
  }
  // Match bare side-effect imports: `import "spec"`
  for (const line of source.split("\n")) {
    const trimmed = line.trim();
    const sideEffectMatch = /^import\s+["'`](.+?)["'`]\s*;?\s*$/.exec(trimmed);
    if (sideEffectMatch) {
      specs.push(sideEffectMatch[1]);
    }
  }
  return specs;
}
function resolveComponentSources(root: DescriptiveRoot): Map<string, ResolvedImport> {
  const registry = new Map<string, ResolvedImport>();

  // If importsBlock is present, parse it into ImportEntry[] (overrides frontmatter imports)
  let entries = root.imports;
  if (root.importsBlock) {
    entries = parseImportsBlock(root.importsBlock);
  }
  if (!entries || !entries.length) return registry;

  for (const entry of entries) {
    if (!entry.name) continue;
    const resolved: ResolvedImport = { exports: entry.exports };
    if (entry.from) {
      resolved.src = entry.from.trim();
    }
    if (entry.jsx) {
      resolved.definitionJsx = entry.jsx;
    }
    registry.set(entry.name, resolved);
  }
  if (registry.size === 0) return registry;

  const visit = (node: DescriptiveNode): void => {
    if (node.type === "component") {
      (node as any)._resolvedRegistry = registry;
    }
    const children = (node as { children?: DescriptiveNode[] }).children;
    if (Array.isArray(children)) {
      for (const c of children) visit(c);
    }
  };
  for (const c of root.children) visit(c);
  return registry;
}

/** Known HTML/SVG tag names — uppercase first char means component reference. */
const KNOWN_HTML_TAGS = new Set([
  "A", "Abbr", "Address", "Area", "Article", "Aside", "Audio",
  "B", "Base", "Bdi", "Bdo", "Blockquote", "Body", "Br", "Button",
  "Canvas", "Caption", "Cite", "Code", "Col", "Colgroup", "Data", "Datalist",
  "Dd", "Del", "Details", "Dfn", "Dialog", "Div", "Dl", "Dt", "Em", "Embed",
  "Fieldset", "Figcaption", "Figure", "Footer", "Form", "H1", "H2", "H3",
  "H4", "H5", "H6", "Head", "Header", "Hgroup", "Hr", "Html", "I", "Iframe",
  "Img", "Input", "Ins", "Kbd", "Label", "Legend", "Li", "Link", "Main",
  "Map", "Mark", "Menu", "Meta", "Meter", "Nav", "Noscript", "Object", "Ol",
  "Optgroup", "Option", "Output", "P", "Picture", "Pre", "Progress", "Q",
  "Rp", "Rt", "Ruby", "S", "Samp", "Script", "Section", "Select", "Slot",
  "Small", "Source", "Span", "Strong", "Style", "Sub", "Summary", "Sup",
  "Table", "Tbody", "Td", "Template", "Textarea", "Tfoot", "Th", "Thead",
  "Time", "Title", "Tr", "Track", "U", "Ul", "Var", "Video", "Wbr",
  // SVG
  "Svg", "Circle", "ClipPath", "Defs", "Ellipse", "FeBlend", "FeColorMatrix",
  "FeComponentTransfer", "FeComposite", "FeConvolveMatrix", "FeDiffuseLighting",
  "FeDisplacementMap", "FeDistantLight", "FeDropShadow", "FeFlood", "FeFuncA",
  "FeFuncB", "FeFuncG", "FeFuncR", "FeGaussianBlur", "FeImage", "FeMerge",
  "FeMergeNode", "FeMorphology", "FeOffset", "FePointLight", "FeSpecularLighting",
  "FeSpotLight", "FeTile", "FeTurbulence", "Filter", "ForeignObject", "G",
  "Image", "Line", "LinearGradient", "Marker", "Mask", "Path", "Pattern",
  "Polygon", "Polyline", "RadialGradient", "Rect", "Stop", "Text",
  "TextPath", "Tspan", "Use", "View",
]);

/**
 * Walk the descriptive tree and warn about JSX component tags
 * that aren't registered in the imports registry.
 */
function warnUnregisteredComponents(root: DescriptiveRoot, registry: Map<string, unknown>): void {
  const registeredNames = new Set(registry.keys());

  const tagRe = /<\s*\/?\s*([A-Z][a-zA-Z0-9]*)/g;
  const visit = (node: DescriptiveNode): void => {
    if (node.type === "component" && node.jsx) {
      const found = new Set<string>();
      let m;
      tagRe.lastIndex = 0;
      while ((m = tagRe.exec(node.jsx)) !== null) {
        const tag = m[1]!;
        if (!registeredNames.has(tag) && !KNOWN_HTML_TAGS.has(tag)) {
          found.add(tag);
        }
      }
      if (found.size > 0) {
        console.warn(`  ⚠ ${[...found].sort().join(", ")}: missing from imports`);
      }
    }
    const children = (node as { children?: DescriptiveNode[] }).children;
    if (Array.isArray(children)) {
      for (const c of children) visit(c);
    }
  };
  for (const c of root.children) visit(c);
}

export function compileDescriptiveRoot(input: DescriptiveRoot, options: CompileOptions = {}): Root {
  const ctx: CompileContext = {
    defaults: {
      ...DEFAULTS,
      ...(options.defaults ?? {}),
    },
  };

  // Resolve frontmatter imports / inline component defs onto each component node.
  const registry = resolveComponentSources(input);
  warnUnregisteredComponents(input, registry);

  ensureUniqueIds(input.children, "root");

  const rootKind = input.layout ?? "series";
  const resolved = resolveTransition(input.transition, input.transitionTime);
  const children = compileChildren(input.children, ctx, rootKind);
  const duration = aggregateDuration(children, rootKind, resolved.time);

  const compiled: Root = {
    id: "root",
    type: "root",
    visible: true,
    width: input.width ?? 1080,
    height: input.height ?? 1920,
    fps: input.fps ?? 30,
    instruction: input.instruction,
    metadata: input.metadata,
    stylesheet: input.stylesheet,
    subtitle: input.subtitle,
    isSeries: rootKind !== "parallel",
    transition: rootKind === "transitionSeries" ? resolved.name : undefined,
    transitionTime: rootKind === "transitionSeries" ? resolved.time : 0.5,
    children: children.map((c) => c.stream),
    durationInSeconds: duration,
  };
  return compiled;
}
