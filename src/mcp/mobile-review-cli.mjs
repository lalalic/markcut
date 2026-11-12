#!/usr/bin/env node
/** Standalone terminal preview compiler. Notification is owned by the Neo MCP wrapper. */
import {readFileSync,existsSync} from 'node:fs';
import {spawn,execFileSync} from 'node:child_process';
import {join,resolve,basename,dirname} from 'node:path';
import {homedir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {normalizeReviewConfig} from './review-delivery.mjs';

const delay = ms => new Promise(done => setTimeout(done,ms));

export function parseEventPreviewOptions(argv) {
  if (argv[0] !== 'preview' || !argv[1] || argv[1].startsWith('--')) throw new Error('Usage: markcut preview <file.md> --delivery event --event-template <file.json>');
  const allowed=new Set(['--delivery','--event-template','--timeout-ms']);
  const options={file:resolve(argv[1])};
  for(let i=2;i<argv.length;i+=2){
    const flag=argv[i],value=argv[i+1];
    if(!allowed.has(flag) || !value || value.startsWith('--'))throw new Error('Missing or unsupported preview event flag: '+flag);
    const key={'--delivery':'delivery','--event-template':'eventTemplatePath','--timeout-ms':'timeoutMs'}[flag];
    if(Object.hasOwn(options,key))throw new Error('Duplicate flag: '+flag);
    options[key]=value;
  }
  if(!['text','event'].includes(options.delivery) || (options.delivery==='event')!==Boolean(options.eventTemplatePath))
    throw new Error('Event delivery requires --event-template; Text delivery must omit it');
  const limit=options.timeoutMs===undefined ? 300000 : Number(options.timeoutMs);
  if(!Number.isSafeInteger(limit) || limit<1000 || limit>1800000)throw new Error('--timeout-ms must be 1000..1800000');
  options.timeoutMs=limit;
  return options;
}

// The explicit Neo Mobile delivery CLI resolves the installed Neo wrapper.
// No application-specific queue, APNs key or direct Review REST dependency
// is embedded in Markcut's compiler/server.
export function neoReviewWrapper(override=process.env.NEO_REVIEW_WRAPPER,
                                 discover=execFileSync){
 if(override){
  const path=resolve(override);
  if(!existsSync(path))throw Error('Neo preview wrapper is unavailable');
  return path;
 }
 const catalog=JSON.parse(String(discover('neo',['skill','list'],
   {encoding:'utf8',timeout:10000,maxBuffer:1024*1024})));
 const entry=catalog.find(x=>x.name==='mcp-wrapper'&&typeof x.path==='string');
 if(!entry)throw Error('Neo mcp-wrapper skill is unavailable');
 const path=join(dirname(entry.path),'markcut.mjs');
 if(!existsSync(path))throw Error('Neo preview wrapper is unavailable');
 return path;
}
export async function deliverThroughNeoWrapper(request,{wrapper=neoReviewWrapper()}={}){
 const child=spawn(process.execPath,[wrapper,'deliver'],{stdio:['pipe','pipe','pipe']});
 return await new Promise((resolve,reject)=>{
  let out='',err='';
  const timer=setTimeout(()=>{child.kill();reject(Error('Neo review delivery timed out'))},20000);
  child.stdout.on('data',bytes=>{out+=String(bytes);if(out.length>65536)child.kill();});
  child.stderr.on('data',bytes=>{err+=String(bytes);if(err.length>2000)err=err.slice(0,2000);});
  child.on('error',error=>{clearTimeout(timer);reject(error)});
  child.on('close',code=>{
   clearTimeout(timer);
   if(code!==0){reject(Error('Neo review wrapper delivery failed: '+err.slice(0,300)));return;}
   try{resolve(JSON.parse(out))}catch{reject(Error('Invalid Neo review receipt'))}
  });
  child.stdin.end(JSON.stringify(request));
 });
}
export function buildReviewRequest(options,config,state,operationId){
  const data=state?.result;
  if(!data||typeof data.contentHash!=='string'||typeof data.revisionId!=='string'||
     !data.contentHash.match(/^[a-f0-9]{64}$/)||!data.revisionId)
    throw Error('Compiled Preview has no immutable revision identity');
  const request={id:operationId,previewId:data.id,title:basename(options.file,'.md'),delivery:config.delivery};
  if(config.delivery==='event'){
    request.mediaHash=data.contentHash; // Transport-only lookup for the compiled player, never the review identity.
    request.eventTemplate=config.eventTemplate;
    request.groupId=options.file;
  }else {request.contentHash=data.contentHash;request.revisionId=data.revisionId;request.groupId=options.file;}
  return request;
}
export async function submitNeoReview(request,{deliver=deliverThroughNeoWrapper}={}){
 const receipt=await deliver(request);
 if(receipt?.stored!==true||receipt.requestId!==request.id)
   throw Error('Neo preview wrapper did not acknowledge durable delivery');
 return receipt;
}

export async function runMobilePreview(argv){
  const opts=parseEventPreviewOptions(argv);
  const config=opts.delivery==='event' ? normalizeReviewConfig({delivery:'event',
    eventTemplate:JSON.parse(readFileSync(resolve(opts.eventTemplatePath),'utf8'))}) : {delivery:'text'};
  const [{startCompileOperation},{EXPORT_ROOT}]=await Promise.all([
    import('./compile-operation.mjs'),import('./remote-assets.mjs'),
  ]);
  const operation=startCompileOperation(opts.file,config);
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
    ...(opts.delivery==='event' ? {} : {contentHash:state.result.contentHash,revisionId:state.result.revisionId}),
    delivery:config.delivery,notification:receipt.accepted?'apns_submitted':'inbox_stored'};
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  runMobilePreview(process.argv.slice(2)).then(result=>console.log(JSON.stringify(result))).catch(error=>{
    console.error('Markcut preview compilation failed: '+(error?.message||error));
    process.exitCode=1;
  });
}
