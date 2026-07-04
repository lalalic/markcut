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
  /** Deprecated — only strict mode is supported. */
  mode?: "strict";
}

type ParentNode = DescriptiveRoot | DescriptiveScene | DescriptiveContainer | DescriptiveEffect | DescriptiveInclude;

const LAYOUT_VALUES = new Set(["series", "parallel", "transitionSeries", "transition"] as const);
const TRANSITION_VALUES = new Set(["fade", "slide", "wipe", "flip", "clockWipe"] as const);

const TYPE_TOKENS: Record<string, string> = {
  image: "image",
  video: "video",
  audio: "audio",
  component: "component",
  rhythm: "rhythm",
  include: "include",
  effect: "effect",
  map: "map",
  series: "series",
  parallel: "parallel",
  transitionSeries: "transitionSeries",
};

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

function parseNumberMaybe(v: string): number | string | boolean {
  if (v === "true") return true;
  if (v === "false") return false;
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
 * Parse a JSON-like props/imports string into an object or array.
 * Handles unquoted keys and single-quoted strings.
 */
function parseProps(raw: string): unknown {
  const s = raw.trim();
  if (!s.startsWith("{") && !s.startsWith("[")) return {};
  if (!s.endsWith("}") && !s.endsWith("]")) return {};
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

function parseKeyValueTokens(tokens: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const token of tokens) {
    const idx = token.indexOf(":");
    if (idx > 0) {
      const key = token.slice(0, idx);
      const rawVal = token.slice(idx + 1);
      let val: unknown = unquote(rawVal);

      if (key === "layout") {
        const s = String(val);
        if (LAYOUT_VALUES.has(s as any)) {
          val = s;
        } else {
          throw new Error(`invalid layout value: ${s}`);
        }
      }
      if (key === "transition") {
        const s = String(val);
        if (!TRANSITION_VALUES.has(s as any)) {
          throw new Error(`invalid transition value: ${s}`);
        }
      }

      if (key === "waypoints") val = parseWaypoints(String(val));
      else if (key === "props" || key === "imports" || key === "components") val = parseProps(String(val));
      else if (key === "spots" || key === "customKeyframes") val = parseProps(String(val));
      else if (key !== "instruction" && key !== "script" && key !== "tts" && key !== "stt" && key !== "jsx") {
        val = parseNumberMaybe(String(val));
      }
      out[key] = val;
      continue;
    }

    throw new Error(`unrecognized token: ${token}`);
  }

  return out;
}

function parseHeaderScene(line: string): DescriptiveScene {
  const text = line.replace(/^#+\s*/, "").trim();
  const tokens = splitTokens(text);
  const nameToken = tokens.shift();
  const attrs = parseKeyValueTokens(tokens);

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
  if (!parent.children) parent.children = [];
  parent.children.push(child);
}

function parseNodeLine(content: string): DescriptiveNode {
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
    throw new Error(`missing or unknown node type: ${typeToken}`);
  }

  // Container bullets
  if (type === "series" || type === "parallel" || type === "transitionSeries") {
    const attrs = parseKeyValueTokens(tokens);
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
    const attrs = parseKeyValueTokens(tokens);
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

  const attrs = parseKeyValueTokens(tokens);

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
        visible: attrs.visible as any,
        isBackground: attrs.isBackground as any,
        style: attrs.style as any,
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
        playbackRate: attrs.playbackRate as any,
        width: attrs.width as any,
        height: attrs.height as any,
        instruction: attrs.instruction as any,
        script: attrs.script as any,
        visible: attrs.visible as any,
        isBackground: attrs.isBackground as any,
        style: attrs.style as any,
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
        foreground: attrs.foreground as any,
        loop: attrs.loop as any,
        instruction: attrs.instruction as any,
        script: attrs.script as any,
        visible: attrs.visible as any,
        isBackground: attrs.isBackground as any,
        style: attrs.style as any,
      };
      return node;
    }
    case "component": {
      const jsx = attrs.jsx as string | undefined;
      if (!jsx) throw new Error("component requires jsx usage expression (e.g. jsx:\"<ComA value={42} />\")");
      const node: DescriptiveComponent = {
        type: "component",
        jsx,
        duration: attrs.duration as any,
        start: attrs.start as any,
        instruction: attrs.instruction as any,
        script: attrs.script as any,
        visible: attrs.visible as any,
        isBackground: attrs.isBackground as any,
        style: attrs.style as any,
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
        spots: attrs.spots as any,
        instruction: attrs.instruction as any,
        script: attrs.script as any,
        visible: attrs.visible as any,
        isBackground: attrs.isBackground as any,
        style: attrs.style as any,
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
        visible: attrs.visible as any,
        isBackground: attrs.isBackground as any,
        style: attrs.style as any,
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
        routeColor: attrs.routeColor as any,
        routeWeight: attrs.routeWeight as any,
        zoom: attrs.zoom as any,
        center: attrs.center as any,
        mapType: attrs.mapType as any,
        instruction: attrs.instruction as any,
        script: attrs.script as any,
        visible: attrs.visible as any,
        isBackground: attrs.isBackground as any,
        style: attrs.style as any,
      };
      return node;
    }
    default:
      throw new Error(`unsupported node type: ${type}`);
  }
}

