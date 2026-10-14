import {describe,it,expect} from 'vitest';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {buildPreviewBridgeScript} from '../src/mcp/bridge.mjs';

function harness(remoteData?:any) {
 const messages:any[]=[];
 const listeners:Record<string,Array<(evt:any)=>void>>={};
 const element=()=>({value:'',textContent:'',onclick:null as null|(()=>void)});
 const nodes:Record<string,ReturnType<typeof element>>={
  feedback:element(),status:element(),'path-label':element(),'video-md-version':element(),approve:element(),changes:element()
 };
 const parent={postMessage:(m:any)=>messages.push(m)};
 const events:any[]=[];
 const window={
  parent,
  addEventListener:(type:string,listener:(evt:any)=>void)=>(listeners[type]??=[]).push(listener),
  dispatchEvent:(evt:any)=>{events.push(evt);return true},
 };
 const fetch=async()=>({ok:true,json:async()=>remoteData});
 const context=vm.createContext({crypto:webcrypto,TextEncoder,fetch,setTimeout,window,document:{getElementById:(id:string)=>nodes[id]},CustomEvent:class {type:string;detail:any;constructor(t:string,opts:any){this.type=t;this.detail=opts.detail}}});
 const dispatch=(message:any,source=parent)=>(listeners.message??[]).forEach(listener=>listener({source,data:{jsonrpc:'2.0',...message}}));
 const result=(data:any)=>dispatch({method:'ui/notifications/tool-result',params:{result:{structuredContent:data}}});
 const respond=(id:number,result:any={})=>dispatch({id,result});
 vm.runInContext(buildPreviewBridgeScript().replaceAll("__MARKCUT_ORIGIN__",JSON.stringify("https://neoy.qili2.com")),context);
 return {messages,nodes,events,dispatch,result,respond};
}
const nextTick=()=>new Promise(resolve=>setTimeout(resolve,0));

