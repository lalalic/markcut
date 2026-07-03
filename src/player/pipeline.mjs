var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/utils/index.ts
function uid() {
  return Math.random().toString(36).slice(2, 10);
}
function walkDown(node, visit, parent = null, depth = 0) {
  const keep = visit(node, parent, depth);
  if (keep === false) return;
  if (Array.isArray(node.children)) {
    for (const c of node.children) walkDown(c, visit, node, depth + 1);
  }
}
var init_utils = __esm({
  "src/utils/index.ts"() {
    "use strict";
  }
});

// src/descriptive/compiler.ts
var compiler_exports = {};
__export(compiler_exports, {
  compileDescriptiveRoot: () => compileDescriptiveRoot
});
function isContainer(node) {
  return node.type === "series" || node.type === "parallel" || node.type === "transitionSeries";
}
function isScene(node) {
  return node.type === "scene";
}
function isInclude(node) {
  return node.type === "include";
}
function isEffect(node) {
  return node.type === "effect";
}
function isMap(node) {
  return node.type === "map";
}
function isRhythm(node) {
  return node.type === "rhythm";
}
function ensureUniqueIds(children, scopeId, mode) {
  const seen = /* @__PURE__ */ new Set();
  for (const child of children) {
    if (!child.id) continue;
    if (seen.has(child.id)) {
      if (mode === "strict") {
        throw new Error(`duplicate id "${child.id}" in container "${scopeId}"`);
      }
      continue;
    }
    seen.add(child.id);
  }
}
function deriveLeafDuration(node, ctx) {
  if (typeof node.duration === "number" && node.duration > 0) {
    return node.duration;
  }
  if ((node.type === "video" || node.type === "audio") && typeof node.endAt === "number") {
    const startFrom = node.startFrom ?? 0;
    const inferred = node.endAt - startFrom;
    if (inferred > 0) return inferred;
  }
  const fallback = ctx.defaults[node.type];
  if (ctx.mode === "draft") return fallback;
  throw new Error(`cannot resolve duration for node id="${node.id ?? "(missing)"}" type="${node.type}"`);
}
function compileLeaf(node, ctx, parentKind) {
  if (typeof node.start === "number" && parentKind !== "parallel") {
    if (ctx.mode === "strict") {
      throw new Error(`start is only allowed in parallel containers: id="${node.id ?? "(missing)"}"`);
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
    durationInSeconds: end
  };
  const action = {
    id: uid(),
    start,
    end,
    startFrom: node.type === "video" || node.type === "audio" ? node.startFrom : void 0,
    endAt: node.type === "video" || node.type === "audio" ? node.endAt : void 0,
    loop: node.type === "audio" ? node.loop : void 0,
    volume: node.type === "video" || node.type === "audio" || node.type === "rhythm" ? node.volume : void 0
  };
  switch (node.type) {
    case "video": {
      const stream = {
        ...base,
        type: "video",
        src: node.src,
        volume: node.volume ?? 1,
        playbackRate: node.playbackRate,
        width: node.width ?? 1080,
        height: node.height ?? 1920,
        actions: [action]
      };
      return { stream, duration: end };
    }
    case "audio": {
      const stream = {
        ...base,
        type: "audio",
        src: node.src,
        volume: node.volume ?? 1,
        foreground: node.foreground,
        actions: [action]
      };
      return { stream, duration: end };
    }
    case "image": {
      const stream = {
        ...base,
        type: "image",
        src: node.src,
        fit: node.fit ?? "contain",
        actions: [action]
      };
      return { stream, duration: end };
    }
    case "component": {
      const stream = {
        ...base,
        type: "component",
        componentName: node.componentName,
        src: node.src,
        props: node.props ?? {},
        actions: [action]
      };
      return { stream, duration: end };
    }
    case "rhythm": {
      const stream = {
        ...base,
        type: "rhythm",
        src: node.src,
        volume: node.volume ?? 1,
        spots: node.spots,
        children: [],
        actions: [action]
      };
      return { stream, duration: end };
    }
    case "map": {
      const stream = {
        ...base,
        type: "map",
        waypoints: node.waypoints,
        routeColor: node.routeColor ?? "#4285F4",
        routeWeight: node.routeWeight ?? 4,
        zoom: node.zoom ?? 10,
        center: node.center,
        mapType: node.mapType ?? "roadmap",
        travelMode: node.travelMode ?? "DRIVING",
        routeMarker: node.routeMarker ?? "\u{1F697}",
        actions: [action]
      };
      return { stream, duration: end };
    }
  }
}
function compileChildren(children, ctx, parentKind) {
  return children.filter((child) => child.visible !== false).map((child) => {
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
function aggregateDuration(children, kind, transitionTime) {
  if (kind === "parallel") {
    let max = 0;
    for (const child of children) max = Math.max(max, child.duration);
    return max;
  }
  let total = 0;
  const overlap = kind === "transitionSeries" ? transitionTime ?? 0.5 : 0;
  for (let i = 0; i < children.length; i++) {
    total += children[i].duration;
    if (i > 0 && overlap > 0) total -= overlap;
  }
  return total;
}
function compileScene(node, ctx, parentKind) {
  if (typeof node.start === "number" && parentKind !== "parallel" && ctx.mode === "strict") {
    throw new Error(`start is only allowed in parallel containers: id="${node.id ?? "(missing)"}"`);
  }
  const id = node.id ?? uid();
  ensureUniqueIds(node.children, id, ctx.mode);
  const sceneKind = node.layout ?? "parallel";
  const compiledChildren = compileChildren(node.children, ctx, sceneKind);
  const sceneChildren = sceneKind === "parallel" ? compiledChildren.map((c) => c.stream) : [
    {
      id: `${id}-layout`,
      type: "folder",
      visible: true,
      isSeries: true,
      transition: sceneKind === "transitionSeries" ? node.transition ?? "fade" : void 0,
      transitionTime: sceneKind === "transitionSeries" ? node.transitionTime ?? 0.5 : 0.5,
      children: compiledChildren.map((c) => c.stream),
      durationInSeconds: aggregateDuration(compiledChildren, sceneKind, node.transitionTime)
    }
  ];
  const sceneContentDuration = sceneKind === "parallel" ? aggregateDuration(compiledChildren, "parallel") : aggregateDuration(compiledChildren, sceneKind, node.transitionTime);
  const localDuration = Math.max(node.duration ?? 0, sceneContentDuration);
  const start = parentKind === "parallel" ? Math.max(0, node.start ?? 0) : 0;
  const end = start + localDuration;
  const stream = {
    id,
    type: "scene",
    name: node.name,
    title: node.title,
    instruction: node.instruction,
    style: node.style,
    visible: node.visible ?? true,
    isBackground: node.isBackground,
    children: sceneChildren,
    durationInSeconds: end
  };
  return { stream, duration: end };
}
function compileInclude(node, ctx, parentKind) {
  if (typeof node.start === "number" && parentKind !== "parallel" && ctx.mode === "strict") {
    throw new Error(`start is only allowed in parallel containers: id="${node.id ?? "(missing)"}"`);
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
    throw new Error(`cannot resolve duration for node id="${id}" type="include"`);
  }
  const end = start + duration;
  const stream = {
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
        end
      }
    ],
    durationInSeconds: end
  };
  return { stream, duration: end };
}
function compileEffect(node, ctx, parentKind) {
  if (typeof node.start === "number" && parentKind !== "parallel" && ctx.mode === "strict") {
    throw new Error(`start is only allowed in parallel containers: id="${node.id ?? "(missing)"}"`);
  }
  const id = node.id ?? uid();
  ensureUniqueIds(node.children, id, ctx.mode);
  const children = compileChildren(node.children, ctx, "parallel");
  const childrenDuration = aggregateDuration(children, "parallel");
  let duration = node.duration ?? 0;
  if (!duration) duration = childrenDuration;
  if (!duration && ctx.mode === "draft") duration = ctx.defaults.effect;
  if (!duration && ctx.mode === "strict") {
    throw new Error(`cannot resolve duration for node id="${id}" type="effect"`);
  }
  const start = parentKind === "parallel" ? Math.max(0, node.start ?? 0) : 0;
  const end = start + duration;
  const stream = {
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
        end
      }
    ],
    durationInSeconds: end
  };
  return { stream, duration: end };
}
function compileRhythm(node, ctx, parentKind) {
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
  const avgGap = spots.length > 1 ? (spots[spots.length - 1] - spots[0]) / (spots.length - 1) : 0;
  const rhythmDuration = spots.length ? spots[spots.length - 1] + avgGap : 0;
  const compiledChildren = [];
  if (children.length && spots.length) {
    const avgGap2 = spots.length > 1 ? (spots[spots.length - 1] - spots[0]) / (spots.length - 1) : 1;
    for (let i = 0; i < children.length; i++) {
      const beatStart = spots[Math.min(i, spots.length - 1)] ?? 0;
      const beatEnd = i < spots.length - 1 ? spots[i + 1] : beatStart + avgGap2;
      const beatDur = Math.max(0.1, beatEnd - beatStart);
      const childWithTiming = { ...children[i], start: beatStart, duration: beatDur };
      const compiled = isContainer(childWithTiming) ? compileContainer(childWithTiming, ctx, "parallel") : isScene(childWithTiming) ? compileScene(childWithTiming, ctx, "parallel") : isInclude(childWithTiming) ? compileInclude(childWithTiming, ctx, "parallel") : isEffect(childWithTiming) ? compileEffect(childWithTiming, ctx, "parallel") : isRhythm(childWithTiming) ? compileRhythm(childWithTiming, ctx, "parallel") : compileLeaf(childWithTiming, ctx, "parallel");
      compiledChildren.push(compiled.stream);
    }
  }
  const start = parentKind === "parallel" ? Math.max(0, node.start ?? 0) : 0;
  const end = start + rhythmDuration;
  const stream = {
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
        volume: node.volume
      }
    ],
    durationInSeconds: end
  };
  return { stream, duration: end };
}
function compileContainer(node, ctx, parentKind) {
  if (typeof node.start === "number" && parentKind !== "parallel") {
    if (ctx.mode === "strict") {
      throw new Error(`start is only allowed in parallel containers: id="${node.id ?? "(missing)"}"`);
    }
  }
  if (typeof node.start === "number") {
    if (ctx.mode === "strict") {
      throw new Error(`container start is unsupported in legacy compilation: id="${node.id ?? "(missing)"}"`);
    }
  }
  const id = node.id ?? uid();
  ensureUniqueIds(node.children, id, ctx.mode);
  const children = compileChildren(node.children, ctx, node.type);
  const duration = aggregateDuration(children, node.type, node.transitionTime);
  const stream = {
    id,
    type: "folder",
    style: node.style,
    visible: node.visible ?? true,
    isBackground: node.isBackground,
    isSeries: node.type !== "parallel",
    transition: node.type === "transitionSeries" ? node.transition ?? "fade" : void 0,
    transitionTime: node.type === "transitionSeries" ? node.transitionTime ?? 0.5 : 0.5,
    children: children.map((c) => c.stream),
    durationInSeconds: duration
  };
  return { stream, duration };
}
function compileDescriptiveRoot(input, options = {}) {
  const ctx = {
    mode: options.mode ?? "strict",
    defaults: {
      ...DEFAULTS,
      ...options.defaults ?? {}
    }
  };
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
    transition: rootKind === "transitionSeries" ? input.transition ?? "fade" : void 0,
    transitionTime: rootKind === "transitionSeries" ? input.transitionTime ?? 0.5 : 0.5,
    children: children.map((c) => c.stream),
    durationInSeconds: duration
  };
}
var DEFAULTS;
var init_compiler = __esm({
  "src/descriptive/compiler.ts"() {
    "use strict";
    init_utils();
    DEFAULTS = {
      image: 3,
      video: 3,
      audio: 3,
      component: 2,
      rhythm: 4,
      include: 3,
      map: 4,
      effect: 2
    };
  }
});

