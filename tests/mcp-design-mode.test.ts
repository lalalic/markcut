import {describe,it,expect} from 'vitest';
import {mkdtemp,writeFile,readFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {parseDesignArgs,designSourceUrl,designViewerUrl,publishDesignViewer,designInputStamp,compileDesign} from '../src/mcp/design-cli.mjs';
import {buildPreviewBridgeScript} from '../src/mcp/bridge.mjs';

const hash='a'.repeat(64);
const digest='b'.repeat(64);

describe('NeoY standalone Markcut design mode',()=>{
 it('uses only a mounted video.md path, not a Session or Revision ID',()=>{
  expect(parseDesignArgs(['preview','/tmp/video.md','--design','--no-split'])).toEqual({file:'/tmp/video.md',split:false});
  expect(()=>parseDesignArgs(['preview','/tmp/video.md','--design','--delivery','event'])).toThrow();
  expect(()=>parseDesignArgs(['preview','/tmp/video.json','--design'])).toThrow();
  const origin='https://neoy.example.test';
  const file='/mounted/vlog/video.md';
  const path=designSourceUrl(file,origin,()=>origin+'/files/vlog/video.md');
  expect(path).toBe('/files/vlog/video.md');
  const url=designViewerUrl(path,origin);
  expect(new URL(url).searchParams.get('path')).toBe(path);
  expect(url).not.toMatch(/session|revision|review/);
  expect(()=>designSourceUrl(file,origin,()=>undefined)).toThrow(/NeoY file mount/);
  expect(()=>designViewerUrl('/files/_neoy/markcut/cache/evil.md',origin)).toThrow();
 });
 it('publishes the same player without creating a second viewer',async()=>{
  const root=await mkdtemp(join(tmpdir(),'markcut-design-ui-'));
  try{
   const html='<!doctype html><html><body>Markcut existing player</body></html>';
   const file=publishDesignViewer({root,html});
   expect(await readFile(file,'utf8')).toBe(html);
   expect(publishDesignViewer({root,html})).toBe(file);
  }finally{await rm(root,{force:true,recursive:true});}
 });
 it('detects source and editor-decision sidecar edits',async()=>{
  const root=await mkdtemp(join(tmpdir(),'markcut-design-watch-'));
  try{
   const file=join(root,'video.md');
   await writeFile(file,'# video\n## Intro\n- component duration:1 jsx:"Hello"\n---\nedl: video.edl.json\n---\n');
   const first=designInputStamp(file);
   await writeFile(join(root,'video.edl.json'),'{}');
   expect(designInputStamp(file)).not.toBe(first);
   const second=designInputStamp(file);
   await writeFile(file,'# video\n## Intro\n- component duration:1 jsx:"World"\n');
   expect(designInputStamp(file)).not.toBe(second);
  }finally{await rm(root,{force:true,recursive:true});}
 });
 it('observes existing Markcut compilation result instead of publishing a review',async()=>{
  const root=await mkdtemp(join(tmpdir(),'markcut-design-compile-'));
  try{
   await mkdir(join(root,'operations'));
   const output={revisionId:hash,contentHash:hash,compiledUrl:'https://neoy.example.test/files/_neoy/markcut/cache/'+hash+'.json'};
   const result=await compileDesign('/tmp/video.md','/files/vlog/video.md',{
    root,start:(input,review)=>{
     expect(input).toBe('/files/vlog/video.md');
     expect(review).toEqual({delivery:'text'});
     void writeFile(join(root,'operations','test.json'),JSON.stringify({state:'ready',result:output}));
     return {operationId:'test'};
    },limitMs:2000,
   });
   expect(result).toEqual(output);
  }finally{await rm(root,{force:true,recursive:true});}
 });
 it('loads and refreshes the original player without MCP initialize or review messages',async()=>{
  const path='/files/vlog/video.md';
  let current=hash;
  let poll:()=>unknown=()=>{};
  const dispatched:any[]=[];
  const node=()=>({value:'',hidden:false,disabled:false,textContent:'',style:{display:''},onclick:null,
    addEventListener(){},replaceChildren(){}});
  const elements=new Map<string,ReturnType<typeof node>>();
  const document={body:{classList:{add:()=>{}}},querySelector:()=>node(),getElementById:(id:string)=>{
    if(!elements.has(id))elements.set(id,node());return elements.get(id)!;
  }};
  const window:any={
   parent:{postMessage:(m:any)=>dispatched.push(m)},
   addEventListener(){},dispatchEvent:(event:any)=>{dispatched.push(event);},
   setInterval:(callback:()=>unknown)=>{poll=callback;return 1;},
  };
  const fetch=async (url:string)=>{
   if(url.includes('/revisions/'))return {ok:true,json:async()=>({requestedPath:path,revisionId:current,contentHash:current,
    compiledUrl:'https://neoy.example.test/files/_neoy/markcut/cache/'+current+'.json'})};
   if(url.includes('/cache/'))return {ok:true,json:async()=>({width:640,height:360,fps:30,children:[]})};
   throw Error('Unexpected URL '+url);
  };
  const context=vm.createContext({window,document,location:{pathname:'/files/_neoy/markcut/design.html',search:'?path='+encodeURIComponent(path)},
   fetch,crypto:webcrypto,TextEncoder,URL,URLSearchParams,setTimeout,clearTimeout,CustomEvent:class {type:string;detail:any;
    constructor(type:string,options:any){this.type=type;this.detail=options.detail;}}});
  vm.runInContext(buildPreviewBridgeScript().replaceAll('__MARKCUT_ORIGIN__',JSON.stringify('https://neoy.example.test')),context);
  await new Promise(done=>setTimeout(done,50));
  expect(window.__markcutRevision?.contentHash).toBe(hash);
  expect(window.__markcutDesignMode).toBe(true);
  expect(dispatched.some(x=>x.method==='ui/initialize'||x.method==='ui/message')).toBe(false);
  current=digest;await poll();await new Promise(done=>setTimeout(done,50));
  expect(window.__markcutRevision?.contentHash).toBe(digest);
  expect(dispatched.some(x=>x.method==='ui/message')).toBe(false);
 });
});
