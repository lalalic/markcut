#!/usr/bin/env node
/** Codex/terminal human-review bridge. The phone publishes the caller-owned Event after Submit. */
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {basename,join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {normalizeReviewConfig} from './review-delivery.mjs';

const delay = ms => new Promise(done => setTimeout(done,ms));
const UUID = /^[a-f0-9-]{36}$/i;

export function parseEventPreviewOptions(argv) {
  if (argv[0] !== 'preview' || !argv[1] || argv[1].startsWith('--')) throw new Error('Usage: markcut preview <file.md> --delivery event --event-template <file.json> [--phone-url <url>]');
  const allowed=new Set(['--delivery','--event-template','--phone-url','--title','--group-id','--group-title','--request-id','--timeout-ms']);
  const options={file:resolve(argv[1])};
  for(let i=2;i<argv.length;i+=2){
    const flag=argv[i],value=argv[i+1];
    if(!allowed.has(flag) || !value || value.startsWith('--'))throw new Error('Missing or unsupported preview event flag: '+flag);
    const key={'--delivery':'delivery','--event-template':'eventTemplatePath','--phone-url':'phoneUrl','--title':'title','--group-id':'groupId','--group-title':'groupTitle','--request-id':'requestId','--timeout-ms':'timeoutMs'}[flag];
    if(Object.hasOwn(options,key))throw new Error('Duplicate flag: '+flag);
    options[key]=value;
  }
  if(options.delivery!=='event' || !options.eventTemplatePath)throw new Error('Event delivery and --event-template file are required');
  if(options.requestId && !UUID.test(options.requestId))throw new Error('--request-id must be a UUID');
  const limit=options.timeoutMs===undefined ? 300000 : Number(options.timeoutMs);
  if(!Number.isSafeInteger(limit) || limit<1000 || limit>1800000)throw new Error('--timeout-ms must be 1000..1800000');
  options.timeoutMs=limit;
  return options;
}

export function phoneUrlFromDnsSdText(text){
  const m=text.match(/can be reached at ([a-z0-9._-]+):([0-9]{1,5})\b/i);
  if(!m)return null;
  const host=m[1].replace(/\.+$/,'');
  if(!host.endsWith('.local') || Number(m[2])<1 || Number(m[2])>65535)return null;
  return `http://${host}:${m[2]}/mcp`;
}

export async function discoverPhoneUrl(timeoutMs=4000){
  return await new Promise((resolveDiscovery,rejectDiscovery)=>{
    const proc=spawn('dns-sd',['-L','neox','_mcp._tcp','local'],{stdio:['ignore','pipe','pipe']});
    let output='',settled=false;
    const done=(error,value)=>{
      if(settled)return;settled=true;clearTimeout(timeout);proc.kill('SIGTERM');
      if(error)rejectDiscovery(error);else resolveDiscovery(value);
    };
    const timeout=setTimeout(()=>done(new Error('Neo Mobile not discoverable; launch Neo on iPhone or provide --phone-url')),timeoutMs);
    proc.stdout.on('data',c=>{output+=String(c);if(output.length>8192)output=output.slice(-8192);const url=phoneUrlFromDnsSdText(output);if(url)done(null,url);});
    proc.stderr.on('data',c=>{output+=String(c);});
    proc.on('error',e=>done(e));
    proc.on('exit',()=>done(new Error('Neo Mobile Bonjour discovery stopped before resolution')));
  });
}

export function validatePhoneUrl(input){
  const u=new URL(input);
  if(u.username || u.password || u.search || u.hash || u.pathname!=='/mcp')throw new Error('Phone MCP URL must have only /mcp path');
  const h=u.hostname.toLowerCase();
  const local=h==='localhost'||h.endsWith('.local')||h==='127.0.0.1'||h.startsWith('10.')||h.startsWith('192.168.')||
    /^172\.(1[6-9]|2[0-9]|3[01])\./.test(h);
  if((u.protocol!=='http:' || !local) && u.protocol!=='https:')throw new Error('Phone MCP URL must be local HTTP or HTTPS');
  return u.toString();
}

export function buildMobileReviewRequest(operation,template,options={}){
  const config=normalizeReviewConfig({delivery:'event',eventTemplate:template});
  const result=operation.result;
  if(operation.state!=='ready' || !result || !/^[a-f0-9]{64}$/.test(result.contentHash||'') ||
      !result.revisionId || !result.id)throw new Error('Compiled preview is not ready');
  const details=config.eventTemplate.data.interactive;
  const id=options.requestId??operation.id;
  if(!UUID.test(id))throw new Error('Invalid review request identity');
  const title=options.title?.trim() || basename(options.file??result.requestedPath??'Preview','.md');
  return {
    id,contentHash:result.contentHash,revisionId:result.revisionId,previewId:result.id,
    title,groupId:options.groupId ?? `job/${details.jobId}/task/${details.taskId}`,
    groupTitle:options.groupTitle ?? title,jobId:details.jobId,
    delivery:'event',eventTemplate:config.eventTemplate,
  };
}

export async function sendMobileReviewRequest(phoneUrl,request,{fetchImpl=fetch}={}){
  const url=validatePhoneUrl(phoneUrl);
  const payload={jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'review.request',arguments:request}};
  let lastError;
  for(let attempt=0;attempt<2;attempt++){
    try{
      const response=await fetchImpl(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(9000)});
      if(!response.ok)throw new Error(`Phone MCP returned HTTP ${response.status}`);
      const body=await response.json();
      if(body.error || body.result?.isError)throw new Error('Phone MCP rejected review.request');
      const text=body.result?.content?.find(item=>item.type==='text')?.text;
      let receipt;
      try{receipt=JSON.parse(text);}catch{throw new Error('Phone MCP returned no structured review receipt');}
      if(receipt.accepted!==true || receipt.id!==request.id)throw new Error('Phone rejected the review request: '+String(text).slice(0,130));
      return receipt;
    }catch(e){lastError=e;if(attempt===0)await delay(400);}
  }
  throw lastError;
}

export async function runMobilePreview(argv){
  const opts=parseEventPreviewOptions(argv);
  const template=JSON.parse(readFileSync(resolve(opts.eventTemplatePath),'utf8'));
  const config=normalizeReviewConfig({delivery:'event',eventTemplate:template});
  // Check phone reachability before starting potentially expensive compilation.
  const phoneUrl=validatePhoneUrl(opts.phoneUrl || process.env.NEOX_MCP_URL || await discoverPhoneUrl());
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
  const request=buildMobileReviewRequest(state,config.eventTemplate,{...opts,file:opts.file});
  const receipt=await sendMobileReviewRequest(phoneUrl,request);
  return {accepted:receipt.accepted,duplicate:receipt.duplicate===true,
    status:'review_requested',operationId:operation.operationId,requestId:request.id,
    contentHash:request.contentHash,revisionId:request.revisionId,jobId:request.jobId,
    delivery:'event',phone:'Neo Mobile'};
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  runMobilePreview(process.argv.slice(2)).then(result=>console.log(JSON.stringify(result))).catch(error=>{
    console.error('Markcut mobile event preview failed: '+(error?.message||error));
    process.exitCode=1;
  });
}
