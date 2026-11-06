import {createHash} from "node:crypto";
import {ensureVideoPreview} from "./preview.mjs";
import {publishPreviewRevision} from "./remote-assets.mjs";
import {writeOperation} from "./compile-operation.mjs";
import {fingerprintInputs} from "./source-fingerprint.mjs";
import {buildPhoneReviewRequest,sendMasterReviewRequest} from "./phone-notification.mjs";
const [id,path,requestedPath,relayText,sourceHash,reviewText,mobileOptionsText]=process.argv.slice(2);
const startedAt=Date.now();
const review=JSON.parse(reviewText||'{"delivery":"text"}');
const mobileOptions=JSON.parse(mobileOptionsText||"{}");
function update(stage){writeOperation(id,{id,state:"compiling",stage,startedAt,updatedAt:Date.now(),requestedPath});}
try{
 update("resolving-and-compiling");
 const input=fingerprintInputs(path);
 const actualHash=createHash("sha256").update(input.source).update("\0").update(JSON.stringify(input.assets)).digest("hex");
 if(actualHash!==sourceHash)throw new Error("Source changed while queued; retry preview");
 const result=await ensureVideoPreview(path,{onProgress:update});
 update("publishing");
 publishPreviewRevision(requestedPath,{...result,requestedPath});
 update("notifying-iphone");
 let mobileDelivery;
 try{
   const request=buildPhoneReviewRequest(id,{...result,requestedPath},review,mobileOptions);
   mobileDelivery=await sendMasterReviewRequest(request);
 }catch(error){
   mobileDelivery={stored:false,error:String(error?.message||error)};
 }
 // A compiled video is not a delivered Preview. Never silently claim success
 // if the canonical Master inbox could not persist the mobile request.
 if(mobileDelivery.stored!==true){
   writeOperation(id,{id,state:"failed",stage:"mobile-delivery",startedAt,updatedAt:Date.now(),
     requestedPath,error:mobileDelivery.error||"Neo Master could not persist review request"});
   process.exitCode=1;
 }else{
   writeOperation(id,{id,state:"ready",stage:"complete",startedAt,updatedAt:Date.now(),requestedPath,
     mobileDelivery,result:{...result,requestedPath,requestId:id,review,relay:JSON.parse(relayText)}});
 }
}catch(e){
 writeOperation(id,{id,state:"failed",stage:"failed",startedAt,updatedAt:Date.now(),requestedPath,error:e?.message||String(e)});
 process.exitCode=1;
}