// src/player/pipeline.ts
init_compiler();

// src/descriptive/resolve.ts
import { execSync as execSync2 } from "node:child_process";
import { existsSync as existsSync2, mkdirSync as mkdirSync2, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve as resolvePath } from "node:path";

// src/render/tts.ts
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname } from "node:path";
var DEFAULT_CLI = 'edge-tts --voice "{voice}" --text "{text}" --write-media "{output}"';
function generateTTS(text, outputPath, options = {}) {
  mkdirSync(dirname(outputPath), { recursive: true });
  const cli = options.cli ?? DEFAULT_CLI;
  if (cli === "copy") {
    if (!options.refAudio) {
      console.warn("copy TTS mode requires refAudio path. Skipping.");
      return "";
    }
    if (!existsSync(options.refAudio)) {
      console.warn(`refAudio not found: ${options.refAudio}. Skipping.`);
      return "";
    }
    try {
      copyFileSync(options.refAudio, outputPath);
      return outputPath;
    } catch (e) {
      console.warn(`copy TTS failed: ${e.message}. Skipping.`);
      return "";
    }
  }
  const vars = {
    text,
    output: outputPath,
    voice: options.voice ?? "en-US-GuyNeural",
    rate: options.rate ?? "",
    refAudio: options.refAudio ?? "",
    ...options.options ?? {}
  };
  let cmd = cli;
  for (const [key, val] of Object.entries(vars)) {
    if (!val) continue;
    cmd = cmd.replaceAll(`{${key}}`, val);
  }
  try {
    execSync(cmd, { stdio: "pipe" });
  } catch (e) {
    console.warn(`TTS failed: ${e.message}.
Command: ${cmd}
Skipping voiceover.`);
    return "";
  }
  if (existsSync(outputPath)) return outputPath;
  const mp3Path = outputPath.replace(/\.wav$/, ".mp3");
  if (existsSync(mp3Path)) {
    try {
      execSync(`ffmpeg -y -i "${mp3Path}" "${outputPath}" 2>/dev/null`, { stdio: "pipe" });
      execSync(`rm "${mp3Path}"`, { stdio: "pipe" });
      return outputPath;
    } catch {
      return mp3Path;
    }
  }
  return "";
}

