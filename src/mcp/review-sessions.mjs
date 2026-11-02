import {createHash, randomUUID} from "node:crypto";
import {chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync, openSync, closeSync, unlinkSync, statSync} from "node:fs";
import {fingerprintInputs} from "./source-fingerprint.mjs";
import {homedir} from "node:os";
import {basename, dirname, resolve, sep} from "node:path";
import {EXPORT_ROOT, resolvePreviewPath} from "./remote-assets.mjs";

// Review state contains human comments and Relay correlation. Keep it outside
// NeoY's public static /files export tree; only authenticated MCP tools expose it.
const STORE = resolve(process.env.MARKCUT_REVIEW_STORE || `${homedir()}/Library/Application Support/NeoY/markcut/review-sessions.json`);
const sessions = new Map();
const latestByPath = new Map();
let loaded = false;
let diskSignature = null;
function load() {
  let raw=null;
  try {
    raw=readFileSync(STORE,"utf8");
  } catch {}
  const signature=raw===null?null:createHash("sha256").update(raw).digest("hex");
  if(loaded&&signature===diskSignature)return;
  sessions.clear(); latestByPath.clear();
  loaded=true; diskSignature=signature;
  try {
    const data = raw===null?{}:JSON.parse(raw);
    for (const item of data.sessions || []) sessions.set(item.id, item);
    for (const [key, value] of Object.entries(data.latestByPath || {})) latestByPath.set(key, value);
  } catch {}
}
function persist() {
  mkdirSync(dirname(STORE), {recursive:true,mode:0o700});
  chmodSync(dirname(STORE),0o700);
  const lock=STORE+".lock"; let fd;
  for(let attempt=0;attempt<500;attempt++){
    try{fd=openSync(lock,"wx",0o600);break;}catch(error){
      if(error.code!=="EEXIST")throw error;
      // Recover only abandoned locks; normal writers hold the lock for milliseconds.
      try{if(Date.now()-statSync(lock).mtimeMs>30000)unlinkSync(lock);}catch{}
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10);
    }
  }
  if(fd===undefined)throw new Error("Timed out locking review session store");
  try {
  // Merge the latest disk state while holding the inter-process lock. In
  // particular, a stale worker must never erase a decision saved by the server.
  try {const disk=JSON.parse(readFileSync(STORE,"utf8")); for(const item of disk.sessions||[]){
    const local=sessions.get(item.id); if(!local)sessions.set(item.id,item);
    else sessions.set(item.id,{...item,...local,decision:item.decision||local.decision,status:item.decision?"decided":local.status});
  } for(const [key,id] of Object.entries(disk.latestByPath||{})) if(!latestByPath.has(key))latestByPath.set(key,id);}catch{}
  const temp = `${STORE}.${process.pid}.${randomUUID()}.tmp`;
  const data=JSON.stringify({sessions:[...sessions.values()], latestByPath:Object.fromEntries(latestByPath)});
  writeFileSync(temp, data, {mode:0o600, flag:"wx"});
  renameSync(temp, STORE);
  chmodSync(STORE,0o600);
  diskSignature=createHash("sha256").update(data).digest("hex");
  } finally {closeSync(fd);try{unlinkSync(lock);}catch{}}
}
function sourceHash(path) {
  const {source,assets}=fingerprintInputs(path);
  return createHash("sha256").update(source).update("\0").update(JSON.stringify(assets))
    .update("\0").update(process.env.GOOGLE_MAPS_API_KEY||"").update("\0map-footage-v4-custom-route-marker").digest("hex");
}
function latestSession(path) {
  load();
  const id = latestByPath.get(path);
  return id ? sessions.get(id) : undefined;
}
function publicSession(item) {
  if (!item) return null;
  const {compiled, path, requestedPath, ...safe} = item;
  const source = path || requestedPath || "video.md";
  safe.label = basename(source, ".md");
  // Treat creative variants under a single run as one video review job.
  // No Relay jobId? The run directory is the stable job identity; other
  // inputs keep their own per-source identities. Hash before federation.
  const runCreativeSeparator = `${sep}creatives${sep}`;
  const creativeAt = source.lastIndexOf(runCreativeSeparator);
  const runSource = creativeAt > 0 && source.slice(0,creativeAt).includes(`${sep}runs${sep}`)
    ? source.slice(0,creativeAt) : null;
  const groupSource = runSource || source;
  safe.videoGroupKey = createHash("sha256").update(groupSource).digest("hex");
  safe.videoGroupTitle = runSource ? basename(runSource)
    : safe.label.toLowerCase() === "video" ? basename(dirname(source)) : safe.label;
  return structuredClone(safe);
}

