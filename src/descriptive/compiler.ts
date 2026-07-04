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

export type DurationMode = "strict" | "draft";

export interface CompileOptions {
  mode?: DurationMode;
  defaults?: Partial<Record<"image" | "video" | "audio" | "component" | "rhythm" | "include" | "map" | "effect", number>>;
}

export interface DescriptiveBaseNode {
  id?: string;
  instruction?: string;
  script?: string;
  style?: string;
  visible?: boolean;
  isBackground?: boolean;
  duration?: number;
  start?: number;
}

export interface TtsConfig {
  /** CLI command template with {var} placeholders.
   *  Built-in vars: {text}, {output}, {voice}, {rate}, {refAudio}
   *  Extra vars can be passed via `options`.
   *  Default: edge-tts --voice "{voice}" --text "{text}" --write-media "{output}"
   *  Special value "copy" copies refAudio to output (no generation). */
  cli?: string;
  /** Voice name or model path */
  voice?: string;
  /** Speech rate percentage string e.g. "+20%", "-10%" */
  rate?: string;
  /** Reference audio path for voice cloning */
  refAudio?: string;
  /** Extra variables for CLI template substitution */
  options?: Record<string, string>;
}

export interface SttConfig {
  model?: string;
  language?: string;
}

export interface DescriptiveVideo extends DescriptiveBaseNode {
  type: "video";
  src: string;
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
  src: string;
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
  tts?: TtsConfig;
  layout?: "series" | "parallel" | "transitionSeries";
  transition?: "fade" | "slide" | "wipe" | "flip" | "clockWipe";
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
  transition?: "fade" | "slide" | "wipe" | "flip" | "clockWipe";
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
  theme?: string;
  tts?: TtsConfig;
  stt?: SttConfig;
  layout?: "series" | "parallel" | "transitionSeries";
  transition?: "fade" | "slide" | "wipe" | "flip" | "clockWipe";
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
  mode: DurationMode;
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

function ensureUniqueIds(children: DescriptiveNode[], scopeId: string, mode: DurationMode): void {
  const seen = new Set<string>();
  for (const child of children) {
    if (!child.id) continue;
    if (seen.has(child.id)) {
      if (mode === "strict") {
        throw new Error(`duplicate id \"${child.id}\" in container \"${scopeId}\"`);
      }
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
  if (ctx.mode === "draft") return fallback;

  throw new Error(`cannot resolve duration for node id=\"${node.id ?? "(missing)"}\" type=\"${node.type}\"`);
}

function compileLeaf(node: Exclude<DescriptiveNode, DescriptiveContainer | DescriptiveScene | DescriptiveInclude | DescriptiveEffect>, ctx: CompileContext, parentKind: "series" | "parallel" | "transitionSeries"): CompileResult {
  if (typeof node.start === "number" && parentKind !== "parallel") {
    if (ctx.mode === "strict") {
      throw new Error(`start is only allowed in parallel containers: id=\"${node.id ?? "(missing)"}\"`);
    }
  }

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
      const registry = (node as any)._resolvedRegistry as Map<string, ResolvedImport> | undefined;

      // Build the imports map for runtime (name → resolved URL)
      const importsMap: Record<string, string> = {};
      if (registry) {
        for (const [name, def] of registry) {
          if (def.src) importsMap[name] = def.src;
          else if (def.definitionJsx) importsMap[name] = `__jsx__:${name}`;
        }
      }

      const stream: Component = {
        ...base,
        type: "component",
        jsx: node.jsx,
        imports: Object.keys(importsMap).length ? importsMap : undefined,
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
      if (isContainer(child)) {
        return compileContainer(child, ctx, parentKind);
      }
      if (isScene(child)) {
        return compileScene(child, ctx, parentKind);
      }
      if (isInclude(child)) {
        return compileInclude(child, ctx, parentKind);
      }
      if (isEffect(child)) {
        return compileEffect(child, ctx, parentKind);
      }
      if (isRhythm(child)) {
        return compileRhythm(child, ctx, parentKind);
      }
      if (isMap(child)) {
        return compileLeaf(child, ctx, parentKind);
      }
      return compileLeaf(child, ctx, parentKind);
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
  if (typeof node.start === "number" && parentKind !== "parallel" && ctx.mode === "strict") {
    throw new Error(`start is only allowed in parallel containers: id=\"${node.id ?? "(missing)"}\"`);
  }

  const id = node.id ?? uid();
  ensureUniqueIds(node.children, id, ctx.mode);

  const sceneKind = node.layout ?? "parallel";
  const compiledChildren = compileChildren(node.children, ctx, sceneKind);
  const sceneChildren = sceneKind === "parallel"
    ? compiledChildren.map((c) => c.stream)
    : [
      {
        id: `${id}-layout`,
        type: "folder",
        visible: true,
        isSeries: true,
        transition: sceneKind === "transitionSeries" ? node.transition ?? "fade" : undefined,
        transitionTime: sceneKind === "transitionSeries" ? node.transitionTime ?? 0.5 : 0.5,
        children: compiledChildren.map((c) => c.stream),
        durationInSeconds: aggregateDuration(compiledChildren, sceneKind, node.transitionTime),
      } as Folder,
    ];

  const sceneContentDuration = sceneKind === "parallel"
    ? aggregateDuration(compiledChildren, "parallel")
    : aggregateDuration(compiledChildren, sceneKind, node.transitionTime);
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
  if (typeof node.start === "number" && parentKind !== "parallel" && ctx.mode === "strict") {
    throw new Error(`start is only allowed in parallel containers: id=\"${node.id ?? "(missing)"}\"`);
  }

  const id = node.id ?? uid();
  const start = parentKind === "parallel" ? Math.max(0, node.start ?? 0) : 0;

  const compiledChildren = node.children?.length ? compileChildren(node.children, ctx, "parallel") : [];
  const childrenDuration = aggregateDuration(compiledChildren, "parallel");

  let duration = node.duration ?? 0;
  if (!duration && node.src) {
    duration = ctx.mode === "draft" ? ctx.defaults.include : 0;
  }
  if (!duration) {
    duration = childrenDuration;
  }
  if (!duration && ctx.mode === "strict") {
    throw new Error(`cannot resolve duration for node id=\"${id}\" type=\"include\"`);
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
  if (typeof node.start === "number" && parentKind !== "parallel" && ctx.mode === "strict") {
    throw new Error(`start is only allowed in parallel containers: id=\"${node.id ?? "(missing)"}\"`);
  }

  const id = node.id ?? uid();
  ensureUniqueIds(node.children, id, ctx.mode);
  const children = compileChildren(node.children, ctx, "parallel");
  const childrenDuration = aggregateDuration(children, "parallel");

  let duration = node.duration ?? 0;
  if (!duration) duration = childrenDuration;
  if (!duration && ctx.mode === "draft") duration = ctx.defaults.effect;
  if (!duration && ctx.mode === "strict") {
    throw new Error(`cannot resolve duration for node id=\"${id}\" type=\"effect\"`);
  }

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
  if (typeof node.start === "number" && parentKind !== "parallel" && ctx.mode === "strict") {
    throw new Error(`start is only allowed in parallel containers: id="${node.id ?? "(missing)"}"`);
  }

  const id = node.id ?? uid();
  const spots = node.spots ?? [];
  const children = node.children ?? [];

  if (!children.length && ctx.mode === "strict") {
    throw new Error(`rhythm requires children: id="${node.id ?? "(missing)"}"`);
  }
  if (!spots.length && ctx.mode === "strict") {
    throw new Error(`rhythm requires spots: id="${node.id ?? "(missing)"}"`);
  }

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
  if (typeof node.start === "number" && parentKind !== "parallel") {
    if (ctx.mode === "strict") {
      throw new Error(`start is only allowed in parallel containers: id=\"${node.id ?? "(missing)"}\"`);
    }
  }

  if (typeof node.start === "number") {
    if (ctx.mode === "strict") {
      throw new Error(`container start is unsupported in legacy compilation: id=\"${node.id ?? "(missing)"}\"`);
    }
  }

  const id = node.id ?? uid();
  ensureUniqueIds(node.children, id, ctx.mode);

  const children = compileChildren(node.children, ctx, node.type);
  const duration = aggregateDuration(children, node.type, node.transitionTime);

  const stream: Folder = {
    id,
    type: "folder",
    style: node.style,
    visible: node.visible ?? true,
    isBackground: node.isBackground,
    isSeries: node.type !== "parallel",
    transition: node.type === "transitionSeries" ? node.transition ?? "fade" : undefined,
    transitionTime: node.type === "transitionSeries" ? node.transitionTime ?? 0.5 : 0.5,
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
 */

export function parseImportsBlock(source: string): ImportEntry[] {
  const entries: ImportEntry[] = [];
  const lines = source.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!.trim();

    // import { Name } from "spec"
    // import { Name as Alias } from "spec"
    // import { Name1, Name2 } from "spec"
    const namedImport = /^import\s+\{\s*([^}]+)\}\s+from\s+["'`](.+?)["'`]\s*;?\s*$/.exec(line);
    if (namedImport) {
      const namesStr = namedImport[1]!;
      const fromSpec = namedImport[2]!;
      for (const part of namesStr.split(",")) {
        const trimmed = part.trim();
        const asMatch = /^(.+?)\s+as\s+(.+)$/i.exec(trimmed);
        const name = asMatch ? asMatch[2]!.trim() : trimmed;
        entries.push({ name, from: fromSpec });
      }
      i++;
      continue;
    }

    // import DefaultName from "spec"
    const defaultImport = /^import\s+(\w+)\s+from\s+["'`](.+?)["'`]\s*;?\s*$/.exec(line);
    if (defaultImport) {
      entries.push({ name: defaultImport[1]!, from: defaultImport[2]! });
      i++;
      continue;
    }

    // export { Name } from "spec"  (re-export syntax, same as named import)
    const namedReExport = /^export\s+\{\s*([^}]+)\}\s+from\s+["'`](.+?)["'`]\s*;?\s*$/.exec(line);
    if (namedReExport) {
      const namesStr = namedReExport[1]!;
      const fromSpec = namedReExport[2]!;
      for (const part of namesStr.split(",")) {
        const trimmed = part.trim();
        const asMatch = /^(.+?)\s+as\s+(.+)$/i.exec(trimmed);
        const name = asMatch ? asMatch[2]!.trim() : trimmed;
        entries.push({ name, from: fromSpec });
      }
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
      entries.push({ name, jsx: bodyLines.join("\n") });
      continue;
    }

    i++;
  }

  return entries;
}
export function resolveComponentImportSpec(spec: string): string {
  const s = spec.trim();
  // Split on # to separate package from internal module path
  // e.g. npm:@lalalic/recharts#a/b/c → npm:@lalalic/recharts / a/b/c
  const hashIdx = s.indexOf("#");
  const pkg = hashIdx >= 0 ? s.slice(0, hashIdx) : s;
  const subpath = hashIdx >= 0 ? s.slice(hashIdx + 1) : "";

  let base: string;
  if (pkg.startsWith("npm:")) base = `https://esm.sh/${pkg.slice(4)}`;
  else if (pkg.startsWith("git:")) base = `https://esm.sh/gh/${pkg.slice(4)}`;
  else if (pkg.startsWith("github:")) base = `https://esm.sh/gh/${pkg.slice(7)}`;
  else base = pkg;

  return subpath ? `${base}/${subpath}` : base;
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
      resolved.src = resolveComponentImportSpec(entry.from);
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

export function compileDescriptiveRoot(input: DescriptiveRoot, options: CompileOptions = {}): Root {
  const ctx: CompileContext = {
    mode: options.mode ?? "strict",
    defaults: {
      ...DEFAULTS,
      ...(options.defaults ?? {}),
    },
  };

  // Resolve frontmatter imports / inline component defs onto each component node.
  resolveComponentSources(input);

  ensureUniqueIds(input.children, "root", ctx.mode);

  const rootKind = input.layout ?? "series";
  const children = compileChildren(input.children, ctx, rootKind);
  const duration = aggregateDuration(children, rootKind, input.transitionTime);

  return {
    id: "root",
    type: "root",
    visible: true,
    width: input.width ?? 1080,
    height: input.height ?? 1920,
    fps: input.fps ?? 30,
    instruction: input.instruction,
    metadata: input.metadata,
    stylesheet: input.stylesheet,
    theme: input.theme,
    subtitle: input.subtitle,
    isSeries: rootKind !== "parallel",
    transition: rootKind === "transitionSeries" ? input.transition ?? "fade" : undefined,
    transitionTime: rootKind === "transitionSeries" ? input.transitionTime ?? 0.5 : 0.5,
    children: children.map((c) => c.stream),
    durationInSeconds: duration,
  };
}
