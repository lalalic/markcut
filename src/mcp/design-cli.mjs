#!/usr/bin/env node
// Standalone NeoY design view: the source video.md, not a review or browser
// Session, is the stable identity. Compilation remains Markcut's concern.
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,renameSync,statSync} from 'node:fs';
import {resolve,dirname,join,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {EXPORT_ROOT,publicOrigin,resolveMountedFile} from './remote-assets.mjs';
import {buildPreviewHtml} from './preview.mjs';
import {startCompileOperation} from './compile-operation.mjs';

const delay=ms=>new Promise(ok=>setTimeout(ok,ms));

export function parseDesignArgs(argv){
 if(argv[0]!=='preview'||typeof argv[1]!=='string'||!argv[1].endsWith('.md'))
  throw Error('Usage: markcut preview <video.md> --design [--no-split]');
 const flags=argv.slice(2);
 if(!flags.includes('--design')||flags.some(f=>!['--design','--no-split'].includes(f))||
    new Set(flags).size!==flags.length)
  throw Error('Design preview supports only --design and --no-split');
 return {file:resolve(argv[1]),split:!flags.includes('--no-split')};
}

export function designSourceUrl(file,origin=publicOrigin(),resolveSource=resolveMountedFile){
 const mounted=resolveSource(file,origin);
 if(!mounted)throw Error('Design video.md must be inside an existing NeoY file mount');
 const url=new URL(mounted);
 if(url.origin!==origin||!/^\/files\/(?!_neoy\/)[A-Za-z0-9_-]+\/.+\.md$/i.test(url.pathname))
  throw Error('Design source must be a mounted Markdown file');
 return url.pathname;
}

export function designViewerUrl(sourcePath,origin=publicOrigin()){
 if(!/^\/files\/(?!_neoy\/)[A-Za-z0-9_-]+\/.+\.md$/i.test(sourcePath))
  throw Error('Invalid design source URL');
 return origin+'/files/_neoy/markcut/design.html?path='+encodeURIComponent(sourcePath);
}

// The shared MCP player is published *unchanged* as the standalone page.
export function publishDesignViewer({root=EXPORT_ROOT,html=buildPreviewHtml()}={}){
 mkdirSync(root,{recursive:true});
 const target=join(root,'design.html');
 try{if(readFileSync(target,'utf8')===html)return target;}catch{}
 const temp=target+'.'+process.pid+'.tmp';
 writeFileSync(temp,html,{mode:0o644});renameSync(temp,target);
 return target;
}

// Cheap watcher stamp: avoid hashing large videos every few seconds. The actual
// compiler fingerprints media content when this metadata stamp changes.
export function designInputStamp(file){
 const source=readFileSync(file,'utf8');
 const base=dirname(file),candidates=new Set([file,join(base,basename(file,'.md')+'.wav')]);
 for(const match of source.matchAll(/\b(?:src|audio|edl)\s*:\s*["']?([^"'\s;]+\.(?:png|jpe?g|webp|svg|gif|mp4|mov|webm|wav|mp3|m4a|ogg|vtt|srt|json))/gi)){
  if(match[1].includes('://')||match[1].startsWith('/'))continue;
  candidates.add(resolve(base,match[1]));
 }
 const stamp=[createHash('sha256').update(source).digest('hex')];
 for(const path of [...candidates].sort())try{
  const s=statSync(path);stamp.push(path,s.size,s.mtimeMs,s.ctimeMs);
 }catch{}
 return JSON.stringify(stamp);
}

export async function compileDesign(file,source,{start=startCompileOperation,root=EXPORT_ROOT,limitMs=300000}={}){
 const op=start(source,{delivery:'text'});
 const statusFile=join(root,'operations',op.operationId+'.json');
 const until=Date.now()+limitMs;
 while(Date.now()<until){
  let state;try{state=JSON.parse(readFileSync(statusFile,'utf8'));}catch{}
  if(state?.state==='ready')return state.result;
  if(state?.state==='failed')throw Error('Design compilation failed: '+state.error);
  await delay(300);
 }
 throw Error('Design compilation timed out');
}

export async function runDesignPreview(argv,{run=execFileSync,compile=compileDesign,
  publish=publishDesignViewer,stamp=designInputStamp,onReady=()=>{}}={}){
 const {file,split}=parseDesignArgs(argv);
 const source=designSourceUrl(file),url=designViewerUrl(source);
 const initialStamp=stamp(file);
 publish();
 await compile(file,source);
 let sessionId=null;
 if(split){
  const receipt=JSON.parse(run('webhelm',['design','start','--url',url],
    {encoding:'utf8',timeout:60000,stdio:['ignore','pipe','pipe']}));
  if(receipt.design_mode!==true||!receipt.session_id)throw Error('WebHelm Design Mode did not start');
  sessionId=receipt.session_id;
 }
 console.log(JSON.stringify({status:'design_ready',file,url,watching:true,split}));
 onReady({file,url,source});
 let running=true,stopping=false,previous=initialStamp,compileBusy=false;
 async function stop(){
  if(stopping)return;stopping=true;running=false;
  if(sessionId){
   try{run('webhelm',['design','stop',sessionId],{encoding:'utf8',timeout:90000,stdio:['ignore','pipe','pipe']});}
   catch(error){console.error('WebHelm Design Mode cleanup failed: '+String(error.message||error));}
  }
 }
 const sigint=()=>void stop(),sigterm=()=>void stop();
 process.once('SIGINT',sigint);process.once('SIGTERM',sigterm);
 try{
  while(running){
   await delay(1800);
   if(!running||compileBusy)continue;
   let next;try{next=stamp(file);}catch(error){console.error('Design source unavailable: '+error.message);continue;}
   if(next===previous)continue;
   previous=next;compileBusy=true;
   try{await compile(file,source);console.log(JSON.stringify({status:'design_refreshed',file,url}));}
   catch(error){console.error('Design recompile failed: '+String(error.message||error));}
   finally{compileBusy=false;}
  }
 }finally{
  process.removeListener('SIGINT',sigint);process.removeListener('SIGTERM',sigterm);
  await stop();
 }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 runDesignPreview(process.argv.slice(2)).catch(error=>{
  console.error('Markcut Design Mode failed: '+String(error.message||error));process.exitCode=1;
 });
}
