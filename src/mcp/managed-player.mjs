#!/usr/bin/env node
// Local-only bounded preview gateway. CLI player behavior is unchanged.
import { createServer, request as httpRequest } from "node:http";
import { createServer as createTcpServer } from "node:net";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { realpath, readFile, writeFile, unlink, stat, rm } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PLAYER = join(ROOT, "src/player/server.mjs");
const ORIGIN = "http://127.0.0.1:4571";
const MAX = 6;
const slots = new Map();
const byKey = new Map();
const pending = new Map();
const reservedPorts = new Set();
const respond = (res, code, data) => { res.writeHead(code, {"content-type":"application/json", "cache-control":"no-store"});res.end(JSON.stringify(data)); };
function waitReady(port, child) {
  return new Promise((resolveReady, reject) => {
    const deadline = Date.now() + 120000;
    const poll = () => {
      if (child.exitCode !== null || child.signalCode) return reject(new Error("player exited before ready"));
      const req = httpRequest({hostname:"127.0.0.1",port,path:"/api/ready",timeout:1500}, res => {
        let buf = ""; res.on("data", b => buf += b); res.on("end", () => {
          try { if (JSON.parse(buf).ready) return resolveReady(); } catch {}
          again();
        });
      });
      req.on("error", again);req.on("timeout",()=>req.destroy());req.end();
    };
    const again = () => Date.now() > deadline ? reject(new Error("player readiness timed out")) : setTimeout(poll, 500);
    poll();
  });
}
async function portIsFree(port) {
  return new Promise(resolvePort => {
    const probe = createTcpServer();
    probe.once("error", () => resolvePort(false));
    probe.listen(port, "127.0.0.1", () => {
      probe.close(() => resolvePort(true));
    });
  });
}
async function create(path) {
  if (typeof path !== "string" || !path.startsWith("/") || !path.toLowerCase().endsWith(".md")) throw new Error("absolute .md path required");
  const canonical = await realpath(path);
  const info = await stat(canonical);
  if (!info.isFile() || info.size > 1024 * 1024) throw new Error("invalid or oversized Markdown file");
  const bytes = await readFile(canonical);
  const contentHash = createHash("sha256").update(bytes).digest("hex");
  const key = createHash("sha256").update(canonical+"\0"+contentHash).digest("hex");
  if (byKey.has(key)) { const s = slots.get(byKey.get(key)); if (s) return s.info; }
  if (pending.has(key)) return pending.get(key);
  const work = (async () => {
    if (slots.size + pending.size >= MAX) throw new Error("preview capacity exceeded (6 active revisions); restart manager to release");
    // Snapshots are siblings of original to preserve relative media resolution.
    // The player compiler adds a seed to its input file. A deterministic
    // snapshot name would collide with that modified file on manager restart.
    const snapshot = join(dirname(canonical), ".markcut-preview-" + key + "-" + randomUUID() + ".md");
    await writeFile(snapshot, bytes, {flag:"wx",mode:0o600});
    const id = randomUUID();
    let child;
    let port;
    for (let candidate=4580;candidate<4599;candidate++) {
      if (reservedPorts.has(candidate) || !await portIsFree(candidate)) continue;
      port=candidate;reservedPorts.add(candidate);break;
    }
    if (!port) throw new Error("no child port available");
    child = spawn(process.execPath,[PLAYER,snapshot,"--port="+port],{cwd:ROOT,stdio:["ignore","pipe","pipe"]});
    child.stdout.on("data", data => { process.stderr.write("[preview "+id+" stdout] "+data.toString().slice(0,3000)); });
    child.stderr.on("data", data => { process.stderr.write("[preview "+id+"] "+data.toString().slice(0,3000)); });
    const info = {id, revisionId:id, contentHash, path:canonical, previewUrl:ORIGIN+"/p/"+id+"/"};
    const slot={id,key,port,child,snapshot,info};
    slots.set(id,slot);byKey.set(key,id);
    child.once("exit",()=>{slots.delete(id);byKey.delete(key);reservedPorts.delete(port);void cleanupSnapshot(snapshot);});
    try { await waitReady(port,child); } catch(err) {
      child.kill("SIGTERM");slots.delete(id);byKey.delete(key);reservedPorts.delete(port);await cleanupSnapshot(snapshot);throw err;
    }
    // Pin the exact compiled tree once at creation. Reloads and sibling
    // compilations must never change a previously issued revision URL.
    const compiledResponse = await fetch("http://127.0.0.1:"+port+"/api/video-data");
    if (!compiledResponse.ok) throw new Error("unable to pin preview compilation");
    slot.compiledBody = await compiledResponse.text();
    return info;
  })();
  pending.set(key,work);
  try { return await work; } finally {pending.delete(key); }
}
async function cleanupSnapshot(snapshot) {
  await unlink(snapshot).catch(()=>{});
  await rm(join(dirname(snapshot), ".markcut", basename(snapshot, ".md")), {recursive:true,force:true}).catch(()=>{});
}
async function stop() {
  const workers=[...slots.values()];
  for (const slot of workers) slot.child.kill("SIGTERM");
  await Promise.all(workers.map(async s=>{
    await cleanupSnapshot(s.snapshot);
  }));
  slots.clear();byKey.clear();reservedPorts.clear();
}
function selectSlot(req, url) {
  const match=url.pathname.match(/^\/p\/([0-9a-f-]{36})(\/.*)?$/);
  if (match) return {slot:slots.get(match[1]), path: (match[2]||"/")+url.search};
  const ref=req.headers.referer||"";
  let refMatch;
  try { refMatch=new URL(ref).pathname.match(/^\/p\/([0-9a-f-]{36})\//); } catch {}
  if (refMatch) return {slot:slots.get(refMatch[1]), path:url.pathname+url.search};
  return {};
}
const server=createServer(async(req,res)=>{
  const url=new URL(req.url,ORIGIN);
  // Browser-origin requests must not be allowed to create arbitrary local
  // previews; native stdio MCP calls have no Origin header.
  if(req.headers.origin && req.headers.origin !== ORIGIN)
    return respond(res,403,{error:"cross-origin preview request refused"});
  if (url.pathname==="/__markcut/health") return respond(res,200,{service:"markcut-preview-manager",count:slots.size});
  if (url.pathname==="/__markcut/previews" && req.method==="POST") {
    let text="";for await(const b of req){text+=b;if(text.length>8192)return respond(res,413,{error:"request too large"});}
    try {const info=await create(JSON.parse(text).path);return respond(res,200,info);} catch(e){return respond(res,400,{error:e.message});}
  }
  const {slot,path}=selectSlot(req,url);
  if(!slot)return respond(res,404,{error:"unknown/expired preview URL"});
  if(req.method==="GET" && path.split("?")[0]==="/api/video-data" && slot.compiledBody) {
    res.writeHead(200,{"content-type":"application/json","cache-control":"no-store"});
    return res.end(slot.compiledBody);
  }
  if(req.method==="GET" && path.split("?")[0]==="/") {
    // Keep the bundled player script in the exact revision namespace,
    // instead of the root-relative /player.js route.
    const upstream=httpRequest({hostname:"127.0.0.1",port:slot.port,path:"/",method:"GET"},up=>{
      const chunks=[];
      up.on("data",chunk=>chunks.push(chunk));
      up.on("end",async()=>{
        try {
          const html=Buffer.concat(chunks).toString("utf8");
          const tag='<script src="/player.js" type="module"></script>';
          if(!html.includes(tag)) throw new Error("player script tag missing");
          res.writeHead(up.statusCode??200,{"content-type":"text/html; charset=utf-8","cache-control":"no-store"});
          res.end(html.replace(tag,`<script src="/p/${slot.id}/player.js" type="module"></script>`));
        } catch(e) {if(!res.headersSent)respond(res,502,{error:e.message});else res.end();}
      });
    });
    upstream.on("error",e=>respond(res,502,{error:e.message}));
    upstream.end();
    return;
  }
  const upstream=httpRequest({hostname:"127.0.0.1",port:slot.port,path,method:req.method,headers:{...req.headers,host:"127.0.0.1:"+slot.port}},up=>{
    res.writeHead(up.statusCode,up.headers);up.pipe(res);
  });
  upstream.on("error",e=>{if(!res.headersSent)respond(res,502,{error:e.message});else res.end();});
  req.pipe(upstream);
});
server.on("error",e=>{console.error("preview manager could not bind 4571:",e.message);process.exitCode=1;});
server.listen(4571,"127.0.0.1");
let closing=false;
async function shutdown(){if(closing)return;closing=true;server.close();await stop();process.exit(0);}
process.on("SIGTERM",shutdown);process.on("SIGINT",shutdown);
