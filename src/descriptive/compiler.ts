import type {
  Audio,
  Component,
  Effect,
  EventSpec,
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
import { uid, walkDown } from "../utils/index";

export interface CompileOptions {
  defaults?: Partial<Record<"image" | "video" | "audio" | "component" | "rhythm" | "include" | "map", number>>;
  /** Google Maps API key, injected onto map nodes during compilation. */
  googleMapsApiKey?: string;
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
  style?: string;
  visible?: boolean;
  isBackground?: boolean;
  duration?: number;
  start?: number;
  /** Effects applied to this node (e.g. `["fadeIn", {animation: "bounceIn", animationTimingFunction: "ease-out"}]`).
   *  Compiles into Effect wrapper streams at compile time, so the descriptive layer
   *  doesn't need explicit `effect` parent nodes. */
  effects?: EffectSpec[];
  /** Event that fires at a specific frame, mutating registered component state. */
  on?: EventSpec;
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
  src?: string;
  /** Narration text for TTS generation. When set without src, triggers TTS pipeline. */
  script?: string;
  /** Speaker name for multi-turn dialogue. Set by resolveDialogue when expanding
   *  `SpeakerName: text` format scripts. Used for per-speaker voice selection and
   *  subtitle prefix. */
  speaker?: string;
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

/** Parsed component registration entry from a `~~~js imports` block.
 *  Remote imports have `from`; inline function defs only have `name`.
 *  The actual source text is preserved in the original importsBlock string. */
export interface ImportEntry {
  /** Component name (used as JSX tag and lookup key). */
  name: string;
  /** Source spec: `npm:`, `git:`, `github:`, `https://`, or local path. */
  from?: string;
  /** Named export to pick from the module (default: "default"). */
  exports?: string;
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
  layout?: "series" | "parallel" | "transitionSeries";
  transition?: string;
  transitionTime?: number;
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
  /** Global seed for TTI/TTV generation. When the CLI template contains {seed},
   *  this value is substituted in to make generation reproducible.
   *  All generated media in this video share the same seed, ensuring visual
   *  consistency across scenes. Default: no seed (random generation). */
  seed?: number;
  layout?: "series" | "parallel" | "transitionSeries";
  transition?: string;
  transitionTime?: number;
  /** Global subtitle overlay. src = VTT file with absolute timestamps. Set by resolveScripts pipeline. */
  subtitle?: SubtitleOverlay;
  /** @deprecated Unused — use importsBlock instead. DescriptiveRoot-level imports are no longer supported. */
  imports?: never;
  /** Raw imports block source (from \`\`\`imports code fence). Parsed by parseImportsBlock. */
  importsBlock?: string;
  /** Per-speaker voice mapping for multi-turn dialogue.
   *  Keys are speaker names (e.g. "Ray", "Alice"), values are TTS voice names
   *  (e.g. "en-US-GuyNeural", "en-US-JennyNeural").
   *  When a dialogue node has a matching `speaker` field, its TTS voice is
   *  substituted from this map. */
  voices?: Record<string, string>;
  children: DescriptiveNode[];
}

// ── Template variable resolution ─────────────────────────────────────────

export interface TemplateContext {
  width: number;
  height: number;
  fps: number;
  /** Variant name (e.g. "video", "zh", "portrait"). Defaults to "video". */
  variant: string;
}

/**
 * Resolve `${var}` placeholders in string values using the template context.
 * Supports: width, height, fps, variant.
 * Non-recursive — one pass, nested placeholders not supported.
 */
export function resolveTemplateVars(value: string, ctx: TemplateContext): string {
  return value.replace(/\$\{(\w+)\}/g, (_, name: string) => {
    switch (name) {
      case "width": return String(ctx.width);
      case "height": return String(ctx.height);
      case "fps": return String(ctx.fps);
      case "variant": return ctx.variant;
      default: return `\${${name}}`; // leave unresolved
    }
  });
}

/**
 * Walk the descriptive tree and resolve `${var}` placeholders in select
 * content fields only: `src`, `prompt`, and `stylesheet`.
 *
 * Root config keys (width, height, fps, layout, tts, etc.) and other
 * string fields (jsx, script, style, etc.) are NOT resolved — they are
 * authored directly or configured by the engine.
 *
 * Called before compilation so each variant gets resolved values.
 */
export function resolveAllTemplateVars(
  root: DescriptiveRoot,
  ctx: TemplateContext,
): DescriptiveRoot {
  const clone: DescriptiveRoot = JSON.parse(JSON.stringify(root));

  // Resolve stylesheet at root level
  if (typeof clone.stylesheet === "string") {
    clone.stylesheet = resolveTemplateVars(clone.stylesheet, ctx);
  }

  // Resolve src + prompt on leaf nodes only
  walkDown(clone as any, (node) => {
    const n = node as any;
    if (typeof n.src === "string") {
      n.src = resolveTemplateVars(n.src, ctx);
    }
    if (typeof n.prompt === "string") {
      n.prompt = resolveTemplateVars(n.prompt, ctx);
    }
  });

  return clone;
}

interface CompileContext {
  defaults: Record<"image" | "video" | "audio" | "component" | "rhythm" | "include" | "map" | "effect", number>;
  googleMapsApiKey: string;
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
    const trimmed = spec.trim();
    // Inline JSON object form: supports customKeyframes and other properties
    // e.g. effects:[{animation:"custom", customKeyframes:{...}}]
    if (trimmed.startsWith("{")) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return { animation: trimmed };
      }
    }
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

/** Extract `on` event from a descriptive node if present. */
function pickOn(node: { on?: EventSpec }): { on?: EventSpec } {
  if (node.on) return { on: node.on };
  return {};
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
  const innerStream = result.stream as any;
  const absStart = innerStream.start ?? 0;
  const absEnd = innerStream.end ?? result.duration;
  const duration = absEnd - absStart;

  // Reset inner stream's timing to be relative (start=0) so the effect
  // wrapper owns the absolute timing. The EffectWrapper renders children
  // with their relative timing inside its own Sequence.
  const resetStream = {
    ...innerStream,
    start: 0,
    end: duration,
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
      start: effStart,
      end: effEnd,
      visible: true,
      ...pickOn(node),
    } as Effect;
  }

  return { stream: currentStream, duration: result.duration };
}