export function parseMarkdownDescriptive(markdown: string, _options: MarkdownParseOptions = {}): DescriptiveRoot {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");

  const root: DescriptiveRoot = { children: [] };

  // ── Frontmatter: `---\n...\n---\n` at the very top ──────────────────────
  // Supports root attrs (width, height, fps, tts, stt, etc.).
  // Imports go in ~~~js imports code blocks, not frontmatter.
  let startIdx = 0;
  while (startIdx < lines.length && lines[startIdx]!.trim() === "") startIdx++;
  if (lines[startIdx]?.trim() === "---") {
    const closeIdx = findFrontmatterClose(lines, startIdx + 1);
    if (closeIdx > startIdx) {
      const fm = parseFrontmatterBlock(lines.slice(startIdx + 1, closeIdx));
      if (fm.rootAttrs) applyRootAttrs(root, fm.rootAttrs);
      // Replace consumed lines with blanks so line indices stay stable
      for (let i = startIdx; i <= closeIdx; i++) lines[i] = "";
    }
  }

  const sceneStack: Array<{ level: number; scene: DescriptiveScene }> = [];
  let bulletStack: Array<{ indent: number; parent: ParentNode }> = [{ indent: -1, parent: root }];

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i]!;
    const line = raw.trimEnd();
    if (!line.trim()) { i++; continue; }

    // Fenced code block detection: ~~~js imports ... ~~~  or  ```js imports ... ```
    const fenceOpen = /^(~{3,}|`{3,})(\w*)\s*(.*)?$/.exec(line.trim());
    if (fenceOpen) {
      const fence = fenceOpen[1]!;
      const lang = (fenceOpen[2] ?? "").toLowerCase();
      const meta = (fenceOpen[3] ?? "").trim();
      // Find closing fence
      let j = i + 1;
      const buf: string[] = [];
      while (j < lines.length) {
        const candidate = lines[j]!;
        if (candidate.trim().startsWith(fence.charAt(0).repeat(fence.length))) break;
        buf.push(candidate);
        j++;
      }
      // Only ~~~js imports / ~~~imports blocks are recognized
      if ((lang === "js" && meta === "imports") || lang === "imports") {
        root.importsBlock = buf.join("\n");
      }
      // Skip past closing fence (or to end if none found)
      i = j < lines.length ? j + 1 : j;
      continue;
    }

    if (/^#\s+/.test(line)) {
      // top-level doc heading only; metadata handled by key lines.
      i++;
      continue;
    }

    const heading = /^(#{2,6})\s+(.*)$/.exec(line.trim());
    if (heading) {
      const level = heading[1]!.length;
      const scene = parseHeaderScene(heading[0]!);

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
      i++;
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
      const node = parseNodeLine(content);
      pushChild(parent, node);

      if (
        node.type === "scene" ||
        node.type === "series" ||
        node.type === "parallel" ||
        node.type === "transitionSeries" ||
        node.type === "effect" ||
        node.type === "include" ||
        node.type === "rhythm"
      ) {
        bulletStack.push({ indent, parent: node as ParentNode });
      }
      i++;
      continue;
    }

    const tokens = splitTokens(line.trim());
    const attrs = parseKeyValueTokens(tokens);

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

      i++;
      continue;
    }

    applyRootAttrs(root, attrs);
    i++;
  }

  return root;
}

/** Find the closing `---` of a frontmatter block starting at `startIdx + 1`. */
function findFrontmatterClose(lines: string[], startIdx: number): number {
  for (let i = startIdx; i < lines.length; i++) {
    if (lines[i]!.trim() === "---") return i;
  }
  return -1;
}

interface ParsedFrontmatter {
  rootAttrs?: Record<string, unknown>;
}

/**
 * Minimal YAML-ish frontmatter parser.
 * Supports scalar `key: value` lines (value may be JSON object/array).
 * Imports go in ~~~js imports code blocks, not frontmatter.
 *
 * Not a full YAML parser — deliberately small and forgiving.
 */
function parseFrontmatterBlock(body: string[]): ParsedFrontmatter {
  const out: ParsedFrontmatter = { rootAttrs: {} };
  let i = 0;
  while (i < body.length) {
    const raw = body[i]!;
    const line = raw.trim();
    if (!line) { i++; continue; }
    if (line.startsWith("#")) { i++; continue; }

    const m = /^([a-zA-Z_][a-zA-Z0-9_-]*)\s*:\s*(.*)$/.exec(line);
    if (!m) { i++; continue; }
    const key = m[1]!;
    const value = m[2]!.trim();

    if (!value) {
      // Multi-line map: collect indented `name: value` lines
      const map: Record<string, string> = {};
      let j = i + 1;
      while (j < body.length) {
        const sub = body[j]!;
        if (!sub.trim()) { j++; continue; }
        if (!/^\s+\S/.test(sub)) break;
        const trimmed = sub.trim();
        const sm = /^([^\s:]+)\s*:\s*(.*)$/.exec(trimmed);
        if (!sm) break;
        map[sm[1]!] = sm[2]!.trim();
        j++;
      }
      if (Object.keys(map).length) {
        out.rootAttrs![key] = map;
      }
      i = j - 1; // outer loop will increment
      i++;
      continue;
    }

    // Single-line value
    let parsed: unknown = value;
    if (value.startsWith("{") || value.startsWith("[")) {
      try { parsed = JSON.parse(value); } catch { /* keep as string */ }
    }
    out.rootAttrs![key] = parsed;
    i++;
  }
  return out;
}



/** Apply a key/value bag onto the DescriptiveRoot using the same rules as the body parser. */
function applyRootAttrs(root: DescriptiveRoot, attrs: Record<string, unknown>): void {
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
      default:
        throw new Error(`unknown root key: ${k}`);
    }
  }
}
