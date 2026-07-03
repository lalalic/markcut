import type {
  DescriptiveAudio,
  DescriptiveComponent,
  DescriptiveContainer,
  DescriptiveEffect,
  DescriptiveImage,
  DescriptiveInclude,
  DescriptiveMap,
  DescriptiveMapWaypoint,
  DescriptiveNode,
  DescriptiveRhythm,
  DescriptiveRoot,
  DescriptiveScene,
  DescriptiveVideo,
} from "./compiler";

export interface MarkdownParseOptions {
  mode?: "strict" | "compatible";
}

type ParentNode = DescriptiveRoot | DescriptiveScene | DescriptiveContainer | DescriptiveEffect | DescriptiveInclude;

const LAYOUT_VALUES = new Set(["ser", "par", "ts", "series", "parallel", "transitionSeries", "transition"] as const);
const TRANSITION_VALUES = new Set(["fade", "slide", "wipe", "flip", "clockWipe"] as const);

const TYPE_TOKENS: Record<string, string> = {
  i: "image",
  image: "image",
  v: "video",
  video: "video",
  a: "audio",
  audio: "audio",
  c: "component",
  component: "component",
  r: "rhythm",
  rhythm: "rhythm",
  in: "include",
  include: "include",
  fx: "effect",
  effect: "effect",
  m: "map",
  map: "map",
  ser: "series",
  par: "parallel",
  ts: "transitionSeries",
  series: "series",
  parallel: "parallel",
  transitionSeries: "transitionSeries",
  transition: "transitionSeries",
};

const KEY_ALIASES: Record<string, string> = {
  w: "width",
  h: "height",
  lo: "layout",
  th: "theme",
  dsc: "instruction",
  inst: "instruction",
  q: "script",
  dr: "duration",
  st: "start",
  sf: "startFrom",
  ea: "endAt",
  vol: "volume",
  tr: "transition",
  tt: "transitionTime",
  p: "props",
  wp: "waypoints",
  tm: "travelMode",
  rm: "routeMarker",
};

function mapLayout(value: string): "series" | "parallel" | "transitionSeries" {
  if (value === "ser" || value === "series") return "series";
  if (value === "par" || value === "parallel") return "parallel";
  return "transitionSeries";
}

function isQuoted(token: string): boolean {
  return token.length >= 2 && token.startsWith('"') && token.endsWith('"');
}

function unquote(token: string): string {
  return isQuoted(token) ? token.slice(1, -1) : token;
}

function splitTokens(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote = false;
  let depth = 0;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      cur += ch;
      quote = !quote;
      continue;
    }
    if (!quote && (ch === "{" || ch === "[")) {
      depth++;
      cur += ch;
      continue;
    }
    if (!quote && (ch === "}" || ch === "]")) {
      depth = Math.max(0, depth - 1);
      cur += ch;
      continue;
    }
    if (!quote && depth === 0 && /\s/.test(ch)) {
      if (cur) {
        out.push(cur);
        cur = "";
      }
      continue;
    }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

function parseNumberMaybe(v: string): number | string {
  const n = Number(v);
  return Number.isFinite(n) ? n : v;
}

function parseWaypoints(raw: string): DescriptiveMapWaypoint[] {
  const s = raw.trim();
  if (!s.startsWith("[") || !s.endsWith("]")) return [];
  const body = s.slice(1, -1).trim();
  if (!body) return [];
  return body.split(";").map((part) => {
    const bits = splitTokens(part.replace(/,/g, " "));
    const lat = Number(bits[0] ?? 0);
    const lng = Number(bits[1] ?? 0);
    const labelRaw = bits[2];
    const label = labelRaw ? unquote(labelRaw) : undefined;
    return { lat, lng, label };
  });
}

/**
 * Parse a JSON-like props string into an object.
 * Handles unquoted keys and single-quoted strings.
 */
