import type {
  DescriptiveAudio,
  DescriptiveComponent,
  DescriptiveContainer,
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
import {
  DslError,
  LAYOUT_VALUES,
  TRANSITION_VALUES,
  isQuoted,
  unquote,
  splitTokens,
  parseKeyValueTokens,
} from "./dsl";
import type { ParseContext } from "./dsl";

type ParentNode = DescriptiveRoot | DescriptiveScene | DescriptiveContainer | DescriptiveInclude;

/** Re-export so existing deep imports keep working. */
export { DslError };
export type { ParseContext };

const TYPE_TOKENS: Record<string, string> = {
  image: "image",
  video: "video",
  audio: "audio",
  component: "component",
  rhythm: "rhythm",
  include: "include",
  map: "map",
  script: "script",
  series: "series",
  parallel: "parallel",
  transitionSeries: "transitionSeries",
};

function parseHeaderScene(line: string, lineNum?: number): DescriptiveScene {
  const text = line.replace(/^#+\s*/, "").trim();
  const tokens = splitTokens(text);
  const nameToken = tokens.shift();
  const attrs = parseKeyValueTokens(tokens, lineNum ? { line: lineNum, lineText: line } : undefined);

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

/**
 * Copy any attrs that aren't standard leaf-node keys onto the node.
 * These are variant overrides like `zh`, `portrait-src`, etc.
 */
function preserveVariantAttrs(node: Record<string, unknown>, attrs: Record<string, unknown>): void {
  // Standard keys consumed by leaf node types — anything else is a variant override
  const STANDARD = new Set([
    "type", "id", "src", "script", "jsx", "volume", "playbackRate",
    "start", "duration", "startFrom", "endAt", "loop", "width", "height", "fit",
    "foreground", "visible", "isBackground", "instruction", "style", "effects", "on",
    "spots", "waypoints", "routeColor", "routeWeight", "routeMarker",
    "travelMode", "zoom", "center", "mapType", "data", "prompt",
    "name", "title", "transition", "transitionTime", "layout",
    "componentName", "props", "speaker",
  ]);
  for (const [k, v] of Object.entries(attrs)) {
    if (!STANDARD.has(k)) {
      (node as any)[k] = v;
    }
  }
}

function parseNodeLine(content: string, lineNum?: number): DescriptiveNode {
  const ctx: ParseContext | undefined = lineNum ? { line: lineNum, lineText: content } : undefined;
  const tokens = splitTokens(content);
  if (tokens.length === 0) throw new DslError("empty node line", ctx);

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
    throw new DslError(`missing or unknown node type: ${typeToken}`, { ...ctx, token: typeToken });
  }

  // Container bullets
  if (type === "series" || type === "parallel" || type === "transitionSeries") {
    const attrs = parseKeyValueTokens(tokens, ctx);
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

  const attrs = parseKeyValueTokens(tokens, ctx);

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
      preserveVariantAttrs(node, attrs);
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
      preserveVariantAttrs(node, attrs);
      return node;
    }
    case "audio": {
      const src = firstPositional ?? (attrs.src as string | undefined);
      if (!src) throw new DslError("audio requires src", ctx);
      const node: DescriptiveAudio = {
        type: "audio",
        id: attrs.id as any,
        src,
        speaker: attrs.speaker as string | undefined,
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
      preserveVariantAttrs(node, attrs);
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
      preserveVariantAttrs(node, attrs);
      return node;
    }
    case "rhythm": {
      const src = firstPositional ?? (attrs.src as string | undefined);
      if (!src) throw new DslError("rhythm requires src", ctx);
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
      preserveVariantAttrs(node, attrs);
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
      // Text may be empty — ~~~script code fence will provide it later
      const text = raw ? (isQuoted(raw) ? unquote(raw) : raw) : undefined;
      // Script is an alias for audio — creates an audio node with TTS-needed marker.
      const scriptNode: any = {
        type: "audio",
        id: attrs.id as any,
        script: text,
        speaker: attrs.speaker as string | undefined,
        volume: (attrs.volume as number | undefined) ?? 1,
        start: attrs.start as any,
        duration: attrs.duration as any,
        foreground: attrs.foreground as any,
        isBackground: attrs.isBackground as any,
        style: attrs.style as any,
        visible: attrs.visible as any,
        effects: attrs.effects as any,
        on: attrs.on as any,
      };
      preserveVariantAttrs(scriptNode, attrs);
      return scriptNode;
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
      preserveVariantAttrs(node, attrs);
      return node;
    }
    default:
      throw new DslError(`unsupported node type: ${type}`, { ...ctx, token: type });
  }
}

/**
 * Parse result with variant support.
 *
 * `# video` defines the base root (config + scenes).
 * Each subsequent `# <name>` defines a variant with root config overrides only.
 * Variant names become keys for `<variant>-<key>` overrides on leaf nodes.
 */
export interface VariantParseResult {
  /** Base root — the `# video` section. Contains all scenes. */
  base: DescriptiveRoot;
  /** Named variants — keyed by heading text, each with root config overrides. */
  variants: Map<string, Partial<DescriptiveRoot>>;
}

/**
 * Backward-compatible: parses markdown and returns only the base `# video` root.
 * Equivalent to `parseMarkdownVariants(md).base`.
 */
export function parseMarkdownDescriptive(markdown: string): DescriptiveRoot {
  return internalParse(markdown).base;
}

/**
 * Full variant-aware parse. Returns the base root + all variant configs.
 */
export function parseMarkdownVariants(markdown: string): VariantParseResult {
  return internalParse(markdown);
}

/** Shared internal implementation */
function internalParse(markdown: string): VariantParseResult {
  const base: DescriptiveRoot = { children: [] };
  const variants: Map<string, Partial<DescriptiveRoot>> = new Map();
  let activeVariant: string | null = null;
  const lines = markdown.split("\n");

  // Use remark to parse the markdown into an MDAST tree for STRUCTURE only
  const mdast = unified()
    .use(remarkParse)
    .use(remarkFrontmatter)
    .parse(markdown);

  let sceneStack: Array<{ level: number; scene: DescriptiveScene }> = [];
  let inSceneMetadata = false;
  let currentScene: DescriptiveScene | null = null;

  // Get the target root for current state: base or variant
  function targetRoot(): DescriptiveRoot {
    if (activeVariant && variants.has(activeVariant)) {
      const v = variants.get(activeVariant)!;
      if (!v.children) v.children = [];
      return v as DescriptiveRoot;
    }
    return base;
  }

  for (const node of (mdast as any).children) {
    switch (node.type) {
      case "yaml": {
        // Frontmatter is metadata only — does not affect video config.
        break;
      }
      case "heading": {
        if (node.depth === 1) {
          sceneStack = [];
          currentScene = null;
          inSceneMetadata = false;

          // Extract heading text as variant name
          const lineText = rawTextAtNode(lines, node);
          const variantName = lineText.replace(/^#+\s*/, "").trim().split(/\s+/)[0]!;

          if (variantName && variantName !== "video") {
            // This is a named variant — create root config holder
            activeVariant = variantName;
            if (!variants.has(variantName)) {
              variants.set(variantName, { children: [] });
            }
          } else {
            // "video" or unnamed h1 — back to base
            activeVariant = null;
          }
        } else {
          // Extract heading text from the raw source line (skip '##' prefix)
          const lineText = rawTextAtNode(lines, node);
          const headingContent = lineText.replace(/^#+\s*/, "");
          const scene = parseHeaderScene(headingContent, node.position?.start?.line);

          while (sceneStack.length && sceneStack[sceneStack.length - 1]!.level >= node.depth) {
            sceneStack.pop();
          }
          const parentScene = sceneStack[sceneStack.length - 1]?.scene;
          if (parentScene) {
            parentScene.children.push(scene);
          } else {
            targetRoot().children.push(scene);
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
        const attrs = parseKeyValueTokens(
          tokens,
          node.position?.start?.line ? { line: node.position.start.line, lineText: text } : undefined,
        );

        if (inSceneMetadata && currentScene) {
          applySceneMetadata(currentScene, attrs);
        } else {
          applyRootAttrs(targetRoot(), attrs);
        }
        break;
      }
      case "list": {
        inSceneMetadata = false;
        if (!node.ordered) {
          const parent: ParentNode = currentScene ?? targetRoot();
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
          targetRoot().importsBlock = node.value;
        } else if (meta === "stylesheet") {
          targetRoot().stylesheet = node.value;
        }
        break;
      }
    }
  }

  return { base, variants };
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

  const node = parseNodeLine(text, firstPara.position?.start?.line);
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
        const attrs = parseKeyValueTokens(
          tokens,
          child.position?.start?.line ? { line: child.position.start.line, lineText: extraText } : undefined,
        );
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
      case "seed":
        root.seed = Number(v);
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
      case "voices":
        root.voices = v as Record<string, string>;
        break;
      default:
        throw new Error(`unknown root key: ${k}`);
    }
  }
}
