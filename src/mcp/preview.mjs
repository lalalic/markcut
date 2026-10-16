import { createHash } from "node:crypto";
import { mkdir, writeFile, readdir, rename, rm, stat, utimes } from "node:fs/promises";
import { access, readFile } from "node:fs/promises";
import { constants as fsConstants, readFileSync } from "node:fs";
import { isAbsolute, extname, dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPreviewBridgeScript } from "./bridge.mjs";
import { externalizePreviewMedia, publicOrigin, resolveMountedFile, resolvePreviewPath, publishPlayerBundle, publishCompiledCache, prunePublishedCache, EXPORT_ROOT } from "./remote-assets.mjs";

export const TOOL_NAME = "markcut.preview";
export const RESOURCE_URI = "ui://markcut/video-preview-v22.html";
// Legacy entrypoints remain registered, but serve the current implementation.
export const LEGACY_RESOURCE_URIS = [
  "ui://markcut/video-preview-v3.html",
  "ui://markcut/video-preview-v4.html",
  "ui://markcut/video-preview-v5.html",
  "ui://markcut/video-preview-v6.html",
  "ui://markcut/video-preview-v7.html",
  "ui://markcut/video-preview-v8.html",
  "ui://markcut/video-preview-v9.html",
  "ui://markcut/video-preview-v10.html",
  "ui://markcut/video-preview-v11.html",
  "ui://markcut/video-preview-v12.html",
  "ui://markcut/video-preview-v13.html",
  "ui://markcut/video-preview-v14.html",
  "ui://markcut/video-preview-v15.html",
  "ui://markcut/video-preview-v16.html",
  "ui://markcut/video-preview-v17.html",
  "ui://markcut/video-preview-v18.html",
  "ui://markcut/video-preview-v19.html",
  "ui://markcut/video-preview-v20.html",
  "ui://markcut/video-preview-v21.html",
];
export const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";
// Google Maps JS loads libraries, tiles and Routes RPCs from these HTTPS origins.
// The MCP app sandbox enforces the declared domains; native localhost does not.
export const MAPS_CSP_DOMAINS = Object.freeze([
  "https://maps.googleapis.com",
  "https://maps.gstatic.com",
  "https://maps-api-v3.googleapis.com",
  "https://routes.googleapis.com",
]);
export function previewCsp() {
  return {
    connectDomains: [publicOrigin(), ...MAPS_CSP_DOMAINS],
    resourceDomains: [publicOrigin(), ...MAPS_CSP_DOMAINS],
    frameDomains: [],
  };
}
const moduleDir = dirname(fileURLToPath(import.meta.url));
const bundlePath = resolve(moduleDir,"remotion-app.bundle.js");
const pendingCompiles = new Map();
const activeCompilesByPath = new Map();
const KEEP = 10;

export function getPreviewMedia(contentHash) {
  if (!/^[a-f0-9]{64}$/.test(contentHash)) throw new Error("Invalid Markcut content hash");
  try {
    return {compiled:JSON.parse(readFileSync(resolve(EXPORT_ROOT,"cache",contentHash+".json"),"utf8"))};
  } catch {throw new Error("Unknown or expired Markcut compiled scenes");}
}

export function previewResourceUri(contentHash) {
  return `${RESOURCE_URI}/${contentHash}`;
}

export function buildPreviewResourceResult(resourceUri = RESOURCE_URI) {
  return {
    ttlMs: 0,
    cacheScope: "private",
    contents: [{
      uri: resourceUri,
      mimeType: RESOURCE_MIME_TYPE,
      text: buildPreviewHtml(),
      _meta: {
        ui: {
          prefersBorder: true,
          csp: previewCsp(),
        },
      },
    }],
  };
}

export function validateMarkdownPath(value) {
  if (typeof value !== "string" || !isAbsolute(value)) {
    throw new Error("path must be an absolute filesystem path");
  }
  if (extname(value).toLowerCase() !== ".md") {
    throw new Error("path must point to a Markdown file (.md)");
  }
  return value;
}