function parseProps(raw: string): Record<string, unknown> {
  const s = raw.trim();
  if (!s.startsWith("{") || !s.endsWith("}")) return {};
  try {
    return JSON.parse(s);
  } catch {
    // Try lenient parse: add quotes around unquoted keys
    const normalized = s.replace(
      /([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:(?=\s*["{[]?)/g,
      '$1"$2":',
    );
    try {
      return JSON.parse(normalized);
    } catch {
      // Last resort: eval (safe since this is a CLI tool)
      try {
        const result = (0, eval)("(" + s + ")");
        return typeof result === "object" && result !== null ? result : {};
      } catch {
        return {};
      }
    }
  }
}

function inferTypeFromSrc(src: string): string | null {
  const m = /\.([a-zA-Z0-9]+)(?:[?#].*)?$/.exec(src);
  const ext = m?.[1]?.toLowerCase();
  if (!ext) return null;
  if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) return "image";
  if (["mp4", "mov", "mkv", "webm"].includes(ext)) return "video";
  if (["mp3", "wav", "m4a", "aac", "flac"].includes(ext)) return "audio";
  if (ext === "vtt") return null; // VTT → root.subtitle.src, not a tree node
  if (ext === "json") return "include";
  return null;
}

function parseKeyValueTokens(tokens: string[], mode: "strict" | "compatible"): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let pendingTransition = false;

  for (const token of tokens) {
    const idx = token.indexOf(":");
    if (idx > 0) {
      const rawKey = token.slice(0, idx);
      const rawVal = token.slice(idx + 1);
      const key = KEY_ALIASES[rawKey] ?? rawKey;
      let val: unknown = unquote(rawVal);

      if (key === "layout") {
        const s = String(val);
        if (LAYOUT_VALUES.has(s as any)) {
          val = mapLayout(s);
        } else if (mode === "strict") {
          throw new Error(`invalid layout value: ${s}`);
        }
      }
      if (key === "transition") {
        const s = String(val);
        if (!TRANSITION_VALUES.has(s as any) && mode === "strict") {
          throw new Error(`invalid transition value: ${s}`);
        }
      }

      if (key === "waypoints") val = parseWaypoints(String(val));
      else if (key === "props") val = parseProps(String(val));
      else if (key !== "theme" && key !== "instruction" && key !== "script" && key !== "tts" && key !== "stt") {
        val = parseNumberMaybe(String(val));
      }
      out[key] = val;
      if (key === "transition") pendingTransition = true;
      continue;
    }

    if (mode === "compatible") {
      if (LAYOUT_VALUES.has(token as any) && out.layout == null) {
        out.layout = mapLayout(token);
        continue;
      }
      if (TRANSITION_VALUES.has(token as any) && out.transition == null) {
        out.transition = token;
        pendingTransition = true;
        continue;
      }
      if (pendingTransition && out.transitionTime == null) {
        const n = Number(token);
        if (Number.isFinite(n)) {
          out.transitionTime = n;
          pendingTransition = false;
          continue;
        }
      }
      if (isQuoted(token) && out.script == null) {
        out.script = unquote(token);
        continue;
      }
    }

    if (mode === "strict") {
      throw new Error(`unrecognized token: ${token}`);
    }
  }

  return out;
}

function parseHeaderScene(line: string, mode: "strict" | "compatible"): DescriptiveScene {
  const text = line.replace(/^#+\s*/, "").trim();
  const tokens = splitTokens(text);
  const nameToken = tokens.shift();
  const attrs = parseKeyValueTokens(tokens, mode);

  // Scene name from heading text (first token), title from " - " separator
  let sceneName: string | undefined;
  let sceneTitle: string | undefined;
  if (nameToken) {
    const raw = unquote(nameToken);
    const sep = raw.indexOf(" - ");
    if (sep !== -1) {
      sceneName = raw.slice(0, sep).trim();
      sceneTitle = raw.slice(sep + 3).trim();
    } else {
      sceneName = raw;
    }
  }
  sceneName = sceneName || (attrs.name ? String(attrs.name) : undefined);
  sceneTitle = sceneTitle || (attrs.title ? String(attrs.title) : undefined);

  return {
    type: "scene",
    name: sceneName,
    title: sceneTitle,
    instruction: attrs.instruction ? String(attrs.instruction) : undefined,
    script: attrs.script ? String(attrs.script) : undefined,
    layout: attrs.layout as any,
    transition: attrs.transition as any,
    transitionTime: attrs.transitionTime as any,
    children: [],
  };
}

function pushChild(parent: ParentNode, child: DescriptiveNode): void {
  parent.children.push(child);
}

function parseNodeLine(content: string, mode: "strict" | "compatible"): DescriptiveNode {
  const tokens = splitTokens(content);
  if (tokens.length === 0) throw new Error("empty node line");

  let typeToken = tokens[0]!;
  let type = TYPE_TOKENS[typeToken];

  if (type) tokens.shift();

  let firstPositional: string | undefined;
  if (type) {
    const t0 = tokens[0];
    if (
      t0 &&
      t0.indexOf(":") === -1 &&
      !LAYOUT_VALUES.has(t0 as any) &&
      !TRANSITION_VALUES.has(t0 as any)
    ) {
      firstPositional = t0;
      tokens.shift();
    }
  }

  if (!type) {
    firstPositional = tokens[0];
    if (firstPositional && firstPositional.indexOf(":") === -1 && !isQuoted(firstPositional) && !LAYOUT_VALUES.has(firstPositional as any)) {
      type = inferTypeFromSrc(firstPositional) ?? undefined;
      if (type && mode === "compatible") {
        tokens.shift();
      }
    }
  }

  if (!type) {
    if (mode === "strict") {
      throw new Error(`missing or unknown node type: ${typeToken}`);
    }
    throw new Error(`unable to infer node type: ${content}`);
  }

  // Container bullets
  if (type === "series" || type === "parallel" || type === "transitionSeries") {
    const attrs = parseKeyValueTokens(tokens, mode);
    const node: DescriptiveContainer = {
      type: type as any,
      instruction: attrs.instruction as any,
      script: attrs.script as any,
      transition: attrs.transition as any,
      transitionTime: attrs.transitionTime as any,
      children: [],
    };
    return node;
  }

  // Effect can be container-like.
  if (type === "effect") {
    const attrs = parseKeyValueTokens(tokens, mode);
    // Compat: first positional token is the animation name
    const animation = attrs.animation as string | undefined ?? firstPositional;
    const node: DescriptiveEffect = {
      type: "effect",
      instruction: attrs.instruction as any,
      script: attrs.script as any,
      animation,
      animationTimingFunction: attrs.animationTimingFunction as any,
      animationIterationCount: attrs.animationIterationCount as any,
      customKeyframes: attrs.customKeyframes as any,
      duration: attrs.duration as any,
      start: attrs.start as any,
      children: [],
    };
    return node;
  }

  const attrs = parseKeyValueTokens(tokens, mode);

  if (mode === "compatible" && firstPositional && type && attrs.script == null && isQuoted(firstPositional)) {
    attrs.script = unquote(firstPositional);
  }

  switch (type) {
    case "image": {
      const src = firstPositional ?? (attrs.src as string | undefined);
      if (!src) throw new Error("image requires src");
      const node: DescriptiveImage = {
        type: "image",
        src,
        fit: attrs.fit as any,
        duration: attrs.duration as any,
        start: attrs.start as any,
        instruction: attrs.instruction as any,
        script: attrs.script as any,
      };
      return node;
    }
    case "video": {
      const src = firstPositional ?? (attrs.src as string | undefined);
      if (!src) throw new Error("video requires src");
      const node: DescriptiveVideo = {
        type: "video",
        src,
        duration: attrs.duration as any,
        start: attrs.start as any,
        startFrom: attrs.startFrom as any,
        endAt: attrs.endAt as any,
        volume: attrs.volume as any,
        instruction: attrs.instruction as any,
        script: attrs.script as any,
      };
      return node;
    }
    case "audio": {
      const src = firstPositional ?? (attrs.src as string | undefined);
      if (!src) throw new Error("audio requires src");
      const node: DescriptiveAudio = {
        type: "audio",
        src,
        duration: attrs.duration as any,
        start: attrs.start as any,
        startFrom: attrs.startFrom as any,
        endAt: attrs.endAt as any,
        volume: attrs.volume as any,
        instruction: attrs.instruction as any,
        script: attrs.script as any,
      };
      return node;
    }
    case "component": {
      const componentName = firstPositional ?? (attrs.componentName as string | undefined);
      if (!componentName) throw new Error("component requires componentName");
      const node: DescriptiveComponent = {
        type: "component",
        componentName,
        duration: attrs.duration as any,
        start: attrs.start as any,
        props: attrs.props as any,
        src: attrs.src as any,
        instruction: attrs.instruction as any,
        script: attrs.script as any,
      };
      return node;
    }
    case "rhythm": {
      const src = firstPositional ?? (attrs.src as string | undefined);
      if (!src) throw new Error("rhythm requires src");
      const node: DescriptiveRhythm = {
        type: "rhythm",
        src,
        duration: attrs.duration as any,
        start: attrs.start as any,
        volume: attrs.volume as any,
        instruction: attrs.instruction as any,
        script: attrs.script as any,
      };
      return node;
    }
    case "include": {
      const src = firstPositional ?? (attrs.src as string | undefined);
      const node: DescriptiveInclude = {
        type: "include",
        src,
        duration: attrs.duration as any,
        start: attrs.start as any,
        volume: attrs.volume as any,
        instruction: attrs.instruction as any,
        script: attrs.script as any,
      };
      return node;
    }
    case "map": {
      const node: DescriptiveMap = {
        type: "map",
        waypoints: (attrs.waypoints as DescriptiveMapWaypoint[] | undefined) ?? [],
        duration: attrs.duration as any,
        start: attrs.start as any,
        routeMarker: attrs.routeMarker as any,
        travelMode: attrs.travelMode as any,
        instruction: attrs.instruction as any,
        script: attrs.script as any,
      };
      return node;
    }
    default:
      throw new Error(`unsupported node type: ${type}`);
  }
}

export function parseMarkdownDescriptive(markdown: string, options: MarkdownParseOptions = {}): DescriptiveRoot {
  const mode = options.mode ?? "strict";
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");

  const root: DescriptiveRoot = { children: [] };
  const sceneStack: Array<{ level: number; scene: DescriptiveScene }> = [];
  let bulletStack: Array<{ indent: number; parent: ParentNode }> = [{ indent: -1, parent: root }];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const line = raw.trimEnd();
    if (!line.trim()) continue;

    if (/^#\s+/.test(line)) {
      // top-level doc heading only; metadata handled by key lines.
      continue;
    }

    const heading = /^(#{2,6})\s+(.*)$/.exec(line.trim());
    if (heading) {
      const level = heading[1]!.length;
      const scene = parseHeaderScene(heading[0]!, mode);

      while (sceneStack.length && sceneStack[sceneStack.length - 1]!.level >= level) {
        sceneStack.pop();
      }

      const parentScene = sceneStack[sceneStack.length - 1]?.scene;
      if (parentScene) {
        parentScene.children.push(scene);
      } else {
        root.children.push(scene);
      }
      sceneStack.push({ level, scene });

      bulletStack = [{ indent: -1, parent: scene }];
      continue;
    }

    const bullet = /^(\s*)-\s+(.*)$/.exec(raw);
    if (bullet) {
      const indent = bullet[1]!.length;
      const content = bullet[2]!;

      while (bulletStack.length && bulletStack[bulletStack.length - 1]!.indent >= indent) {
        bulletStack.pop();
      }
      const parent = bulletStack[bulletStack.length - 1]?.parent ?? sceneStack[sceneStack.length - 1]?.scene ?? root;
      const node = parseNodeLine(content, mode);
      pushChild(parent, node);

      if (
        node.type === "scene" ||
        node.type === "series" ||
        node.type === "parallel" ||
        node.type === "transitionSeries" ||
        node.type === "effect" ||
        node.type === "include"
      ) {
        bulletStack.push({ indent, parent: node as ParentNode });
      }
      continue;
    }

    const tokens = splitTokens(line.trim());
    const attrs = parseKeyValueTokens(tokens, mode);

    // If we're inside a scene and haven't hit bullets yet, treat as scene metadata
    const currentScene = sceneStack[sceneStack.length - 1]?.scene;
    const inSceneContext = currentScene && bulletStack.length === 1 && bulletStack[0]!.indent === -1;
    if (inSceneContext && currentScene) {
      for (const [k, v] of Object.entries(attrs)) {
        switch (k) {
          case "layout":
            currentScene.layout = v as any;
            continue;
          case "transition":
            currentScene.transition = v as any;
            continue;
          case "transitionTime":
            currentScene.transitionTime = Number(v);
            continue;
          case "name":
            if (!currentScene.name) currentScene.name = String(v);
            continue;
          case "title":
            currentScene.title = String(v);
            continue;
          case "instruction":
            currentScene.instruction = String(v);
            continue;
          case "script":
            currentScene.script = String(v);
            continue;
          case "tts":
            currentScene.tts = v as any;
            continue;
        }
      }
      // Handle bare tokens (compatible mode: par, ts fade 0.4, "script text")
      if (mode === "compatible") {
        for (const token of tokens) {
          if (LAYOUT_VALUES.has(token as any) && !currentScene.layout) {
            currentScene.layout = mapLayout(token);
          } else if (TRANSITION_VALUES.has(token as any) && !currentScene.transition) {
            currentScene.transition = token as any;
          } else if (isQuoted(token) && !currentScene.script) {
            currentScene.script = unquote(token);
          }
        }
      }
      continue;
    }

    for (const [k, v] of Object.entries(attrs)) {
      switch (k) {
        case "width":
          root.width = Number(v);
          break;
        case "height":
          root.height = Number(v);
          break;
        case "fps":
          root.fps = Number(v);
          break;
        case "layout":
          root.layout = v as any;
          break;
        case "transition":
          root.transition = v as any;
          break;
        case "transitionTime":
          root.transitionTime = Number(v);
          break;

        case "script":
          (root as any).script = String(v);
          break;
        case "instruction":
          root.instruction = String(v);
          break;
        case "metadata":
          root.metadata = String(v);
          break;
        case "tts":
          root.tts = v as any;
          break;
        case "stt":
          root.stt = v as any;
          break;
        case "theme":
          root.theme = String(v);
          break;
        default:
          if (mode === "strict") throw new Error(`unknown root key: ${k}`);
      }
    }
  }

  return root;
}