function compileLeaf(node: Exclude<DescriptiveNode, DescriptiveContainer | DescriptiveScene | DescriptiveInclude>, ctx: CompileContext, parentKind: "series" | "parallel" | "transitionSeries"): CompileResult {
  const id = node.id ?? uid();
  const start = parentKind === "parallel" ? Math.max(0, node.start ?? 0) : 0;
  const duration = deriveLeafDuration(node, ctx);
  const end = start + duration;

  const base = {
    id,
    style: node.style,
    visible: node.visible ?? true,
    isBackground: node.isBackground,
    start,
    end,
    startFrom: node.type === "video" || node.type === "audio" ? node.startFrom : undefined,
    endAt: node.type === "video" || node.type === "audio" ? node.endAt : undefined,
    durationInSeconds: end,
    ...pickOn(node),
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
        loop: node.loop,
        speaker: node.speaker,
      };
      return { stream, duration: end };
    }
    case "image": {
      const stream: Image = {
        ...base,
        type: "image",
        src: node.src,
        fit: node.fit ?? "contain",
      };
      return { stream, duration: end };
    }
    case "component": {
      // Collect extra properties from descriptive node (e.g. `source` from ~~~md source fences)
      const KNOWN_COMPONENT_KEYS = new Set([
        "type", "jsx", "id", "instruction", "style", "visible",
        "isBackground", "duration", "start", "on",
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
        googleMapsApiKey: ctx.googleMapsApiKey,
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
      } else if (isRhythm(child)) {
        result = compileRhythm(child, ctx, parentKind);
      } else if (isMap(child)) {
        result = compileLeaf(child, ctx, parentKind);
      } else {
        result = compileLeaf(child, ctx, parentKind);
      }
      // Apply direct effects on any node (descriptive-layer shorthand).
      result = wrapWithEffects(child, result, parentKind);
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
    for (const child of children) {
      if ((child.stream as any).isBackground) continue;
      max = Math.max(max, child.duration);
    }
    return max;
  }

  let total = 0;
  const overlap = kind === "transitionSeries" ? (transitionTime ?? 0.5) : 0;
  for (let i = 0; i < children.length; i++) {
    if ((children[i]!.stream as any).isBackground) continue;
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
        start: 0,
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
    start,
    children: sceneChildren,
    durationInSeconds: end,
    ...pickOn(node),
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
    start,
    end,
    durationInSeconds: end,
    ...pickOn(node),
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
    start,
    end,
    durationInSeconds: end,
    ...pickOn(node),
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
    start: 0,
    isSeries: node.type !== "parallel",
    transition: node.type === "transitionSeries" ? resolved.name : undefined,
    transitionTime: node.type === "transitionSeries" ? resolved.time : 0.5,
    children: children.map((c) => c.stream),
    durationInSeconds: duration,
    ...pickOn(node),
  };

  return { stream, duration };
}

