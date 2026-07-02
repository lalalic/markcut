import { z } from "zod";
import { uid } from "../utils/index";

/**
 * Lite stream schema.
 * Render-only — no prompts, no async transforms, no providers.
 *
 * A stream tree is rooted at `root`. Folders contain children.
 * Leaf streams (video/audio/image/subtitle/component) have actions[]
 * describing when they appear on the timeline.
 */

export const action = z.object({
  id: z.string().default(() => uid()),
  start: z.number().min(0).default(0).describe("seconds, relative to parent"),
  end: z.number().min(0).default(1).describe("seconds, relative to parent"),
  startFrom: z.number().optional().describe("trim seconds from source start"),
  endAt: z.number().optional().describe("trim seconds at source end"),
  loop: z.number().int().min(1).optional().describe(">1 = loop count"),
  effectId: z.string().optional(),
  style: z.string().optional().describe("inline css"),
  volume: z.number().min(0).max(1).optional(),
});
export type Action = z.infer<typeof action>;

const BaseShape = {
  id: z.string().default(() => uid()),
  name: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional().describe("human label for UI/organization (not rendered)"),
  script: z.string().optional().describe("narration/dialogue text for this node; agents write storyboard text here, later TTS'd to audio and STT'd to VTT subtitles"),
  src: z.string().optional(),
  style: z.string().optional().describe("inline css"),
  visible: z.boolean().default(true),
  isBackground: z.boolean().optional(),
  durationInSeconds: z.number().optional().describe("set by engine; do not edit by hand"),
};

export const base = z.object(BaseShape);

export const folder = base.extend({
  type: z.literal("folder").default("folder"),
  isSeries: z.boolean().optional(),
  transition: z.enum(["fade", "slide", "wipe", "flip", "clockWipe"]).optional(),
  transitionTime: z.number().min(0.1).max(5).default(0.5),
  shadow: z.number().min(0).optional(),
  children: z.array(z.lazy((): z.ZodTypeAny => stream)).default(() => []),
});
export type Folder = z.infer<typeof folder>;

export const root = folder.extend({
  id: z.literal("root").default("root"),
  type: z.literal("root").default("root"),
  width: z.number().int().positive().default(1080),
  height: z.number().int().positive().default(1920),
  fps: z.number().int().positive().default(30),
  description: z.string().optional(),
  metadata: z.string().optional(),
  stylesheet: z.string().optional().describe("global css; selectors use .type and .name"),
});
export type Root = z.infer<typeof root>;

export const video = base.extend({
  type: z.literal("video").default("video"),
  src: z.string().optional(),
  volume: z.number().min(0).max(1).default(1),
  playbackRate: z.number().optional(),
  width: z.number().default(1080),
  height: z.number().default(1920),
  actions: z.array(action).min(1).default(() => [action.parse({})]),
});
export type Video = z.infer<typeof video>;

export const audio = base.extend({
  type: z.literal("audio").default("audio"),
  src: z.string().optional(),
  volume: z.number().min(0).max(1).default(1),
  foreground: z.boolean().optional().describe("ducks parent video audio while playing"),
  actions: z.array(action).min(1).default(() => [action.parse({})]),
});
export type Audio = z.infer<typeof audio>;

export const image = base.extend({
  type: z.literal("image").default("image"),
  src: z.string().optional(),
  fit: z.enum(["contain", "cover", "fill"]).default("contain"),
  actions: z.array(action).min(1).default(() => [action.parse({})]),
});
export type Image = z.infer<typeof image>;

export const subtitleWord = z.object({
  text: z.string(),
  start: z.number().min(0),
  end: z.number().min(0),
});
export type SubtitleWord = z.infer<typeof subtitleWord>;

export const subtitleCue = z.object({
  startFrom: z.number().min(0),
  endAt: z.number().min(0),
  text: z.string(),
  className: z.string().optional(),
  words: z.array(subtitleWord).optional(),
});
export type SubtitleCue = z.infer<typeof subtitleCue>;

export const subtitle = base.extend({
  type: z.literal("subtitle").default("subtitle"),
  src: z.string().optional().describe("inline text or VTT url"),
  cues: z.array(subtitleCue).optional(),
  fontSize: z.union([z.number(), z.string()]).optional(),
  fontStyle: z.string().optional(),
  captionType: z.string().optional(),
  actions: z.array(action).min(1).default(() => [action.parse({})]),
});
export type Subtitle = z.infer<typeof subtitle>;

/**
 * Lite component: references a host-registered React component by `name`.
 * Props are JSON-serializable. No JSX parsing, no eval.
 *
 * Full bundle adds a `jsx` field with react-jsx-parser, kept opt-in.
 */
export const component = base.extend({
  type: z.literal("component").default("component"),
  componentName: z.string().describe("key in <ComposeProvider components={...}>"),
  src: z.string().optional().describe("URL of remote component bundle (ESM or CJS)"),
  props: z.record(z.string(), z.unknown()).default(() => ({})),
  actions: z.array(action).min(1).default(() => [action.parse({})]),
});
export type Component = z.infer<typeof component>;

