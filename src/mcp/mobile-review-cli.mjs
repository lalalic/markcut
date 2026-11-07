#!/usr/bin/env node
/** Standalone terminal preview compiler. Notification is owned by the Neo MCP wrapper. */
import {readFileSync,existsSync} from 'node:fs';
import {join,resolve,basename} from 'node:path';
import {homedir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {normalizeReviewConfig} from './review-delivery.mjs';

const delay = ms => new Promise(done => setTimeout(done,ms));

export function parseEventPreviewOptions(argv) {
  if (argv[0] !== 'preview' || !argv[1] || argv[1].startsWith('--')) throw new Error('Usage: markcut preview <file.md> --delivery event --event-template <file.json>');
  const allowed=new Set(['--delivery','--event-template','--timeout-ms','--commit-sha']);
  const options={file:resolve(argv[1])};
  for(let i=2;i<argv.length;i+=2){
    const flag=argv[i],value=argv[i+1];
    if(!allowed.has(flag) || !value || value.startsWith('--'))throw new Error('Missing or unsupported preview event flag: '+flag);
    const key={'--delivery':'delivery','--event-template':'eventTemplatePath','--timeout-ms':'timeoutMs','--commit-sha':'commitSha'}[flag];
    if(Object.hasOwn(options,key))throw new Error('Duplicate flag: '+flag);
    options[key]=value;
  }
  if(!['text','event'].includes(options.delivery) || (options.delivery==='event')!==Boolean(options.eventTemplatePath))
    throw new Error('Event delivery requires --event-template; Text delivery must omit it');
  if(options.delivery==='event' && !/^[a-f0-9]{40}$/.test(options.commitSha||''))
    throw new Error('Event review requires --commit-sha with full 40-character Git SHA');
  if(options.delivery==='text' && options.commitSha)throw new Error('Text previews do not bind a Git Commit SHA');
  const limit=options.timeoutMs===undefined ? 300000 : Number(options.timeoutMs);
  if(!Number.isSafeInteger(limit) || limit<1000 || limit>1800000)throw new Error('--timeout-ms must be 1000..1800000');
  options.timeoutMs=limit;
  return options;
}

// The compiler stays platform-neutral. The explicit CLI review workflow
// delivers to Neo.app's authenticated local Core REST boundary, never APNs or
// the Agent-facing MCP tool surface. Inability to persist the inbox is fatal.
export function neoReviewEndpoint(override=process.env.NEO_REVIEW_NOTIFY_URL,
  deploymentFile=join(homedir(),'Library','Application Support','NeoY','deployment.json')){
  let url;
  if(override)url=new URL(override);
  else{
    let port=6767;
    if(existsSync(deploymentFile)){
      const config=JSON.parse(readFileSync(deploymentFile,'utf8'));
      if(Number.isInteger(config.mcpPort)&&config.mcpPort>0&&config.mcpPort<=65535)port=config.mcpPort;
    }
    url=new URL('http://127.0.0.1:'+port+'/mobile/review/notify');
  }
  if(url.protocol!=='http:'||!['localhost','127.0.0.1'].includes(url.hostname)||
     url.pathname!=='/mobile/review/notify'||url.search||url.hash||url.username||url.password)
    throw Error('Neo Review delivery must use the local REST notify endpoint');
  return url.href;
}
export function buildReviewRequest(options,config,state,operationId){
  const data=state?.result;
  if(!data||typeof data.contentHash!=='string'||typeof data.revisionId!=='string'||
     !data.contentHash.match(/^[a-f0-9]{64}$/)||!data.revisionId)
    throw Error('Compiled Preview has no immutable revision identity');
  const request={id:operationId,previewId:data.id,title:basename(options.file,'.md'),delivery:config.delivery};
  if(config.delivery==='event'){
    if(!/^[a-f0-9]{40}$/.test(options.commitSha||''))throw Error('Git Commit SHA required for Event Review');
    request.commitSha=options.commitSha;
    request.mediaHash=data.contentHash; // Transport-only lookup for the compiled player, never the review identity.
    const fixed=config.eventTemplate.data.interactive;
    request.eventTemplate=config.eventTemplate;
    request.jobId=fixed.jobId;
    request.groupId=`job/${fixed.jobId}/task/${fixed.taskId}`;
  }else {request.contentHash=data.contentHash;request.revisionId=data.revisionId;request.groupId=options.file;}
  return request;
}
export async function submitNeoReview(request,{fetchImpl=fetch,url=neoReviewEndpoint()}={}){
  const destination=new URL(url);
  if(destination.protocol!=='http:'||!['127.0.0.1','localhost'].includes(destination.hostname)||
     destination.pathname!=='/mobile/review/notify'||destination.search||destination.hash)
    throw Error('Refusing a nonlocal Neo Review notification destination');
  const response=await fetchImpl(destination.href,{method:'POST',
    headers:{'Content-Type':'application/json','Accept':'application/json'},
    body:JSON.stringify(request),signal:AbortSignal.timeout(55000),redirect:'error'});
  if(!response.ok)throw Error('Neo Review REST rejected delivery: HTTP '+response.status);
  const receipt=await response.json();
  if(receipt?.stored!==true||receipt.requestId!==request.id)
    throw Error('Neo Review Core did not acknowledge durable Inbox storage');
  return receipt;
}

export async function runMobilePreview(argv){
  const opts=parseEventPreviewOptions(argv);
  const config=opts.delivery==='event' ? normalizeReviewConfig({delivery:'event',commitSha:opts.commitSha,
    eventTemplate:JSON.parse(readFileSync(resolve(opts.eventTemplatePath),'utf8'))}) : {delivery:'text'};
  const [{startCompileOperation},{EXPORT_ROOT}]=await Promise.all([
    import('./compile-operation.mjs'),import('./remote-assets.mjs'),
  ]);
  const operation=startCompileOperation(opts.file,undefined,config);
  const stateFile=join(EXPORT_ROOT,'operations',operation.operationId+'.json');
  let state;
  const until=Date.now()+opts.timeoutMs;
  while(Date.now()<until){
    try{state=JSON.parse(readFileSync(stateFile,'utf8'));}catch{}
    if(state?.state==='ready')break;
    if(state?.state==='failed')throw new Error('Preview compile failed: '+state.error);
    await delay(300);
  }
  if(state?.state!=='ready')throw new Error('Preview compile timed out; operation '+operation.operationId);
  const request=buildReviewRequest(opts,config,state,operation.operationId);
  const receipt=await submitNeoReview(request);
  return {status:'review_requested',operationId:operation.operationId,requestId:request.id,
    ...(opts.delivery==='event' ? {commitSha:opts.commitSha} : {contentHash:state.result.contentHash,revisionId:state.result.revisionId}),
    ...(config.delivery==='event' ? {jobId:config.eventTemplate.data.interactive.jobId} : {}),
    delivery:config.delivery,notification:receipt.accepted?'apns_submitted':'inbox_stored'};
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  runMobilePreview(process.argv.slice(2)).then(result=>console.log(JSON.stringify(result))).catch(error=>{
    console.error('Markcut preview compilation failed: '+(error?.message||error));
    process.exitCode=1;
  });
}