export async function readPreviewAudio(path) {
  const markdown = await readFile(path, "utf8");
  const match = markdown.match(/^audio:\s*([^\r\n]+)\s*$/m);
  const filename = match ? match[1].trim() : `${basename(path, ".md")}.wav`;
  if (!/^[\w. -]+\.(wav|mp3|m4a|ogg)$/i.test(filename) || filename.startsWith(".")) throw new Error("audio must be a local audio filename in the Markdown directory");
  const file = resolve(dirname(path), filename);
  try { await access(file, fsConstants.R_OK); } catch (e) { if (!match && e.code === "ENOENT") return {}; throw e; }
  const remote = resolveMountedFile(file);
  if (remote) return {audioSrc: file}; // Freeze mounted local audio into this immutable preview.
  const data = await readFile(file);
  if (data.length > 2 * 1024 * 1024) throw new Error("audio file exceeds 2 MB preview limit for unmounted media");
  const ext = filename.split(".").pop().toLowerCase();
  const mime = {wav:"audio/wav",mp3:"audio/mpeg",m4a:"audio/mp4",ogg:"audio/ogg"}[ext];
  return {audioSrc:`data:${mime};base64,${data.toString("base64")}`};
}

export function withPreviewAudio(compiled, audioSrc) {
  if (!audioSrc) return compiled;
  const root = compiled.root || compiled;
  const children = root.children || [];
  const duration = root.durationInSeconds || children.filter(child=>!child.isBackground).reduce((sum,child)=>sum+(child.durationInSeconds||child.duration||0),0);
  if (!duration) throw new Error('compiled preview has no duration for audio track');
  return {...compiled, ...(compiled.root ? {root:{...root,children:[...children,{id:'mcp-preview-audio',type:'audio',src:audioSrc,volume:1,isBackground:true,start:0,end:duration,duration,durationInSeconds:duration}]}} : {children:[...children,{id:'mcp-preview-audio',type:'audio',src:audioSrc,volume:1,isBackground:true,start:0,end:duration,duration,durationInSeconds:duration}]})};
}

async function atomicJson(path, value) {
  const temp = path + "." + process.pid + "." + Math.random().toString(16).slice(2) + ".tmp";
  await writeFile(temp, JSON.stringify(value, null, 2), {flag:"wx"});
  try { await rename(temp, path); }
  finally { await rm(temp, {force:true}); }
}

async function pruneCache(dir, indexFile, entries, currentHash) {
  const unique=[currentHash,...entries.filter(hash=>hash!==currentHash)];
  const kept=unique.slice(0,KEEP);
  const retired=unique.slice(KEEP);
  const index={latest:currentHash, entries:kept};
  await atomicJson(indexFile,index);
  // Only prune local entries that are not used by another variant index.
  for(const hash of retired) {
    const siblings=await readdir(resolve(dir,".."),{withFileTypes:true});
    let referenced=false;
    for(const folder of siblings) {
      if(!folder.isDirectory() || folder.name==="cache" || folder.name==="generated")continue;
      const variants=await readdir(resolve(dir,"..",folder.name),{withFileTypes:true}).catch(()=>[]);
      for(const variant of variants) {
        if(!variant.isDirectory())continue;
        const data=await readFile(resolve(dir,"..",folder.name,variant.name,"cache-index.json"),"utf8").catch(()=>"");
        try {if(JSON.parse(data).entries?.includes(hash))referenced=true;} catch{}
      }
    }
    if(!referenced){
      await rm(resolve(dir,hash+".json"),{force:true});
      await prunePublishedCache(hash);
    }
  }
}

