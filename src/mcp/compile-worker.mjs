import {createHash} from "node:crypto";
import {ensureVideoPreview} from "./preview.mjs";
import {publishPreviewRevision} from "./remote-assets.mjs";
import {writeOperation} from "./compile-operation.mjs";
import {fingerprintInputs} from "./source-fingerprint.mjs";
const [id,path,requestedPath,relayText,sourceHash,reviewText]=process.argv.slice(2);
const startedAt=Date.now();
const review=JSON.parse(reviewText||'{"delivery":"text"}');
function update(stage){writeOperation(id,{id,state:"compiling",stage,startedAt,updatedAt:Date.now(),requestedPath});}
try{
 update("resolving-and-compiling");
 const input=fingerprintInputs(path);
 const actualHash=createHash("sha256").update(input.source).update("\0").update(JSON.stringify(input.assets)).digest("hex");
 if(actualHash!==sourceHash)throw new Error("Source changed while queued; retry preview");
 const result=await ensureVideoPreview(path,{onProgress:update});
 update("publishing");
 publishPreviewRevision(requestedPath,{...result,requestedPath});
 writeOperation(id,{id,state:"ready",stage:"complete",startedAt,updatedAt:Date.now(),requestedPath,result:{...result,requestedPath,requestId:id,review,relay:JSON.parse(relayText)}});
}catch(e){
 writeOperation(id,{id,state:"failed",stage:"failed",startedAt,updatedAt:Date.now(),requestedPath,error:e?.message||String(e)});
 process.exitCode=1;
}
