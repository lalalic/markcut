/**
 * Pure helpers, no AI, no network, no React.
 * Pure helpers — no AI, no network, no React.
 */

export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

const KEBAB = /[^a-zA-Z0-9_-]+/g;
export function toClassName(s: string): string {
  return (s || "").replace(KEBAB, "-").replace(/^-+|-+$/g, "");
}

export function toPlaybackRate(rate: number): number {
  // remotion clamps to (0.0625, 16)
  if (!isFinite(rate) || rate <= 0) return 1;
  return Math.min(16, Math.max(0.0625, rate));
}

export function cssJS(css?: string | Record<string, unknown>): Record<string, unknown> {
  if (!css) return {};
  if (typeof css === "object") return css;
  const out: Record<string, string> = {};
  for (const decl of css.split(";")) {
    const i = decl.indexOf(":");
    if (i < 0) continue;
    const k = decl.slice(0, i).trim();
    const v = decl.slice(i + 1).trim();
    if (!k) continue;
    const camel = k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    out[camel] = v;
  }
  return out;
}

/**
 * Walk a stream tree depth-first. Visitor returns false to stop descending.
 */
export type StreamNode = { id?: string; type?: string; children?: StreamNode[]; [k: string]: unknown };
export function walkDown<T extends StreamNode>(
  node: T,
  visit: (n: T, parent: T | null, depth: number) => boolean | void,
  parent: T | null = null,
  depth = 0,
): void {
  const keep = visit(node, parent, depth);
  if (keep === false) return;
  if (Array.isArray(node.children)) {
    for (const c of node.children) walkDown(c as T, visit, node, depth + 1);
  }
}

/**
 * Compute duration of a stream subtree, in seconds.
 *
 * Compute duration of a stream subtree, in seconds.
 *
 *  - rhythm streams use their pre-set durationInSeconds (set by host)
 *  - leaf duration uses base `end` (or `start + duration`) via leafEnd()
 *  - series sums children, subtracting transition overlaps
 *  - sequence (parallel) takes max child duration
 *  - background children do not contribute
 *  - leaf duration uses base `end` (or `start + duration`) via leafEnd()
 *  - streamRef/template instancing is unsupported in lite
 */
export interface DurationStream extends StreamNode {
  type?: string;
  isSeries?: boolean;
  isBackground?: boolean;
  transition?: string;
  transitionTime?: number;
  durationInSeconds?: number;
  start?: number;
  end?: number;
  duration?: number;
  children?: DurationStream[];
}

/**
 * Resolve a leaf node's effective end time from its base timing fields.
 * `end` is the source of truth; `duration` is a convenience that normalizes
 * to `start + duration` when `end` is absent. Returns 0 when neither is set.
 */
export function leafEnd(stream: { start?: number; end?: number; duration?: number }): number {
  if (typeof stream.end === "number") return stream.end;
  const s = stream.start ?? 0;
  if (typeof stream.duration === "number") return s + stream.duration;
  return 0;
}

export function getDurationInSeconds(stream: DurationStream, update = true): number {
  if (!stream) return 0;

  if (stream.type === "rhythm") {
    return stream.durationInSeconds ?? 0;
  }

  // include: if src is set, treat as leaf (duration from base end).
  // Otherwise fall back to inline children (legacy).
  if (stream.type === "include") {
    if (stream.src) {
      // External reference — use base end (like other leaves)
      const d = leafEnd(stream);
      if (update) stream.durationInSeconds = d;
      return d;
    }
    // Inline children fallback (legacy) — parallel max
    const children = stream.children ?? [];
    if (children.length && update) {
      for (const child of children) {
        getDurationInSeconds(child, update);
      }
    }
    const visible = children.filter((c) => !c.isBackground);
    let total = 0;
    for (const c of visible) {
      const d = c.durationInSeconds ?? 0;
      if (d > total) total = d;
    }
    if (update) stream.durationInSeconds = total;
    return total;
  }

  // scene is a container (like folder) — falls through to general children logic
  // leaf with base timing fields (start/end/duration)
  if (!stream.children?.length) {
    const d = leafEnd(stream);
    if (update) stream.durationInSeconds = d;
    return d;
  }

  let total = 0;
  for (const child of stream.children) {
    getDurationInSeconds(child, update);
  }

  // Effect wrappers encompass all children visually; background children
  // still contribute to the effect's visible duration.
  const visible = stream.type === "effect"
    ? stream.children
    : stream.children.filter((c) => !c.isBackground);
  if (stream.isSeries) {
    const overlap = stream.transition ? (stream.transitionTime ?? 0.5) : 0;
    for (let i = 0; i < visible.length; i++) {
      const c = visible[i]!;
      const d = c.durationInSeconds ?? 0;
      total += d;
      if (i > 0 && overlap > 0) total -= overlap;
    }
  } else {
    for (const c of visible) {
      const d = c.durationInSeconds ?? 0;
      if (d > total) total = d;
    }
  }

  if (update) stream.durationInSeconds = total;
  return total;
}

/** WebVTT parsing — supports plain "MM:SS.mmm" or "HH:MM:SS.mmm". */
export const VTT_REG = /^(?:(\d+):)?(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?$/;
export function vttSecond(t: string): number {
  const m = VTT_REG.exec(t.trim());
  if (!m) return 0;
  const [, h = "0", mm = "0", ss = "0", ms = "0"] = m;
  return Number(h) * 3600 + Number(mm) * 60 + Number(ss) + Number(ms.padEnd(3, "0")) / 1000;
}

export interface Cue { startFrom: number; endAt: number; text: string }
export function parseVTT(src: string): Cue[] {
  const cues: Cue[] = [];
  const blocks = src.replace(/\r\n/g, "\n").split(/\n\n+/);
  for (const b of blocks) {
    const lines = b.split("\n").filter(Boolean);
    const tline = lines.find((l) => l.includes("-->"));
    if (!tline) continue;
    const [a, z] = tline.split("-->").map((s) => s.trim());
    if (!a || !z) continue;
    const text = lines.slice(lines.indexOf(tline) + 1).join("\n").trim();
    cues.push({ startFrom: vttSecond(a), endAt: vttSecond(z), text });
  }
  return cues;
}