// ---------------------------------------------------------------------------
// Effect — CSS keyframe animation wrapper
// ---------------------------------------------------------------------------
export const effect = base.extend({
  type: z.literal("effect").default("effect"),
  animation: z.string().optional().describe("builtin keyframe name or 'custom'"),
  animationTimingFunction: z
    .enum(["linear", "ease", "ease-in", "ease-out", "ease-in-out"])
    .optional(),
  animationIterationCount: z.number().default(1),
  customKeyframes: z
    .record(z.string(), z.record(z.string(), z.string()))
    .optional()
    .describe('inline keyframes: { "0": { opacity: "0" }, "100": { opacity: "1" } }'),
  children: z.array(z.lazy((): z.ZodTypeAny => stream)).default(() => []),
  actions: z.array(action).min(1).default(() => [action.parse({})]),
});
export type Effect = z.infer<typeof effect>;

// ---------------------------------------------------------------------------
// Rhythm — audio loop with beat-synced children
// ---------------------------------------------------------------------------
export const rhythm = base.extend({
  type: z.literal("rhythm").default("rhythm"),
  src: z.string().optional().describe("audio file for beat playback"),
  volume: z.number().min(0).max(1).default(1),
  spots: z.array(z.number()).optional().describe("pre-computed beat timestamps in seconds"),
  children: z.array(z.lazy((): z.ZodTypeAny => stream)).default(() => []),
  actions: z.array(action).min(1).default(() => [action.parse({})]),
});
export type Rhythm = z.infer<typeof rhythm>;

// ---------------------------------------------------------------------------
// Include — references an external video JSON file by src.
// The referenced file can be either:
//   - A stream tree JSON (has `type: "root"` or `root` property)
//   - A scene-based video.json (has `meta` and `scenes`)
//
// Usage:
//   { type: "include", src: "./path/to/video.json", actions: [{ start: 0, end: 5 }] }
//
// Falls back to inline `children` if `src` is not set (legacy behavior).
// ---------------------------------------------------------------------------
export const include = base.extend({
  type: z.literal("include").default("include"),
  src: z.string().optional().describe("path or URL to video JSON file (stream tree or scene-based)"),
  volume: z.number().min(0).max(1).default(1),
  children: z.array(z.lazy((): z.ZodTypeAny => stream)).default(() => []),
  actions: z.array(action).min(1).default(() => [action.parse({})]),
});
export type Include = z.infer<typeof include>;

// ---------------------------------------------------------------------------
// Scene — descriptive container node for storyboarding.
// A scene is a visual grouping node with metadata (name, description) that
// renders its children like a folder. It exists so UI tools can display
// high-level storyboard cards without needing to understand the full stream
// tree. The engine treats it identically to a folder.
//
// Usage:
//   { type: "scene", name: "Intro", description: "Opening hook",
//     children: [{ type: "component", componentName: "BigStatement", ... }] }
//
// Parent folder's isSeries controls sequencing (same as folder children).
// ---------------------------------------------------------------------------
export const scene = base.extend({
  type: z.literal("scene").default("scene"),
  name: z.string().optional().describe("scene title for storyboard UI"),
  description: z.string().optional().describe("scene description for storyboard UI"),
  children: z.array(z.lazy((): z.ZodTypeAny => stream)).default(() => []),
  durationInSeconds: z.number().optional().describe("set by engine; do not edit by hand"),
});
export type Scene = z.infer<typeof scene>;

// ---------------------------------------------------------------------------
// Map — animated route visualization
// ---------------------------------------------------------------------------
export const mapWaypoint = z.object({
  lat: z.number(),
  lng: z.number(),
  label: z.string().optional(),
  media: z.string().optional().describe("image/video src for waypoint marker"),
});
export type MapWaypoint = z.infer<typeof mapWaypoint>;

export const mapStream = base.extend({
  type: z.literal("map").default("map"),
  waypoints: z.array(mapWaypoint).default(() => []),
  routeColor: z.string().default("#4285F4"),
  routeWeight: z.number().default(4),
  zoom: z.number().default(10),
  center: z.object({ lat: z.number(), lng: z.number() }).optional().describe("map view center (defaults to first waypoint)"),
  mapType: z.enum(["roadmap", "satellite", "hybrid", "terrain"]).default("roadmap").describe("Google Maps style"),
  travelMode: z.enum(["DRIVING", "WALKING", "BICYCLING", "TRANSIT"]).default("DRIVING").describe("Directions API travel mode"),
  routeMarker: z.string().default("🚗").describe("emoji/character for the animated traveling marker"),
  actions: z.array(action).min(1).default(() => [action.parse({})]),
});
export type MapStream = z.infer<typeof mapStream>;

// ---------------------------------------------------------------------------
// Discriminated union
// ---------------------------------------------------------------------------
export const stream = z.discriminatedUnion("type", [
  root,
  folder,
  video,
  audio,
  image,
  subtitle,
  component,
  effect,
  rhythm,
  mapStream,
  include,
  scene,
]);
export type Stream = z.infer<typeof stream>;

export const types = {
  root, folder, video, audio, image, subtitle, component,
  effect, rhythm, map: mapStream, include, scene,
} as const;
