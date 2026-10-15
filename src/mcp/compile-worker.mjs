import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {ensureVideoPreview} from "./preview.mjs";
import {publishPreviewRevision} from "./remote-assets.mjs";
import {writeOperation} from "./compile-operation.mjs";
const [id,path,requestedPath,relayText,sourceHash]=process.argv.slice(2);
const startedAt=Date.now();
function update(stage){writeOperation(id,{id,state:"compiling",stage,startedAt,updatedAt:Date.now(),requestedPath});}
try{
 update("resolving-and-compiling");
 const actualHash=createHash("sha256").update(readFileSync(path)).digest("hex");
 if(actualHash!==sourceHash)throw new Error("Source changed while queued; retry preview");
 const result=await ensureVideoPreview(path,{onProgress:update});
 update("publishing");
 publishPreviewRevision(requestedPath,{...result,requestedPath});
 writeOperation(id,{id,state:"ready",stage:"complete",startedAt,updatedAt:Date.now(),requestedPath,result:{...result,requestedPath,relay:JSON.parse(relayText)}});
}catch(e){
 writeOperation(id,{id,state:"failed",stage:"failed",startedAt,updatedAt:Date.now(),requestedPath,error:e?.message||String(e)});
 process.exitCode=1;
}