describe('MCP Remotion bridge',()=>{
 it('hydrates scenes from NeoY when ChatGPT does not deliver tool-result',async()=>{
  const path='https://neoy.qili2.com/files/markcut-review/video-a-v4.md';
  const data={id:'remote',revisionId:'remote-r1',contentHash:'sha',path,requestedPath:path,compiled:{children:[{type:'scene'}]}};
  const h=harness(data);
  h.dispatch({method:'ui/notifications/tool-input',params:{arguments:{path}}});
  for(let i=0;i<12&&!h.events.some(e=>e.detail?.revisionId==='remote-r1');i++)await nextTick();
  expect(h.events.at(-1)?.detail?.revisionId).toBe('remote-r1');
  expect(h.nodes.status.textContent).toBe('Remotion scenes loaded for review.');
 });
 it('initializes, delivers compiled scenes and submits review without secondary MCP calls',async()=>{
  const h=harness();
  expect(h.messages[0]).toMatchObject({id:1,method:'ui/initialize'});
  h.respond(1);
  await nextTick();
  expect(h.messages[1]).toMatchObject({method:'ui/notifications/initialized'});
  const compiled={width:640,height:480,fps:30,children:[{name:'Scene-A',durationInSeconds:2}]};
  h.result({id:'one',revisionId:'rev1',contentHash:'abcdef',path:'/tmp/a.md',compiled});
  expect(h.events.map(e=>e.type)).toEqual(['markcut:revision']);
  expect(h.events[0].detail.compiled).toEqual(compiled);
  expect(h.nodes['path-label'].textContent).toBe('/tmp/a.md');
  expect(h.nodes['video-md-version'].textContent).toBe('a');
  expect(h.messages.filter(m=>m.method==='tools/call')).toHaveLength(0);
  h.nodes.approve.onclick?.();
  expect(h.messages[2]).toMatchObject({id:2,method:'ui/message'});
  expect(JSON.parse(h.messages[2].params.content[0].text)).toEqual({previewId:'one',revisionId:'rev1',contentHash:'abcdef',path:'/tmp/a.md',decision:'approved'});
  h.respond(2);
  await nextTick();
  expect(h.nodes.status.textContent).toBe('Approved.');
 });
 it('keeps previews isolated per iframe and enforces feedback',async()=>{
  const a=harness(),b=harness();
  a.respond(1);b.respond(1);await nextTick();
  a.result({id:'a',revisionId:'ra',contentHash:'hash-a',compiled:{children:[{name:'A'}]}});
  b.result({id:'b',revisionId:'rb',contentHash:'hash-b',compiled:{children:[{name:'B'}]}});
  expect(a.events[0].detail.compiled.children[0].name).toBe('A');
  expect(b.events[0].detail.compiled.children[0].name).toBe('B');
  a.nodes.changes.onclick?.();
  expect(a.nodes.status.textContent).toBe('Feedback is required.');
  expect(a.messages.filter(m=>m.method==='ui/message')).toHaveLength(0);
  a.nodes.feedback.value='Shorten the opening';
  a.nodes.changes.onclick?.();
  expect(JSON.parse(a.messages[2].params.content[0].text)).toMatchObject({previewId:'a',decision:'changes_requested',feedback:'Shorten the opening'});
  expect(b.messages.filter(m=>m.method==='ui/message')).toHaveLength(0);
 });
 it('does not show the latest B result inside an A-bound iframe',()=>{
  const a=harness(),b=harness();
  const aData={id:'a',revisionId:'ra',contentHash:'a',path:'/a.md',compiled:{children:[{name:'A'}]}};
  const bData={id:'b',revisionId:'rb',contentHash:'b',path:'/b.md',compiled:{children:[{name:'B'}]}};
  a.dispatch({method:'ui/notifications/tool-input',params:{arguments:{path:'/a.md'}}});
  b.dispatch({method:'ui/notifications/tool-input',params:{arguments:{path:'/b.md'}}});
  a.result(bData);b.result(bData);
  expect(a.nodes['path-label'].textContent).toBe('/a.md');
  expect(a.events.filter(e=>e.detail?.revisionId)).toHaveLength(0);
  expect(b.events.at(-1).detail.revisionId).toBe('rb');
  a.result(aData);
  expect(a.events.at(-1).detail.revisionId).toBe('ra');
  a.result(bData);
  expect(a.events.at(-1).detail.revisionId).toBe('ra');
 });
 it('accepts a URL invocation whose result resolves to an absolute local path in either notification order',()=>{
  const url='https://neoy.qili2.com/files/markcut-review/video-a-v4.md';
  const data={id:'u',revisionId:'url-rev',contentHash:'hash',path:'/Users/chengli/Workspace/markcut-manual-review-20261013/video-a-v4.md',requestedPath:url,compiled:{children:[]}};
  const first=harness();
  first.dispatch({method:'ui/notifications/tool-input',params:{arguments:{path:url}}});
  first.result(data);
  expect(first.events.at(-1).detail.revisionId).toBe('url-rev');
  const second=harness();
  second.result(data);
  second.dispatch({method:'ui/notifications/tool-input',params:{arguments:{path:url}}});
  expect(second.events.at(-1).detail.revisionId).toBe('url-rev');
  second.nodes.approve.onclick?.();
  expect(JSON.parse(second.messages.at(-1).params.content[0].text).revisionId).toBe('url-rev');
 });
 it('preserves optional Relay job/task context across review decisions',()=>{
  const h=harness();
  const relay={jobId:'job-7',taskId:19,executionId:'exec-1'};
  h.result({id:'r',revisionId:'r',contentHash:'hash',path:'/video.md',relay,compiled:{children:[]}});
  h.nodes.feedback.value='shorter title';h.nodes.changes.onclick?.();
  expect(JSON.parse(h.messages.at(-1).params.content[0].text).relay).toEqual(relay);
 });
 it('handles request changes followed by a new revision and approval in the same app',async()=>{
  const h=harness();h.respond(1);await nextTick();
  const first={id:'first',revisionId:'r1',contentHash:'sha1',path:'/video.md',compiled:{children:[{name:'First'}]}};
  const next={id:'second',revisionId:'r2',contentHash:'sha2',path:'/video.md',compiled:{children:[{name:'Next'}]}};
  h.result(first);
  h.nodes.feedback.value='lowercase title';h.nodes.changes.onclick?.();
  expect(JSON.parse(h.messages[2].params.content[0].text)).toMatchObject({path:'/video.md',revisionId:'r1',decision:'changes_requested',feedback:'lowercase title'});
  h.respond(2);await nextTick();
  expect(h.nodes.status.textContent).toContain('Waiting for the updated preview');
  h.nodes.approve.onclick?.();
  expect(h.messages.filter(m=>m.method==='ui/message')).toHaveLength(1);
  h.result(next);
  h.nodes.approve.onclick?.();
  const decisions=h.messages.filter(m=>m.method==='ui/message').map(m=>JSON.parse(m.params.content[0].text));
  expect(decisions).toHaveLength(2);
  expect(decisions[1]).toMatchObject({path:'/video.md',revisionId:'r2',contentHash:'sha2',decision:'approved'});
 });

});