// src/descriptive/resolve.ts
init_utils();
function computeCacheKey(parts) {
  const json = JSON.stringify(parts);
  return createHash("sha1").update(json).digest("hex").slice(0, 12);
}
function readCacheManifest(outputDir) {
  const manifestPath = join(outputDir, ".cache.json");
  try {
    return JSON.parse(readFileSync(manifestPath, "utf-8"));
  } catch {
    return {};
  }
}
function writeCacheManifest(outputDir, manifest) {
  const manifestPath = join(outputDir, ".cache.json");
  try {
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
  } catch {
  }
}
function checkCache(manifest, key, cacheKey) {
  const entry = manifest[key];
  if (entry?.hash === cacheKey && entry.output && existsSync2(entry.output)) {
    return entry.output;
  }
  return null;
}
function updateCache(manifest, key, cacheKey, output) {
  manifest[key] = { hash: cacheKey, output };
}
function probeDuration(src, baseDir) {
  const absPath = resolveSrc(src, baseDir);
  try {
    const out = execSync2(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${absPath}"`,
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout: 1e4 }
    ).trim();
    const d = parseFloat(out);
    return Number.isFinite(d) && d > 0 ? d : null;
  } catch {
    return null;
  }
}
function resolveSrc(src, baseDir) {
  if (/^(https?:|file:|\/)/.test(src)) return src;
  return resolvePath(baseDir ?? process.cwd(), src);
}
async function resolveMediaDurations(root, options = {}) {
  const clone = JSON.parse(JSON.stringify(root));
  const baseDir = options.baseDir;
  walkDown(clone, (node) => {
    const n = node;
    if (n.type !== "video" && n.type !== "audio") return;
    if (typeof n.duration === "number" && n.duration > 0) return;
    if (typeof n.endAt === "number") return;
    if (!n.src) return;
    if (options.skip?.test(n.src)) return;
    const probed = probeDuration(n.src, baseDir);
    if (probed != null) {
      n.duration = probed;
      if (n.startFrom == null) n.startFrom = 0;
      if (n.endAt == null) n.endAt = probed;
    }
  });
  return clone;
}
var DEFAULT_WHISPER = "/Users/lir/Library/Python/3.9/bin/whisper";
function transcribeToVTT(audioPath, outputDir, whisperBin, model, language) {
  try {
    const modelFlag = model ? `--model ${model}` : "--model tiny";
    const langFlag = language ? `--language ${language}` : "--language en";
    execSync2(
      `"${whisperBin}" "${audioPath}" --output_format vtt --output_dir "${outputDir}" ${modelFlag} ${langFlag}`,
      { stdio: ["pipe", "pipe", "pipe"], timeout: 12e4 }
    );
    const base = audioPath.replace(/\.wav$/, "").replace(/\.mp3$/, "");
    const name = base.split("/").pop();
    const vttPath = join(outputDir, `${name}.vtt`);
    return existsSync2(vttPath) ? vttPath : null;
  } catch {
    return null;
  }
}
async function resolveScripts(root, options) {
  const clone = JSON.parse(JSON.stringify(root));
  mkdirSync2(options.outputDir, { recursive: true });
  const cache = readCacheManifest(options.outputDir);
  let cacheDirty = false;
  const allScenes = [];
  walkDown(clone, (node) => {
    if (node.type !== "scene") return;
    if (!node.script || typeof node.script !== "string") return;
    const existing = node.children ?? [];
    if (existing.some((c) => c.type === "audio")) return;
    const id = node.id ?? node.name ?? `scene-${allScenes.length}`;
    allScenes.push({ node, id });
  });
  function hasDescendantWithScript(node) {
    for (const child of node.children ?? []) {
      if (child.type === "scene" && child.script) return true;
      if (hasDescendantWithScript(child)) return true;
    }
    return false;
  }
  const toProcess = allScenes.filter(({ node }) => !hasDescendantWithScript(node));
  for (const { node, id } of toProcess) {
    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, "_");
    const audioPath = join(options.outputDir, `${safeId}.wav`);
    const sceneTts = node.tts ?? {};
    const rootTts = clone.tts ?? {};
    const ttsCli = sceneTts.cli ?? rootTts.cli ?? options.ttsCli;
    const ttsVoice = sceneTts.voice ?? rootTts.voice ?? options.voice;
    const ttsRate = sceneTts.rate ?? rootTts.rate ?? options.rate;
    const ttsRefAudio = sceneTts.refAudio ?? rootTts.refAudio ?? options.refAudio;
    const ttsOpts = { ...rootTts.options ?? {}, ...sceneTts.options ?? {}, ...options.ttsOptions ?? {} };
    const cacheKey = computeCacheKey({
      script: node.script,
      cli: ttsCli,
      voice: ttsVoice,
      rate: ttsRate,
      refAudio: ttsRefAudio,
      options: ttsOpts
    });
    const cached = checkCache(cache, `tts:${safeId}`, cacheKey);
    let generated;
    if (cached) {
      generated = cached;
    } else {
      generated = generateTTS(node.script, audioPath, {
        cli: ttsCli,
        voice: ttsVoice,
        rate: ttsRate,
        refAudio: ttsRefAudio,
        options: Object.keys(ttsOpts).length > 0 ? ttsOpts : void 0
      });
      if (generated) {
        updateCache(cache, `tts:${safeId}`, cacheKey, generated);
        cacheDirty = true;
      }
    }
    if (!generated) continue;
    if (!node.children) node.children = [];
    node.children.push({ type: "audio", src: generated, volume: 1 });
  }
  if (cacheDirty) writeCacheManifest(options.outputDir, cache);
  return clone;
}
async function resolveSubtitles(root, options) {
  const clone = JSON.parse(JSON.stringify(root));
  const whisperBin = options.whisperBin ?? DEFAULT_WHISPER;
  if (!existsSync2(whisperBin)) return clone;
  const rootStt = clone.stt ?? {};
  const sttModel = rootStt.model ?? options.sttModel;
  const sttLanguage = rootStt.language ?? options.sttLanguage;
  mkdirSync2(options.outputDir, { recursive: true });
  const cache = readCacheManifest(options.outputDir);
  let cacheDirty = false;
  const clips = [];
  function walkCompiled(node, parentOffset) {
    const start = node.actions?.[0]?.start ?? 0;
    const offset = parentOffset + start;
    if (node.type === "audio" && node.src) {
      clips.push({ audioSrc: node.src, offset });
    }
    for (const child of node.children ?? []) {
      walkCompiled(child, offset);
    }
  }
  for (const child of clone.children ?? []) walkCompiled(child, 0);
  const mergedLines = ["WEBVTT", ""];
  let cueIndex = 1;
  for (const { audioSrc, offset } of clips) {
    const audioHash = existsSync2(audioSrc) ? createHash("sha1").update(readFileSync(audioSrc)).digest("hex").slice(0, 12) : audioSrc;
    const sttCacheKey = computeCacheKey({ audioHash, model: sttModel, language: sttLanguage });
    const sttKey = `stt:${audioSrc.split("/").pop()}`;
    let vttPath = null;
    const cachedVtt = checkCache(cache, sttKey, sttCacheKey);
    if (cachedVtt) {
      vttPath = cachedVtt;
    } else {
      vttPath = transcribeToVTT(audioSrc, options.outputDir, whisperBin, sttModel, sttLanguage);
      if (vttPath) {
        updateCache(cache, sttKey, sttCacheKey, vttPath);
        cacheDirty = true;
      }
    }
    if (!vttPath || !existsSync2(vttPath)) continue;
    const vttText = readFileSync(vttPath, "utf-8");
    const blocks = vttText.replace(/\r\n/g, "\n").split(/\n\n+/);
    for (const block of blocks) {
      const lines = block.split("\n").filter(Boolean);
      const tline = lines.find((l) => l.includes("-->"));
      if (!tline) continue;
      const [a, z] = tline.split("-->").map((s) => s.trim());
      if (!a || !z) continue;
      const toSec = (ts) => {
        const parts = ts.split(":").map(Number);
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        return parts[0] * 60 + parts[1];
      };
      const formatSec = (s) => {
        const h = Math.floor(s / 3600);
        const m = Math.floor(s % 3600 / 60);
        const sec = (s % 60).toFixed(3).padStart(6, "0");
        return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${sec}`;
      };
      const text = lines.slice(lines.indexOf(tline) + 1).join("\n").trim();
      mergedLines.push(String(cueIndex++));
      mergedLines.push(`${formatSec(toSec(a) + offset)} --> ${formatSec(toSec(z) + offset)}`);
      mergedLines.push(text, "");
    }
  }
  if (cueIndex > 1) {
    const mergedPath = join(options.outputDir, "subtitles.vtt");
    writeFileSync(mergedPath, mergedLines.join("\n"), "utf-8");
    clone.subtitle = { src: mergedPath };
  }
  if (cacheDirty) writeCacheManifest(options.outputDir, cache);
  return clone;
}
async function resolveAll(root, options = {}) {
  let result = root;
  result = await resolveMediaDurations(result, {
    baseDir: options.baseDir,
    skip: options.skip
  });
  if (options.scriptOutputDir) {
    result = await resolveScripts(result, {
      outputDir: options.scriptOutputDir,
      ttsCli: options.ttsCli,
      voice: options.voice,
      rate: options.rate,
      refAudio: options.refAudio,
      ttsOptions: options.ttsOptions
    });
    result = await resolveMediaDurations(result, {
      baseDir: options.baseDir,
      skip: options.skip
    });
    if (options.whisperBin) {
      const { compileDescriptiveRoot: compileDescriptiveRoot2 } = await Promise.resolve().then(() => (init_compiler(), compiler_exports));
      const compiled = compileDescriptiveRoot2(result, { mode: "draft" });
      result = await resolveSubtitles(result, {
        outputDir: options.scriptOutputDir,
        whisperBin: options.whisperBin,
        sttModel: options.sttModel,
        sttLanguage: options.sttLanguage
      });
    }
  }
  return result;
}

// src/descriptive/markdown.ts
var LAYOUT_VALUES = /* @__PURE__ */ new Set(["ser", "par", "ts", "series", "parallel", "transitionSeries", "transition"]);
var TRANSITION_VALUES = /* @__PURE__ */ new Set(["fade", "slide", "wipe", "flip", "clockWipe"]);
var TYPE_TOKENS = {
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
  transition: "transitionSeries"
};
var KEY_ALIASES = {
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
  rm: "routeMarker"
};
function mapLayout(value) {
  if (value === "ser" || value === "series") return "series";
  if (value === "par" || value === "parallel") return "parallel";
  return "transitionSeries";
}
function isQuoted(token) {
  return token.length >= 2 && token.startsWith('"') && token.endsWith('"');
}
function unquote(token) {
  return isQuoted(token) ? token.slice(1, -1) : token;
}
function splitTokens(line) {
  const out = [];
  let cur = "";
  let quote = false;
  let depth = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
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
function parseNumberMaybe(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : v;
}
function parseWaypoints(raw) {
  const s = raw.trim();
  if (!s.startsWith("[") || !s.endsWith("]")) return [];
  const body = s.slice(1, -1).trim();
  if (!body) return [];
  return body.split(";").map((part) => {
    const bits = splitTokens(part.replace(/,/g, " "));
    const lat = Number(bits[0] ?? 0);
    const lng = Number(bits[1] ?? 0);
    const labelRaw = bits[2];
    const label = labelRaw ? unquote(labelRaw) : void 0;
    return { lat, lng, label };
  });
}
function inferTypeFromSrc(src) {
  const m = /\.([a-zA-Z0-9]+)(?:[?#].*)?$/.exec(src);
  const ext = m?.[1]?.toLowerCase();
  if (!ext) return null;
  if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) return "image";
  if (["mp4", "mov", "mkv", "webm"].includes(ext)) return "video";
  if (["mp3", "wav", "m4a", "aac", "flac"].includes(ext)) return "audio";
  if (ext === "vtt") return null;
  if (ext === "json") return "include";
  return null;
}
function parseKeyValueTokens(tokens, mode) {
  const out = {};
  let pendingTransition = false;
  for (const token of tokens) {
    const idx = token.indexOf(":");
    if (idx > 0) {
      const rawKey = token.slice(0, idx);
      const rawVal = token.slice(idx + 1);
      const key = KEY_ALIASES[rawKey] ?? rawKey;
      let val = unquote(rawVal);
      if (key === "layout") {
        const s = String(val);
        if (LAYOUT_VALUES.has(s)) {
          val = mapLayout(s);
        } else if (mode === "strict") {
          throw new Error(`invalid layout value: ${s}`);
        }
      }
      if (key === "transition") {
        const s = String(val);
        if (!TRANSITION_VALUES.has(s) && mode === "strict") {
          throw new Error(`invalid transition value: ${s}`);
        }
      }
      if (key === "waypoints") val = parseWaypoints(String(val));
      else if (key !== "theme" && key !== "instruction" && key !== "script" && key !== "props" && key !== "tts" && key !== "stt") {
        val = parseNumberMaybe(String(val));
      }
      out[key] = val;
      if (key === "transition") pendingTransition = true;
      continue;
    }
    if (mode === "compatible") {
      if (LAYOUT_VALUES.has(token) && out.layout == null) {
        out.layout = mapLayout(token);
        continue;
      }
      if (TRANSITION_VALUES.has(token) && out.transition == null) {
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
function parseHeaderScene(line, mode) {
  const text = line.replace(/^#+\s*/, "").trim();
  const tokens = splitTokens(text);
  const nameToken = tokens.shift();
  const attrs = parseKeyValueTokens(tokens, mode);
  let sceneName;
  let sceneTitle;
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
  sceneName = sceneName || (attrs.name ? String(attrs.name) : void 0);
  sceneTitle = sceneTitle || (attrs.title ? String(attrs.title) : void 0);
  return {
    type: "scene",
    name: sceneName,
    title: sceneTitle,
    instruction: attrs.instruction ? String(attrs.instruction) : void 0,
    script: attrs.script ? String(attrs.script) : void 0,
    layout: attrs.layout,
    transition: attrs.transition,
    transitionTime: attrs.transitionTime,
    children: []
  };
}
function pushChild(parent, child) {
  parent.children.push(child);
}
function parseNodeLine(content, mode) {
  const tokens = splitTokens(content);
  if (tokens.length === 0) throw new Error("empty node line");
  let typeToken = tokens[0];
  let type = TYPE_TOKENS[typeToken];
  if (type) tokens.shift();
  let firstPositional;
  if (type) {
    const t0 = tokens[0];
    if (t0 && t0.indexOf(":") === -1 && !LAYOUT_VALUES.has(t0) && !TRANSITION_VALUES.has(t0)) {
      firstPositional = t0;
      tokens.shift();
    }
  }
  if (!type) {
    firstPositional = tokens[0];
    if (firstPositional && firstPositional.indexOf(":") === -1 && !isQuoted(firstPositional) && !LAYOUT_VALUES.has(firstPositional)) {
      type = inferTypeFromSrc(firstPositional) ?? void 0;
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
  if (type === "series" || type === "parallel" || type === "transitionSeries") {
    const attrs2 = parseKeyValueTokens(tokens, mode);
    const node = {
      type,
      instruction: attrs2.instruction,
      script: attrs2.script,
      transition: attrs2.transition,
      transitionTime: attrs2.transitionTime,
      children: []
    };
    return node;
  }
  if (type === "effect") {
    const attrs2 = parseKeyValueTokens(tokens, mode);
    const node = {
      type: "effect",
      instruction: attrs2.instruction,
      script: attrs2.script,
      animation: attrs2.animation,
      animationTimingFunction: attrs2.animationTimingFunction,
      animationIterationCount: attrs2.animationIterationCount,
      customKeyframes: attrs2.customKeyframes,
      duration: attrs2.duration,
      start: attrs2.start,
      children: []
    };
    return node;
  }
  const attrs = parseKeyValueTokens(tokens, mode);
  if (mode === "compatible" && firstPositional && type && attrs.script == null && isQuoted(firstPositional)) {
    attrs.script = unquote(firstPositional);
  }
  switch (type) {
    case "image": {
      const src = firstPositional ?? attrs.src;
      if (!src) throw new Error("image requires src");
      const node = {
        type: "image",
        src,
        fit: attrs.fit,
        duration: attrs.duration,
        start: attrs.start,
        instruction: attrs.instruction,
        script: attrs.script
      };
      return node;
    }
    case "video": {
      const src = firstPositional ?? attrs.src;
      if (!src) throw new Error("video requires src");
      const node = {
        type: "video",
        src,
        duration: attrs.duration,
        start: attrs.start,
        startFrom: attrs.startFrom,
        endAt: attrs.endAt,
        volume: attrs.volume,
        instruction: attrs.instruction,
        script: attrs.script
      };
      return node;
    }
    case "audio": {
      const src = firstPositional ?? attrs.src;
      if (!src) throw new Error("audio requires src");
      const node = {
        type: "audio",
        src,
        duration: attrs.duration,
        start: attrs.start,
        startFrom: attrs.startFrom,
        endAt: attrs.endAt,
        volume: attrs.volume,
        instruction: attrs.instruction,
        script: attrs.script
      };
      return node;
    }
    case "component": {
      const componentName = firstPositional ?? attrs.componentName;
      if (!componentName) throw new Error("component requires componentName");
      const node = {
        type: "component",
        componentName,
        duration: attrs.duration,
        start: attrs.start,
        props: attrs.props,
        src: attrs.src,
        instruction: attrs.instruction,
        script: attrs.script
      };
      return node;
    }
    case "rhythm": {
      const src = firstPositional ?? attrs.src;
      if (!src) throw new Error("rhythm requires src");
      const node = {
        type: "rhythm",
        src,
        duration: attrs.duration,
        start: attrs.start,
        volume: attrs.volume,
        instruction: attrs.instruction,
        script: attrs.script
      };
      return node;
    }
    case "include": {
      const src = firstPositional ?? attrs.src;
      const node = {
        type: "include",
        src,
        duration: attrs.duration,
        start: attrs.start,
        volume: attrs.volume,
        instruction: attrs.instruction,
        script: attrs.script
      };
      return node;
    }
    case "map": {
      const node = {
        type: "map",
        waypoints: attrs.waypoints ?? [],
        duration: attrs.duration,
        start: attrs.start,
        routeMarker: attrs.routeMarker,
        travelMode: attrs.travelMode,
        instruction: attrs.instruction,
        script: attrs.script
      };
      return node;
    }
    default:
      throw new Error(`unsupported node type: ${type}`);
  }
}
function parseMarkdownDescriptive(markdown, options = {}) {
  const mode = options.mode ?? "strict";
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const root = { children: [] };
  const sceneStack = [];
  let bulletStack = [{ indent: -1, parent: root }];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    if (/^#\s+/.test(line)) {
      continue;
    }
    const heading = /^(#{2,6})\s+(.*)$/.exec(line.trim());
    if (heading) {
      const level = heading[1].length;
      const scene = parseHeaderScene(heading[0], mode);
      while (sceneStack.length && sceneStack[sceneStack.length - 1].level >= level) {
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
      const indent = bullet[1].length;
      const content = bullet[2];
      while (bulletStack.length && bulletStack[bulletStack.length - 1].indent >= indent) {
        bulletStack.pop();
      }
      const parent = bulletStack[bulletStack.length - 1]?.parent ?? sceneStack[sceneStack.length - 1]?.scene ?? root;
      const node = parseNodeLine(content, mode);
      pushChild(parent, node);
      if (node.type === "scene" || node.type === "series" || node.type === "parallel" || node.type === "transitionSeries" || node.type === "effect" || node.type === "include") {
        bulletStack.push({ indent, parent: node });
      }
      continue;
    }
    const tokens = splitTokens(line.trim());
    const attrs = parseKeyValueTokens(tokens, mode);
    const currentScene = sceneStack[sceneStack.length - 1]?.scene;
    const inSceneContext = currentScene && bulletStack.length === 1 && bulletStack[0].indent === -1;
    if (inSceneContext && currentScene) {
      for (const [k, v] of Object.entries(attrs)) {
        switch (k) {
          case "layout":
            currentScene.layout = v;
            continue;
          case "transition":
            currentScene.transition = v;
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
            currentScene.tts = v;
            continue;
        }
      }
      if (mode === "compatible") {
        for (const token of tokens) {
          if (LAYOUT_VALUES.has(token) && !currentScene.layout) {
            currentScene.layout = mapLayout(token);
          } else if (TRANSITION_VALUES.has(token) && !currentScene.transition) {
            currentScene.transition = token;
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
          root.layout = v;
          break;
        case "transition":
          root.transition = v;
          break;
        case "transitionTime":
          root.transitionTime = Number(v);
          break;
        case "script":
          root.script = String(v);
          break;
        case "tts":
          root.tts = v;
          break;
        case "stt":
          root.stt = v;
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

// src/player/pipeline.ts
function isDescriptiveRoot(data) {
  if (!data || typeof data !== "object") return false;
  if (data.layout || data.tts || data.stt) return true;
  const children = data.children ?? [];
  if (!Array.isArray(children)) return false;
  if (children.some(
    (c) => c?.type === "series" || c?.type === "parallel" || c?.type === "transitionSeries"
  )) return true;
  if (children.some(
    (c) => c?.type === "scene" && (c.layout || c.tts)
  )) return true;
  return false;
}
async function resolveAndCompile(data, options = {}) {
  const resolved = await resolveAll(data, {
    baseDir: options.baseDir,
    scriptOutputDir: options.scriptOutputDir,
    whisperBin: options.whisperBin,
    ttsCli: options.ttsCli,
    voice: options.voice,
    rate: options.rate,
    refAudio: options.refAudio,
    ttsOptions: options.ttsOptions,
    sttModel: options.sttModel,
    sttLanguage: options.sttLanguage
  });
  const compiled = compileDescriptiveRoot(resolved, {
    mode: options.mode ?? "draft"
  });
  return compiled;
}
async function resolveAndCompileMarkdown(markdown, options = {}) {
  const descriptive = parseMarkdownDescriptive(markdown, { mode: "compatible" });
  return resolveAndCompile(descriptive, options);
}
export {
  compileDescriptiveRoot,
  isDescriptiveRoot,
  parseMarkdownDescriptive,
  resolveAll,
  resolveAndCompile,
  resolveAndCompileMarkdown
};