export async function ensureVideoPreview(path, options = {}) {
  const validatedPath = validateMarkdownPath(resolvePreviewPath(path));
  await access(validatedPath, fsConstants.R_OK);
  const source=await readFile(validatedPath,"utf8");
  const sourceHash=createHash("sha256").update(source).digest("hex");
  const key=validatedPath+"\0"+sourceHash;
  if(pendingCompiles.has(key))return pendingCompiles.get(key);
  const prior=activeCompilesByPath.get(validatedPath)||Promise.resolve();
  const task=prior.catch(()=>{}).then(async()=>{
    const {parseMarkdownDescriptive,resolveAll,compileDescriptiveRoot}=await import("../player/pipeline.mjs");
    const report=typeof options.onProgress==="function" ? options.onProgress : ()=>{};
    report("checking-cache");
    const baseDir=dirname(validatedPath);
    const outputRoot=resolve(baseDir,".markcut");
    const generated=resolve(outputRoot,"generated");
    const dir=resolve(outputRoot,basename(validatedPath,".md"),"default");
    const cacheDir=resolve(outputRoot,"cache");
    const indexFile=resolve(dir,"cache-index.json");
    const audio=await readPreviewAudio(validatedPath);
    const referencedAssets=[];
    for(const match of source.matchAll(/\b(?:src|audio)\s*:\s*["']?([^"'\s;]+\.(?:png|jpe?g|webp|svg|gif|mp4|mov|webm|wav|mp3|m4a|ogg|vtt|srt))/gi)){
      const candidate=match[1];
      if(candidate.includes("://")||candidate.startsWith("/"))continue;
      try {
        const info=await stat(resolve(baseDir,candidate));
        if(info.isFile())referencedAssets.push([candidate,info.size,info.mtimeMs]);
      }catch{}
    }
    referencedAssets.sort((a,b)=>String(a[0]).localeCompare(String(b[0])));
    // Compilation generates random scene ids. Identity must be based on inputs,
    // not on non-semantic runtime ids, so unchanged files reuse identical cache.
    if(audio.audioSrc && audio.audioSrc.startsWith("/")){
      const info=await stat(audio.audioSrc);
      referencedAssets.push([audio.audioSrc,info.size,info.mtimeMs]);
    }
    const hash=createHash("sha256").update(validatedPath).update("\0")
      .update(source).update("\0").update(JSON.stringify(referencedAssets)).update("\0").update(audio.audioSrc||"")
      .update("\0").update(process.env.GOOGLE_MAPS_API_KEY||"").digest("hex");
    const id=hash;
    let index={entries:[]};
    try {index=JSON.parse(await readFile(indexFile,"utf8"));} catch{}
    const cached=resolve(cacheDir,hash+".json");
    let finalCompiled;
    try {finalCompiled=JSON.parse(await readFile(cached,"utf8"));} catch{}
    if(!finalCompiled) {
    report("parsing-markdown");
    const descriptive=parseMarkdownDescriptive(source);
    report("resolving-assets-and-generating-media");
    const resolved=await resolveAll(descriptive,{
      sourcePath:validatedPath,baseDir,
      seed:parseInt(sourceHash.slice(0,8),16), // avoid rewriting original Markdown
      scriptOutputDir:resolve(generated,"tts"),
      mediaOutputDir:resolve(generated,"media"),
      includeOutputDir:resolve(generated,"includes"),
    });
    report("compiling-scenes");
    const compiled=compileDescriptiveRoot(resolved,{googleMapsApiKey:process.env.GOOGLE_MAPS_API_KEY});
    const withAudio=withPreviewAudio(compiled,audio.audioSrc);
    report("freezing-preview-assets");
    const external=externalizePreviewMedia(withAudio,id,publicOrigin(),baseDir);
    finalCompiled=external.compiled;
    await mkdir(cacheDir,{recursive:true});
    try {await writeFile(cached,JSON.stringify(finalCompiled,null,2),{flag:"wx"});}
    catch(error){if(error.code!=="EEXIST")throw error;}
    }
    const currentSource=await readFile(validatedPath,"utf8");
    if(createHash("sha256").update(currentSource).digest("hex")!==sourceHash)
      throw new Error("Source changed during compilation; retry preview");
    await mkdir(dir,{recursive:true});
    report("publishing-static-preview");
    // Static publication is completed before updating the latest pointer.
    const compiledUrl=publishCompiledCache(hash, finalCompiled);
    await atomicJson(resolve(dir,"compiled.json"),finalCompiled);
    await utimes(cached,new Date(),new Date());
    await pruneCache(cacheDir,indexFile,index.entries||[],hash);
    const preview={
      id,revisionId:id,contentHash:hash,sourceHash,path:validatedPath,
      compiledUrl, resourceUri:RESOURCE_URI,
      assetBaseUrl:publicOrigin()+"/files/_neoy/markcut/generated/"+id+"/",
    };
    return preview;
  });
  activeCompilesByPath.set(validatedPath,task);
  pendingCompiles.set(key,task);
  try{return await task;} finally{
    pendingCompiles.delete(key);
    if(activeCompilesByPath.get(validatedPath)===task)activeCompilesByPath.delete(validatedPath);
  }
}

// Compatibility export: there is no longer a managed player to stop.
export function stopManagedVideoPreview() {}

export function reviewResult(decision, feedback = "") {
  if (decision === "approved") return { decision };
  if (decision === "changes_requested") {
    const normalized = typeof feedback === "string" ? feedback.trim() : "";
    if (!normalized) throw new Error("feedback is required when requesting changes");
    return { decision, feedback: normalized };
  }
  throw new Error(`unsupported review decision: ${String(decision)}`);
}

export function reviewMessage(result) {
  const normalized = reviewResult(result?.decision, result?.feedback);
  return {
    jsonrpc: "2.0",
    method: "ui/message",
    params: { role: "user", content: [{ type: "text", text: JSON.stringify(normalized) }] },
  };
}

export function buildPreviewHtml() {
  const playerScriptUrl = publishPlayerBundle(bundlePath);
  // Base64 keeps HTML parser-sensitive sequences inside the large JS bundle
  // from terminating the embedding script tag or leaking source into the DOM.
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Markcut</title>
<style>body{font:14px system-ui;margin:0;background:#fff;color:#17202a}main{padding:12px;max-width:960px;margin:auto}h1{font-size:17px}.path{font-size:12px;overflow-wrap:anywhere}.transport{display:flex;align-items:center;gap:10px;padding:12px 0}.transport input{flex:1;min-width:50px}button{cursor:pointer;padding:8px;border-radius:6px;border:1px solid #a8a8a8}#approve{background:#198038;color:white}#changes{background:#c72b29;color:white}textarea{width:100%;box-sizing:border-box;min-height:66px}.review-actions{display:flex;justify-content:space-between;align-items:center;width:100%;gap:16px}.review-actions button{min-width:150px}#remotion-canvas{background:#090b12}#status{padding:8px 0}#status:empty{display:none}#scene-thumbnails{display:flex;gap:7px;overflow-x:auto;padding:12px 2px;scrollbar-width:thin} .scene-pill{flex-shrink:0;padding:7px 11px;border:1px solid #d4dbe4;border-radius:9px;cursor:pointer;background:#f5f7fa;color:#475569;font-size:12px;white-space:nowrap} .scene-pill.active{background:#e7f0ff;color:#125ea2;border-color:#408bd7}</style></head>
<body><main><header style="display:flex;justify-content:space-between;align-items:center"><h1>Markcut · <span id="video-md-version">video</span></h1><span id="player-version" style="font-size:12px;color:#667">v22</span></header><div class="path" id="path-label" hidden></div><div id="interactive-ui" hidden><div id="remotion-root"></div>
<textarea id="feedback" aria-label="Feedback" placeholder="Feedback on this scene…"></textarea><div id="status" role="status">Starting preview…</div>
<div class="review-actions"><button id="changes">Send feedback</button><button id="approve">Approve</button></div></div></main>
<script src="${playerScriptUrl}"></script>
<script>${buildPreviewBridgeScript().replaceAll("__MARKCUT_ORIGIN__",JSON.stringify(publicOrigin()))}</script></body></html>`;
}
