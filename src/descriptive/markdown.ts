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
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkFrontmatter from "remark-frontmatter";
import * as yaml from "js-yaml";

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
  script: "script",
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
    if (!quote && (ch === "{" || ch === "[" || ch === "(")) {
      depth++;
      cur += ch;
      continue;
    }
    if (!quote && (ch === "}" || ch === "]" || ch === ")")) {
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
    // Lenient parse: add quotes around unquoted keys and string values.
    // First pass: quote bare keys: {foo: → {"foo":
    let normalized = s.replace(
      /([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:(?=\s*["{[]?)/g,
      '$1"$2":',
    );
    // Second pass: quote bare string values that aren't numbers, booleans, or null
    // Matches :value followed by , } ] or end
    normalized = normalized.replace(
      /:\s*([a-zA-Z_$][a-zA-Z0-9_$.+-]*)\s*(?=[,}\]\s]|$)/g,
      (match, value: string) => {
        if (value === "true" || value === "false" || value === "null") return `: ${value}`;
        if (/^[+-]?\d+(\.\d+)?$/.test(value)) return `: ${value}`;
        return `: "${value}"`;
      },
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

/**
 * Parse an `on(when, code)` spec into an EventSpec object.
 * Positional arguments: first is the when value, second is the state code.
 * Example: on(start, slide1.current=1)
 */
function parseOnSpec(raw: string): { when: string; state: string } | undefined {
  const s = raw.trim();
  if (!s.startsWith("(") || !s.endsWith(")")) return undefined;
  const body = s.slice(1, -1).trim();
  if (!body) return undefined;

  const parts: string[] = [];
  let current = "";
  let depth = 0;
  let inQuote = false;

  for (let i = 0; i < body.length; i++) {
    const ch = body[i]!;
    if (ch === '"') { inQuote = !inQuote; current += ch; continue; }
    if (!inQuote) {
      if (ch === "(") { depth++; current += ch; continue; }
      if (ch === ")") { depth--; current += ch; continue; }
      if (ch === "," && depth === 0) {
        parts.push(current.trim());
        current = "";
        continue;
      }
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());

  if (parts.length >= 2) {
    return { when: parts[0]!, state: parts.slice(1).join(",") };
  }
  return undefined;
}

/**
 * Parse a markdown `effects=[...]` value into an array of EffectSpec strings.
 *
 * Supports:
 *   effects=[fadeIn]
 *   effects=[fadeIn, bounceIn]
 *   effects=[fadeIn(timingFunction:ease-out iterationCount:2)]
 *
 * Each element is kept as a string — the compiler's normalizeEffectSpec handles
 * parsing the paren-based params.
 */
function parseEffects(raw: string): string[] {
  const s = raw.trim();
  if (!s.startsWith("[") || !s.endsWith("]")) return [];
  const body = s.slice(1, -1).trim();
  if (!body) return [];

  const results: string[] = [];
  let current = "";
  let depth = 0;      // brackets
  let parenDepth = 0; // parens for params
  let inQuote = false;

  for (let i = 0; i < body.length; i++) {
    const ch = body[i]!;
    if (ch === '"') { inQuote = !inQuote; current += ch; continue; }
    if (!inQuote) {
      if (ch === "[" || ch === "{") { depth++; current += ch; continue; }
      if (ch === "]" || ch === "}") { depth = Math.max(0, depth - 1); current += ch; continue; }
      if (ch === "(") { parenDepth++; current += ch; continue; }
      if (ch === ")") { parenDepth = Math.max(0, parenDepth - 1); current += ch; continue; }
      if (ch === "," && depth === 0 && parenDepth === 0) {
        const trimmed = current.trim();
        if (trimmed) results.push(trimmed);
        current = "";
        continue;
      }
    }
    current += ch;
  }
  const trimmed = current.trim();
  if (trimmed) results.push(trimmed);

  return results;
}

function parseKeyValueTokens(tokens: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let i = 0;

  while (i < tokens.length) {
    const token = tokens[i]!;
    const idx = token.indexOf(":");
    if (idx > 0) {
      const key = token.slice(0, idx);
      let rawVal = token.slice(idx + 1);
      // If value after colon is empty, peek at next quoted token
      if (!rawVal && i + 1 < tokens.length) {
        const next = tokens[i + 1]!;
        if (isQuoted(next)) {
          rawVal = next;
          i++; // consume the next token
        }
      }
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
        // Support "name(time)" format e.g. "fade(0.5)" to merge transition + transitionTime
        const parenMatch = s.match(/^(\w+)\((\d+(?:\.\d+)?)\)$/);
        if (parenMatch) {
          const [, name, timeStr] = parenMatch;
          if (!TRANSITION_VALUES.has(name as any)) {
            throw new Error(`invalid transition value: ${name}`);
          }
          out["transition"] = name;
          out["transitionTime"] = Number(timeStr);
          i++;
          continue;
        }
        if (!TRANSITION_VALUES.has(s as any)) {
          throw new Error(`invalid transition value: ${s}`);
        }
      }

      if (key === "waypoints") val = parseWaypoints(String(val));
      else if (key === "props" || key === "imports" || key === "components") val = parseProps(String(val));
      else if (key === "spots" || key === "customKeyframes") val = parseProps(String(val));
      else if (key === "on") val = parseOnSpec(String(val));
      else if (key === "effects") val = parseEffects(String(val));
      else if (key !== "instruction" && key !== "tts" && key !== "stt" && key !== "jsx" && key !== "prompt") {
        const strVal = String(val);
        // If the value looks like an inline JSON object/array, parse it as props
        if (strVal.startsWith("{") || strVal.startsWith("[")) {
          val = parseProps(strVal);
        } else {
          val = parseNumberMaybe(strVal);
        }
      }
      out[key] = val;
      i++;
      continue;
    }

    // Support key(value) pattern (no colon), e.g. on(start, slide1.current=1)
    const funcMatch = token.match(/^(\w+)\(/);
    if (funcMatch) {
      const key = funcMatch[1]!;
      const rawVal = token.slice(key.length);
      let val: unknown = unquote(rawVal);

      if (key === "on") val = parseOnSpec(rawVal);
      else if (key === "effects") val = parseEffects(rawVal);
      else val = parseNumberMaybe(rawVal);

      out[key] = val;
      i++;
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
    id: attrs.id as any,
    name: sceneName,
    title: sceneTitle,
    instruction: attrs.instruction ? String(attrs.instruction) : undefined,
    layout: attrs.layout as any,
    transition: attrs.transition as any,
    transitionTime: attrs.transitionTime as any,
    on: attrs.on as any,
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
      // Quoted tokens are always positional values (even if they contain ':')
      (isQuoted(t0) || t0.indexOf(":") === -1) &&
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
      id: attrs.id as any,
      instruction: attrs.instruction as any,
      transition: attrs.transition as any,
      transitionTime: attrs.transitionTime as any,
      effects: attrs.effects as any,
      on: attrs.on as any,
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
      id: attrs.id as any,
      instruction: attrs.instruction as any,
      animation,
      animationTimingFunction: attrs.animationTimingFunction as any,
      animationIterationCount: attrs.animationIterationCount as any,
      customKeyframes: attrs.customKeyframes as any,
      duration: attrs.duration as any,
      start: attrs.start as any,
      effects: attrs.effects as any,
      on: attrs.on as any,
      children: [],
    };
    return node;
  }

  const attrs = parseKeyValueTokens(tokens);

  switch (type) {
    case "image": {
      const src = firstPositional ?? (attrs.src as string | undefined);
      const prompt = attrs.prompt as string | undefined;
      // src or prompt may be set later via indented property collection
      const node: DescriptiveImage = {
        type: "image",
        id: attrs.id as any,
        src,
        prompt,
        fit: attrs.fit as any,
        duration: attrs.duration as any,
        start: attrs.start as any,
        instruction: attrs.instruction as any,
        visible: attrs.visible as any,
        isBackground: attrs.isBackground as any,
        style: attrs.style as any,
        effects: attrs.effects as any,
        on: attrs.on as any,
      };
      return node;
    }
    case "video": {
      const src = firstPositional ?? (attrs.src as string | undefined);
      const prompt = attrs.prompt as string | undefined;
      // src or prompt may be set later via indented property collection
      const node: DescriptiveVideo = {
        type: "video",
        id: attrs.id as any,
        src,
        prompt,
        duration: attrs.duration as any,
        start: attrs.start as any,
        startFrom: attrs.startFrom as any,
        endAt: attrs.endAt as any,
        volume: attrs.volume as any,
        playbackRate: attrs.playbackRate as any,
        width: attrs.width as any,
        height: attrs.height as any,
        instruction: attrs.instruction as any,
        visible: attrs.visible as any,
        isBackground: attrs.isBackground as any,
        style: attrs.style as any,
        effects: attrs.effects as any,
        on: attrs.on as any,
      };
      return node;
    }
    case "audio": {
      const src = firstPositional ?? (attrs.src as string | undefined);
      if (!src) throw new Error("audio requires src");
      const node: DescriptiveAudio = {
        type: "audio",
        id: attrs.id as any,
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
        effects: attrs.effects as any,
        on: attrs.on as any,
      };
      return node;
    }
    case "component": {
      const jsx = attrs.jsx as string | undefined;
      // jsx may be set later via indented code fence property collection
      const node: DescriptiveComponent = {
        type: "component",
        id: attrs.id as any,
        jsx,
        duration: attrs.duration as any,
        start: attrs.start as any,
        instruction: attrs.instruction as any,
        visible: attrs.visible as any,
        isBackground: attrs.isBackground as any,
        style: attrs.style as any,
        effects: attrs.effects as any,
        on: attrs.on as any,
      };
      return node;
    }
    case "rhythm": {
      const src = firstPositional ?? (attrs.src as string | undefined);
      if (!src) throw new Error("rhythm requires src");
      const node: DescriptiveRhythm = {
        type: "rhythm",
        id: attrs.id as any,
        src,
        duration: attrs.duration as any,
        start: attrs.start as any,
        volume: attrs.volume as any,
        spots: attrs.spots as any,
        instruction: attrs.instruction as any,
        visible: attrs.visible as any,
        isBackground: attrs.isBackground as any,
        style: attrs.style as any,
        effects: attrs.effects as any,
        on: attrs.on as any,
      };
      return node;
    }
    case "include": {
      const src = firstPositional ?? (attrs.src as string | undefined);
      const node: DescriptiveInclude = {
        type: "include",
        id: attrs.id as any,
        src,
        duration: attrs.duration as any,
        start: attrs.start as any,
        volume: attrs.volume as any,
        instruction: attrs.instruction as any,
        visible: attrs.visible as any,
        isBackground: attrs.isBackground as any,
        style: attrs.style as any,
        effects: attrs.effects as any,
        on: attrs.on as any,
      };
      return node;
    }
    case "script": {
      const raw = firstPositional ?? (attrs.script ? String(attrs.script) : undefined);
      if (!raw) throw new Error("script requires text content");
      // Unquote if needed (standalone `- script "..."` preserves quotes in the token)
      const text = isQuoted(raw) ? unquote(raw) : raw;
      // Script is an alias for audio — creates an audio node with TTS-needed marker.
      // Supports standard audio keys: volume, start, duration, foreground, isBackground, style, etc.
      return {
        type: "audio",
        id: attrs.id as any,
        script: text,
        volume: (attrs.volume as number | undefined) ?? 1,
        start: attrs.start as any,
        duration: attrs.duration as any,
        foreground: attrs.foreground as any,
        isBackground: attrs.isBackground as any,
        style: attrs.style as any,
        visible: attrs.visible as any,
        effects: attrs.effects as any,
        on: attrs.on as any,
      } as any;
    }
    case "map": {
      const node: DescriptiveMap = {
        type: "map",
        id: attrs.id as any,
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
        visible: attrs.visible as any,
        isBackground: attrs.isBackground as any,
        style: attrs.style as any,
        effects: attrs.effects as any,
        on: attrs.on as any,
      };
      return node;
    }
    default:
      throw new Error(`unsupported node type: ${type}`);
  }
}

export function parseMarkdownDescriptive(markdown: string): DescriptiveRoot {
  const root: DescriptiveRoot = { children: [] };
  const lines = markdown.split("\n");

  // Use remark to parse the markdown into an MDAST tree for STRUCTURE only
  const mdast = unified()
    .use(remarkParse)
    .use(remarkFrontmatter)
    .parse(markdown);

  let sceneStack: Array<{ level: number; scene: DescriptiveScene }> = [];
  let inSceneMetadata = false;
  let currentScene: DescriptiveScene | null = null;

  for (const node of (mdast as any).children) {
    switch (node.type) {
      case "yaml": {
        try {
          const data = yaml.load(node.value) as Record<string, unknown>;
          if (data) applyRootAttrs(root, data);
        } catch {
          // Ignore invalid YAML
        }
        break;
      }
      case "heading": {
        if (node.depth === 1) {
          sceneStack = [];
          currentScene = null;
          inSceneMetadata = false;
        } else {
          // Extract heading text from the raw source line (skip '##' prefix)
          const lineText = rawTextAtNode(lines, node);
          const headingContent = lineText.replace(/^#+\s*/, "");
          const scene = parseHeaderScene(headingContent);

          while (sceneStack.length && sceneStack[sceneStack.length - 1]!.level >= node.depth) {
            sceneStack.pop();
          }
          const parentScene = sceneStack[sceneStack.length - 1]?.scene;
          if (parentScene) {
            parentScene.children.push(scene);
          } else {
            root.children.push(scene);
          }
          sceneStack.push({ level: node.depth, scene });
          currentScene = scene;
          inSceneMetadata = true;
        }
        break;
      }
      case "paragraph": {
        const text = rawTextAtNode(lines, node);
        if (!text.trim()) break;

        const tokens = splitTokens(text);
        const attrs = parseKeyValueTokens(tokens);

        if (inSceneMetadata && currentScene) {
          applySceneMetadata(currentScene, attrs);
        } else {
          applyRootAttrs(root, attrs);
        }
        break;
      }
      case "list": {
        inSceneMetadata = false;
        if (!node.ordered) {
          const parent: ParentNode = currentScene ?? root;
          for (const item of node.children) {
            processMDASTListItem(item, parent, lines);
          }
        }
        break;
      }
      case "code": {
        const lang = (node.lang ?? "").toLowerCase();
        const meta = (node.meta ?? "").trim();
        if ((lang === "js" && meta === "imports") || lang === "imports") {
          root.importsBlock = node.value;
        } else if (meta === "stylesheet") {
          root.stylesheet = node.value;
        }
        break;
      }
    }
  }

  return root;
}

/** Extract raw text from an MDAST node using source line positions. */
function rawTextAtNode(lines: string[], node: any): string {
  const startLine = node.position.start.line - 1; // 0-based
  const endLine = node.position.end.line - 1;
  const startCol = node.position.start.column - 1; // 0-based
  const endCol = node.position.end.column;

  if (startLine === endLine) {
    // Single line: extract substring
    const line = lines[startLine] ?? "";
    return line.slice(startCol, endCol).trim();
  }

  // Multi-line: join lines
  const parts: string[] = [];
  for (let l = startLine; l <= endLine; l++) {
    const line = lines[l] ?? "";
    if (l === startLine) {
      parts.push(line.slice(startCol));
    } else if (l === endLine) {
      parts.push(line.slice(0, endCol));
    } else {
      parts.push(line);
    }
  }
  return parts.join("\n").trim();
}

/**
 * Recursively process an MDAST listItem and add the resulting node to `parent`.
 * Uses raw source lines for text content to preserve JSX/HTML.
 */
function processMDASTListItem(item: any, parent: ParentNode, lines: string[]): void {
  const children = item.children ?? [];
  if (!children.length) return;

  // Find the first paragraph (the "node line")
  const firstPara = children.find((c: any) => c.type === "paragraph");
  if (!firstPara) return;

  // Use raw source text to preserve JSX values with angle brackets
  const text = rawTextAtNode(lines, firstPara);
  if (!text.trim()) return;

  const node = parseNodeLine(text);
  pushChild(parent, node);

  // Process remaining children (code blocks as properties, extra paragraphs as properties, nested lists as sub-children)
  for (const child of children) {
    if (child === firstPara) continue;

    if (child.type === "code") {
      const propName = (child.meta ?? "").trim() || (child.lang ?? "").toLowerCase() || "jsx";
      (node as any)[propName] = child.value;
    } else if (child.type === "paragraph") {
      const extraText = rawTextAtNode(lines, child);
      if (extraText.trim()) {
        const tokens = splitTokens(extraText);
        const attrs = parseKeyValueTokens(tokens);
        Object.assign(node, attrs);
      }
    } else if (child.type === "list") {
      if (
        node.type === "series" ||
        node.type === "parallel" ||
        node.type === "transitionSeries" ||
        node.type === "effect" ||
        node.type === "include" ||
        node.type === "rhythm"
      ) {
        for (const subItem of child.children) {
          processMDASTListItem(subItem, node as ParentNode, lines);
        }
      }
    }
  }

}

/** Apply key/value attrs to a scene node (subset of root attrs). */
function applySceneMetadata(scene: DescriptiveScene, attrs: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(attrs)) {
    switch (k) {
      case "layout":
        scene.layout = v as any;
        break;
      case "transition":
        scene.transition = v as any;
        break;
      case "transitionTime":
        scene.transitionTime = Number(v);
        break;
      case "name":
        if (!scene.name) scene.name = String(v);
        break;
      case "title":
        scene.title = String(v);
        break;
      case "instruction":
        scene.instruction = String(v);
        break;
      case "script":
        // script key on scenes is no longer supported — ignored
        break;
      case "tts":
        scene.tts = v as any;
        break;
      case "on":
        scene.on = v as any;
        break;
    }
  }
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
        // script key on root is no longer supported — ignored
        break;
      case "instruction":
        root.instruction = String(v);
        break;
      case "metadata":
        root.metadata = String(v);
        break;
      case "stylesheet":
        root.stylesheet = String(v);
        break;
      case "title":
      case "description":
        // Metadata fields — store as instruction for now
        root.instruction = root.instruction ?? String(v);
        break;
      case "tts":
        root.tts = typeof v === "object" && v !== null ? String((v as any).cli ?? "") : String(v);
        break;
      case "stt":
        root.stt = typeof v === "object" && v !== null ? String((v as any).cli ?? "") : String(v);
        break;
      case "tti":
        root.tti = typeof v === "object" && v !== null ? String((v as any).cli ?? "") : String(v);
        break;
      case "ttv":
        root.ttv = typeof v === "object" && v !== null ? String((v as any).cli ?? "") : String(v);
        break;
      case "subtitle": {
        if (typeof v === "string") {
          root.subtitle = { src: v };
        } else if (v && typeof v === "object") {
          const obj = v as Record<string, unknown>;
          root.subtitle = {} as any;
          if (typeof obj.src === "string") root.subtitle.src = obj.src;
          if (typeof obj.type === "string") root.subtitle.type = obj.type;
          if (typeof obj.style === "string") root.subtitle.style = obj.style;
          if (obj.fontSize != null) root.subtitle.fontSize = obj.fontSize;
          if (typeof obj.fontFamily === "string") root.subtitle.fontFamily = obj.fontFamily;
          if (typeof obj.fontStyle === "string") root.subtitle.fontStyle = obj.fontStyle;
        }
        break;
      }
      default:
        throw new Error(`unknown root key: ${k}`);
    }
  }
}