// ── Frontmatter imports resolver ──────────────────────────────────────────

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
    // Only the name is extracted for validation — the raw source is used by the bundler.
    const funcExport = /^export(?:\s+default)?\s+function\s+(\w+)\s*\(/.exec(line);
    if (funcExport) {
      entries.push({ name: funcExport[1]! });
      // Skip the function body (braces tracked)
      let braceDepth = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
      i++;
      while (i < lines.length && braceDepth > 0) {
        const bl = lines[i]!;
        braceDepth += (bl.match(/{/g) || []).length;
        braceDepth -= (bl.match(/}/g) || []).length;
        i++;
      }
      continue;
    }

    i++;
  }

  return entries;
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
function resolveComponentSources(root: DescriptiveRoot): Set<string> {
  if (!root.importsBlock) return new Set();
  const entries = parseImportsBlock(root.importsBlock);
  return new Set(entries.map((e) => e.name).filter(Boolean));
}

/**
 * Walk the descriptive tree and warn about JSX component tags
 * that aren't registered in the imports registry.
 */
function warnUnregisteredComponents(root: DescriptiveRoot, registeredNames: Set<string>): void {

  const tagRe = /<\s*\/?\s*([A-Z][a-zA-Z0-9]*)/g;
  const visit = (node: DescriptiveNode): void => {
    if (node.type === "component" && node.jsx) {
      const found = new Set<string>();
      let m;
      tagRe.lastIndex = 0;
      while ((m = tagRe.exec(node.jsx)) !== null) {
        const tag = m[1]!;
        // Only warn for uppercase tags (component references)
        // Lowercase tags are HTML/SVG built-ins.
        if (!registeredNames.has(tag)) {
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

// ── Variant override resolution ─────────────────────────────────────────

/**
 * Collect all variant names from the entire tree by scanning every node's keys.
 * Detects keys like `zh-src`, `zh-tiktok-style`, etc.
 */
function collectVariantNames(root: Record<string, unknown>, variantChain: string[]): Set<string> {
  const names = new Set<string>();

  function scan(node: Record<string, unknown>): void {
    for (const key of Object.keys(node)) {
      const idx = key.indexOf("-");
      if (idx > 0) {
        const candidate = key.slice(0, idx);
        // Only collect if it matches a variant in the chain or is a known variant prefix
        if (
          candidate.length > 0 &&
          /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(candidate) &&
          !names.has(candidate)
        ) {
          // Check if this prefix appears on a key that has a corresponding base key
          const baseKey = key.slice(idx + 1);
          if (baseKey in node || variantChain.includes(candidate)) {
            names.add(candidate);
          }
        }
      }
    }
    // Recurse
    const children = node.children;
    if (Array.isArray(children)) {
      for (const child of children) scan(child as Record<string, unknown>);
    }
  }

  scan(root);
  return names;
}

/**
 * For a given field name and variant chain, check if a variant-specific
 * override exists on the node. Returns the override value if found, else undefined.
 *
 * Lookup order (first match wins):
 *   1. <variant1>-<variant2>-<key>  (most specific combined)
 *   2. <variant1>-<key>
 *   3. <variant2>-<key>
 *   4. <key>  (base — caller handles this)
 */
function lookupVariantValue(
  node: Record<string, unknown>,
  key: string,
  variantChain: string[],
): unknown | undefined {
  // Combined variant key: zh-tiktok-src
  if (variantChain.length > 1) {
    const combinedKey = `${variantChain.join("-")}-${key}`;
    if (combinedKey in node) return node[combinedKey];
  }
  // Individual variant keys: zh-src, then tiktok-src
  for (const v of variantChain) {
    const vKey = `${v}-${key}`;
    if (vKey in node) return node[vKey];
  }
  return undefined;
}

/**
 * Map of node type → its "primary content" key.
 * When a bare variant key like `zh` is found, its value replaces this key.
 */
const PRIMARY_CONTENT_KEY: Record<string, string> = {
  audio: "script",
  component: "jsx",
  image: "src",
  video: "src",
};

/**
 * Resolve variant-specific overrides on a deep-cloned copy of the descriptive root.
 *
 * Two override mechanisms:
 *   1. **Variant-prefixed keys**: `zh-src` → `src` for variant "zh"
 *   2. **Bare variant keys**: `zh` → replaces the node's "primary content" key
 *      (e.g., `zh:"欢迎"` → replaces `script` on audio nodes, `jsx` on components)
 *
 * Then strips all `<variant>-*` keys from the output.
 *
 * @param root - The base descriptive root (from `# video`)
 * @param variantChain - Ordered variant names (e.g. ["zh", "tiktok"])
 * @returns A new DescriptiveRoot with variant overrides applied
 */
export function resolveVariantOverrides(
  root: DescriptiveRoot,
  variantChain: string[],
): DescriptiveRoot {
  if (variantChain.length === 0) return root;

  const clone: DescriptiveRoot = JSON.parse(JSON.stringify(root));

  // Scan entire tree for variant-prefixed keys to strip later
  const knownVariants = collectVariantNames(clone as Record<string, unknown>, variantChain);

  function applyOverrides(node: Record<string, unknown>): void {
    // Phase 1: variant-prefixed overrides (zh-src → src)
    const keys = Object.keys(node);
    for (const key of keys) {
      if (key === "type" || key === "id" || key === "children") continue;
      const override = lookupVariantValue(node, key, variantChain);
      if (override !== undefined) {
        node[key] = override;
      }
    }

    // Phase 2: bare variant keys (zh → replaces primary content key)
    const nodeType = node.type as string | undefined;
    const primaryKey = nodeType ? PRIMARY_CONTENT_KEY[nodeType] : undefined;
    if (primaryKey) {
      for (const v of variantChain) {
        if (v in node) {
          node[primaryKey] = node[v];
          break; // first matching variant wins
        }
      }
    }

    // Strip all <variant>-* keys AND bare variant keys from the output
    const stripKeys = new Set<string>(variantChain);
    for (const v of knownVariants) {
      const prefix = `${v}-`;
      for (const key of Object.keys(node)) {
        if (key.startsWith(prefix) || stripKeys.has(key)) {
          delete node[key];
        }
      }
    }
    // Also strip bare variant keys that aren't covered by knownVariants
    for (const v of variantChain) {
      delete node[v];
    }

    // Recurse into children
    const children = node.children;
    if (Array.isArray(children)) {
      for (const child of children) {
        applyOverrides(child as Record<string, unknown>);
      }
    }
  }

  applyOverrides(clone as Record<string, unknown>);
  return clone;
}

export function compileDescriptiveRoot(input: DescriptiveRoot, options: CompileOptions = {}): Root {
  const root: DescriptiveRoot = typeof input === "string" ? JSON.parse(input) : input;

  const resolved = resolveTransition(
    root.layout === "transitionSeries" ? (root.transition ?? "fade") : root.transition,
    root.transitionTime,
  );
  const rootKind: "series" | "parallel" | "transitionSeries" =
    root.layout === "parallel" ? "parallel" :
    root.layout === "transitionSeries" ? "transitionSeries" : "series";

  const googleMapsApiKey = options.googleMapsApiKey ?? "";
  const ctx: CompileContext = {
    defaults: {
      ...DEFAULTS,
      ...(options.defaults ?? {}),
    },
    googleMapsApiKey,
  };

  // Resolve frontmatter imports / inline component defs onto each component node.
  const registry = resolveComponentSources(input);
  warnUnregisteredComponents(input, registry);

  ensureUniqueIds(input.children, "root");

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
    transition: root.transition || root.layout === "transitionSeries" ? resolved.name : undefined,
    transitionTime: root.transition || root.layout === "transitionSeries" ? resolved.time : 0.5,
    children: children.map((c) => c.stream),
    durationInSeconds: duration,
  };
  return compiled;
}
