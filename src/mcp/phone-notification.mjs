/** Shared mobile-review delivery for both hosted MCP and Codex CLI previews. */
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {join,basename} from 'node:path';
import {homedir} from 'node:os';
import {normalizeReviewConfig} from './review-delivery.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA=/^[0-9a-f]{64}$/;

export function buildPhoneReviewRequest(operationId,result,review,options={}){
  const config=normalizeReviewConfig(review);
  if(!UUID.test(operationId) || !result || !SHA.test(result.contentHash||'') ||
      !result.revisionId || !result.id)throw new Error('Immutable Preview is not ready');
  const id=options.requestId||operationId;
  if(!UUID.test(id))throw new Error('Invalid phone request UUID');
  const title=options.title || basename(result.requestedPath||'video.md','.md');
  const request={id,contentHash:result.contentHash,revisionId:result.revisionId,
    previewId:result.id,title,delivery:config.delivery};
  if(config.delivery==='event'){
    const fixed=config.eventTemplate.data.interactive;
    request.eventTemplate=config.eventTemplate;
    request.jobId=fixed.jobId;
    request.groupId=options.groupId||`job/${fixed.jobId}/task/${fixed.taskId}`;
  }else{
    // A ChatGPT text-only preview has no Relay event identity or owning thread.
    // Mirror the video to iPhone as view-only; ChatGPT still owns its text review.
    request.groupId=options.groupId||result.requestedPath;
  }
  if(options.groupTitle)request.groupTitle=options.groupTitle;
  return request;
}

export async function sendMasterReviewRequest(request,{bridge=process.env.NEOX_APNS_BRIDGE,timeoutMs=20000}={}){
  const binary=bridge || join(homedir(),'Workspace/neox/NeoxAPNs/review-cli.mjs');
  if(!existsSync(binary))throw new Error('Neo Master APNs review bridge unavailable: '+binary);
  return await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[binary,'notify'],{stdio:['pipe','pipe','pipe']});
    let out='',err='',done=false;
    const finish=(error,result)=>{if(done)return;done=true;clearTimeout(timer);if(error)reject(error);else resolve(result);};
    const timer=setTimeout(()=>{child.kill('SIGTERM');finish(new Error('Master review push timed out'));},timeoutMs);
    child.stdout.on('data',d=>{out+=d; if(out.length>256000)child.kill('SIGTERM');});
    child.stderr.on('data',d=>{if(err.length<1000)err+=d;});
    child.on('error',e=>finish(e));
    child.on('exit',code=>{
      if(code!==0)return finish(new Error('Master review delivery failed: '+err.slice(0,250)));
      let parsed;try{parsed=JSON.parse(out);}catch{return finish(new Error('Invalid Master review receipt'));}
      if(parsed.stored!==true || parsed.requestId!==request.id)return finish(new Error('Master did not persist review request'));
      finish(null,parsed);
    });
    child.stdin.end(JSON.stringify(request));
  });
}