export function createOrReuseReviewSession(path, relay) {
  load();
  const validPath = resolvePreviewPath(path);
  const hash = sourceHash(validPath);
  const prior = latestSession(validPath);
  if (prior?.sourceHash === hash) {
    if (relay && !prior.relayCorrelations.some(x => JSON.stringify(x) === JSON.stringify(relay))) {
      prior.relayCorrelations.push(relay);
      persist();
    }
    return publicSession(prior);
  }
  if (prior && prior.status !== "decided") prior.status = "superseded";
  const item = {id:randomUUID(), path:validPath, requestedPath:path, sourceHash:hash, contentHash:null,
    revisionId:null, operationId:null, status:"compiling", createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(),
    compiled:null, relayCorrelations:relay ? [relay] : [], decision:null};
  sessions.set(item.id,item); latestByPath.set(validPath,item.id); persist();
  return publicSession(item);
}

export function attachReviewOperation(sessionId, operationId) {
  load(); const item=sessions.get(sessionId); if(!item) throw new Error("Unknown review session");
  item.operationId=operationId; item.updatedAt=new Date().toISOString(); persist(); return publicSession(item);
}

export function publishReviewRevision(sessionId, result) {
  load(); const item=sessions.get(sessionId); if(!item) throw new Error("Unknown review session");
  if (latestByPath.get(item.path) !== item.id || sourceHash(item.path) !== item.sourceHash) {
    item.status="superseded";
  } else {
    item.revisionId=result.revisionId; item.contentHash=result.contentHash;
    item.previewUrl=result.compiledUrl || null;
    item.title=result.title || null;
    if(item.decision?.contentHash!==result.contentHash){ item.decision=null; item.status="ready"; }
    else item.status="decided";
  }
  item.updatedAt=new Date().toISOString(); persist(); return publicSession(item);
}

export function failReviewSession(sessionId, error) {
  load(); const item=sessions.get(sessionId); if(!item) return;
  if(item.status === "compiling") item.status="failed";
  item.error=String(error).slice(0,1000); item.updatedAt=new Date().toISOString(); persist();
}

export function listReviewSessions({after=null,limit=50}={}) {
  load();
  const rows=[...sessions.values()].filter(x=>!after || x.updatedAt>after)
    .sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,Math.max(1,Math.min(100,limit)));
  return {sessions:rows.map(publicSession), latestUpdatedAt:rows[0]?.updatedAt || after};
}

export function getReviewSession(sessionId) { load(); return publicSession(sessions.get(sessionId)); }
export function getReviewMedia(sessionId,contentHash) {
  load(); const item=sessions.get(sessionId);
  if(!item || item.contentHash!==contentHash)
    throw new Error("Compiled media is unavailable for this review revision");
  try { return {sessionId,contentHash,compiled:JSON.parse(readFileSync(resolve(EXPORT_ROOT,"cache",contentHash+".json"),"utf8"))}; }
  catch { throw new Error("Compiled media is unavailable for this review revision"); }
}

export function decideReviewSession({sessionId,contentHash,decision,comments=[],idempotencyKey}) {
  load();
  if (!/^[a-f0-9]{64}$/.test(contentHash)) throw new Error("Invalid content hash");
  if (!/^(approved|changes_requested)$/.test(decision)) throw new Error("Invalid review decision");
  if (typeof idempotencyKey !== "string" || idempotencyKey.length<8 || idempotencyKey.length>128) throw new Error("Invalid idempotency key");
  if (decision === "changes_requested" && (!Array.isArray(comments)||comments.length===0)) throw new Error("Feedback is required");
  if (decision === "approved" && comments.length) throw new Error("Approval cannot include feedback comments");
  const item=sessions.get(sessionId); if(!item) throw new Error("Unknown review session");
  if (latestByPath.get(item.path)!==item.id || item.contentHash!==contentHash || sourceHash(item.path)!==item.sourceHash)
    throw new Error("This review session is not the current compiled revision");
  if (item.decision) {
    if (item.decision.idempotencyKey===idempotencyKey && item.decision.contentHash===contentHash && item.decision.decision===decision)
      return {session:publicSession(item),duplicate:true};
    throw new Error("A decision already exists for this revision");
  }
  if(item.status!=="ready") throw new Error("This review session is not the current compiled revision");
  const body={decision,contentHash,comments,idempotencyKey,decidedAt:new Date().toISOString()};
  item.decision=body; item.status="decided"; item.updatedAt=body.decidedAt; persist();
  const persisted=sessions.get(sessionId);
  if(persisted.decision.idempotencyKey!==idempotencyKey)throw new Error("A decision already exists for this revision");
  return {session:publicSession(persisted),duplicate:false};
}
