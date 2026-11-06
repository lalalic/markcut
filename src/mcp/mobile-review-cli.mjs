#!/usr/bin/env node
/** Standalone terminal preview compiler. Notification is owned by the Neo MCP wrapper. */
import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
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

export async function runMobilePreview(argv){
  const opts=parseEventPreviewOptions(argv);
  const config=opts.delivery==='event' ? normalizeReviewConfig({delivery:'event',
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
  return {status:'preview_ready',operationId:operation.operationId,requestId:state.result.requestId,
    contentHash:state.result.contentHash,revisionId:state.result.revisionId,
    ...(config.delivery==='event' ? {jobId:config.eventTemplate.data.interactive.jobId} : {}),
    delivery:config.delivery,notification:'not_requested'};
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  runMobilePreview(process.argv.slice(2)).then(result=>console.log(JSON.stringify(result))).catch(error=>{
    console.error('Markcut preview compilation failed: '+(error?.message||error));
    process.exitCode=1;
  });
}
