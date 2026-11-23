import {describe,it,expect} from 'vitest';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {designViewerUrl,publishDesignViewer} from '../src/mcp/design-viewer.mjs';
import {buildPreviewBridgeScript} from '../src/mcp/bridge.mjs';

const hash='a'.repeat(64);
const digest='b'.repeat(64);

describe('NeoY standalone Markcut design mode',()=>{
 it('returns a viewer URL only for an existing mounted video.md',()=>{
  const origin='https://neoy.example.test';
  const file='/mounted/vlog/video.md';
  const url=designViewerUrl(file,origin,()=>origin+'/files/vlog/video.md');
  expect(new URL(url!).searchParams.get('path')).toBe('/files/vlog/video.md');
  expect(url).not.toMatch(/session|revision|review/);
  expect(designViewerUrl(file,origin,()=>null)).toBeNull();
  expect(()=>designViewerUrl(file,origin,()=>origin+'/files/_neoy/markcut/cache/evil.md')).toThrow();
  expect(()=>designViewerUrl(file,origin,()=>origin+'/files/vlog/../secret.md')).toThrow();
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
 it('uses the existing preview provider and does not couple Markcut CLI to browser lifecycle',()=>{
  const server=readFileSync(new URL('../src/mcp/server.mjs',import.meta.url),'utf8');
  const cli=readFileSync(new URL('../bin/markcut',import.meta.url),'utf8');
  const viewer=readFileSync(new URL('../src/mcp/design-viewer.mjs',import.meta.url),'utf8');
  expect(server).toContain('designUrl=designViewerUrl(operation.path)');
  expect(server).toContain('if(designUrl)publishDesignViewer();');
  expect(server).toContain('readonly');
  expect(cli).not.toContain('--design');
  expect(viewer).not.toContain('webhelm');
  expect(viewer).not.toContain('spawn(');
  expect(viewer).not.toContain('SIGINT');
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
