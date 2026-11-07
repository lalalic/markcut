import {describe,it,expect} from 'vitest';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {buildPreviewBridgeScript} from '../src/mcp/bridge.mjs';

function harness(remoteData?:any, fetchOverride?:(url:string)=>Promise<any>, toolCall?:(message:any)=>any) {
 const messages:any[]=[];
 const listeners:Record<string,Array<(evt:any)=>void>>={};
 const element=()=>({value:'',textContent:'',onclick:null as null|(()=>void),oninput:null as null|(()=>void),
  disabled:false,hidden:false,type:'',children:[] as any[],listeners:{} as Record<string,Function>,
  addEventListener(type:string,listener:Function){this.listeners[type]=listener},
  replaceChildren(){this.children=[]},append(...items:any[]){this.children.push(...items)}
 });
 const nodes:Record<string,ReturnType<typeof element>>={
  feedback:element(),status:element(),'path-label':element(),'video-md-version':element(),'interactive-ui':element(),approve:element(),changes:element(),'save-spot':element(),'remove-spot':element(),'comment-target':element(),'comment-mode':element(),'overall-mode':element(),'review-delivery-mode':element()
 };
 nodes['comment-mode'].value='spot';
 let dispatch:(message:any,source?:any)=>void;
 const parent={postMessage:(m:any)=>{messages.push(m);if(m.method==='tools/call'||m.method==='ui/message')setTimeout(()=>{const response=toolCall?.(m);dispatch?.(response?.rpcError?{id:m.id,error:response.rpcError}:{id:m.id,result:response||{content:[]}})},0)}};
 const events:any[]=[];
 const window={
  parent,
  addEventListener:(type:string,listener:(evt:any)=>void)=>(listeners[type]??=[]).push(listener),
  dispatchEvent:(evt:any)=>{events.push(evt);return true},
 };
 const fetch=fetchOverride|| (async()=>({ok:true,json:async()=>remoteData}));
 const context=vm.createContext({crypto:webcrypto,TextEncoder,URL,fetch,setTimeout,clearTimeout,window,document:{getElementById:(id:string)=>nodes[id],createElement:()=>element()},CustomEvent:class {type:string;detail:any;constructor(t:string,opts:any){this.type=t;this.detail=opts.detail}}});
 dispatch=(message:any,source=parent)=>(listeners.message??[]).forEach(listener=>listener({source,data:{jsonrpc:'2.0',...message}}));
 const result=(data:any)=>dispatch({method:'ui/notifications/tool-result',params:{result:{structuredContent:{...data}}}});
 const respond=(id:number,result:any={})=>dispatch({id,result});
 vm.runInContext(buildPreviewBridgeScript().replaceAll("__MARKCUT_ORIGIN__",JSON.stringify("https://neoy.qili2.com")),context);
 events.length=0; // Ignore the initial Overall marker/selection render in tests about later events.
 return {messages,nodes,events,dispatch,result,respond,scene:(detail:any)=>(listeners['markcut:scene-change']||[]).forEach(listener=>listener({detail})),selectSpot:(id:number)=>(listeners['markcut:spot-select']||[]).forEach(listener=>listener({detail:{id}}))};
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
  expect(h.nodes.status.textContent).toBe('');
 });
 it("never reconstructs event destinations from another caller's path cache",async()=>{
  const path='/shared-video.md';
  const remote={id:'shared',revisionId:'rev1',contentHash:'a'.repeat(64),requestedPath:path,
    compiled:{children:[{name:'Shared'}]}};
  const h=harness(remote);
  h.dispatch({method:'ui/notifications/tool-input',params:{arguments:{path,
    review:{delivery:'event',eventTemplate:{type:'task.interactive_decision',
      source:'job/a/task/b/execution/c',data:{interactive:{jobId:'a',taskId:'b',executionId:'c',invocationId:'other'}}}}}}});
  for(let i=0;i<20&&!h.events.some(e=>e.detail?.revisionId==='rev1');i++)await nextTick();
  expect(h.events.some(e=>e.detail?.revisionId==='rev1')).toBe(true);
  expect(h.nodes.approve.disabled).toBe(true);
  h.nodes.approve.onclick?.();
  expect(h.messages.filter(m=>m.method==='tools/call'||m.method==='ui/message')).toHaveLength(0);
 });
 it('initializes, delivers compiled scenes and sends review directly to the caller',async()=>{
  const h=harness();
  expect(h.messages[0]).toMatchObject({id:1,method:'ui/initialize'});
  h.respond(1);
  await nextTick();
  expect(h.messages[1]).toMatchObject({method:'ui/notifications/initialized'});
  const compiled={width:640,height:480,fps:30,children:[{name:'Scene-A',durationInSeconds:2}]};
  h.result({id:'one',revisionId:'rev1',contentHash:'a'.repeat(64),path:'/tmp/a.md',compiled});
  expect(h.events.map(e=>e.type)).toEqual(['markcut:revision']);
  expect(h.events[0].detail.compiled).toEqual(compiled);
  expect(h.nodes['path-label'].textContent).toBe('/tmp/a.md');
  expect(h.nodes['video-md-version'].textContent).toBe('a');
  h.nodes.approve.onclick?.();
  expect(h.messages.filter(m=>m.method==='tools/call')).toHaveLength(0);
  await nextTick();
  const notification=h.messages.find(m=>m.method==='ui/message');
  expect(JSON.parse(notification.params.content[0].text)).toMatchObject({requestId:'rev1',previewId:'one',revisionId:'rev1',contentHash:'a'.repeat(64),path:'/tmp/a.md',decision:'approved',comments:[]});
  expect(JSON.parse(notification.params.content[0].text).idempotencyKey).toMatch(/^[a-f0-9-]{36}$/);
  h.respond(notification.id);
  await nextTick();
  expect(h.nodes.status.textContent).toBe('Review sent.');
 });
 it('shows Text mode by default, Event mode only with a provider-bound template',()=>{
  const h=harness();
  expect(h.nodes['review-delivery-mode'].textContent).toBe('Text mode');
  const eventTemplate={type:'task.interactive_decision',source:'job/1/task/2/execution/3',
    data:{interactive:{jobId:'1',taskId:'2',executionId:'3',invocationId:'i1'}}};
  h.dispatch({method:'ui/notifications/tool-input',params:{arguments:{path:'/test.md',review:{delivery:'event'}}}});
  expect(h.nodes['review-delivery-mode'].textContent).toBe('Event mode · unavailable');
  h.result({path:'/test.md',id:'one',revisionId:'r1',contentHash:'a'.repeat(64),
    compiled:{children:[]},review:{delivery:'event',eventTemplate}});
  expect(h.nodes['review-delivery-mode'].textContent).toBe('Event mode');
  h.result({path:'/test.md',id:'two',revisionId:'r2',contentHash:'b'.repeat(64),
    compiled:{children:[]},review:{delivery:'text'}});
  expect(h.nodes['review-delivery-mode'].textContent).toBe('Event mode · unavailable');
 });
 it('retries ui/message delivery errors and never reports success before delivery',async()=>{
  let failed=0;const h=harness(undefined,undefined,(m)=>{if(m.method==='ui/message'&&failed++<2)return {rpcError:{message:'temporary delivery failure'}};return {content:[]};});
  h.result({id:'retry',revisionId:'retry-r1',contentHash:'c'.repeat(64),path:'/retry.md',compiled:{children:[]}});
  h.nodes.approve.onclick?.();
  for(let i=0;i<80&&h.messages.filter(m=>m.method==='ui/message').length<3;i++)await new Promise(resolve=>setTimeout(resolve,10));
  expect(h.messages.filter(m=>m.method==='tools/call')).toHaveLength(0);
  expect(h.messages.filter(m=>m.method==='ui/message')).toHaveLength(3);
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
  a.nodes['save-spot'].onclick?.();
  a.nodes.changes.onclick?.();
  expect(JSON.parse(a.messages.find(m=>m.method==='ui/message').params.content[0].text)).toMatchObject({decision:'changes_requested',comments:[{scope:'overall',text:'Shorten the opening'}]});
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
  expect(second.messages.filter(m=>m.method==='tools/call')).toHaveLength(0);
 });
 it('preserves optional Relay job/task context across review decisions',async()=>{
  const h=harness();
  const relay={jobId:'job-7',taskId:19,executionId:'exec-1'};
  h.result({id:'r',revisionId:'r',contentHash:'hash',path:'/video.md',relay,compiled:{children:[]}});
  h.nodes.feedback.value='shorter title';h.nodes['save-spot'].onclick?.();h.nodes.changes.onclick?.();
  await nextTick();
  expect(JSON.parse(h.messages.find(m=>m.method==='ui/message').params.content[0].text).relay).toEqual(relay);
 });
 it('handles request changes followed by a new revision and approval in the same app',async()=>{
  const h=harness();h.respond(1);await nextTick();
  const first={id:'first',revisionId:'r1',contentHash:'sha1',path:'/video.md',compiled:{children:[{name:'First'}]}};
  const next={id:'second',revisionId:'r2',contentHash:'sha2',path:'/video.md',compiled:{children:[{name:'Next'}]}};
  h.result(first);
  h.nodes.feedback.value='lowercase title';h.nodes['save-spot'].onclick?.();h.nodes.changes.onclick?.();
  expect(JSON.parse(h.messages.find(m=>m.method==='ui/message').params.content[0].text)).toMatchObject({decision:'changes_requested'});
  await nextTick();
  h.respond(3);await nextTick();
  expect(h.nodes.status.textContent).toContain('Waiting for the updated preview');
  h.nodes.approve.onclick?.();
  expect(h.messages.filter(m=>m.method==='ui/message')).toHaveLength(1);
  h.result(next);
  h.nodes.approve.onclick?.();
  const decisions=h.messages.filter(m=>m.method==='ui/message').map(m=>JSON.parse(m.params.content[0].text));
  expect(decisions).toHaveLength(2);
  expect(decisions[1]).toMatchObject({contentHash:'sha2',decision:'approved'});
 });

});


 it('preselects Overall by default, with no extra comment-count row',()=>{
  const h=harness();
  expect(h.nodes['comment-mode'].value).toBe('spot');
  expect(h.nodes['comment-mode'].hidden).toBe(true);
  expect(h.nodes['review-delivery-mode'].textContent).toBe('Text mode');
  expect(h.nodes['overall-mode'].hidden).toBe(false);
  expect(h.nodes['remove-spot'].disabled).toBe(true);
  h.nodes.feedback.value='Overall note';h.nodes['save-spot'].onclick?.();
  let dots=h.events.filter(e=>e.type==='markcut:spots-change').at(-1).detail.spots;
  expect(dots.filter((x:any)=>x.scope==='overall')).toHaveLength(1);
  expect(dots[0].placeholder).toBeUndefined();
  h.nodes['remove-spot'].onclick?.();
  dots=h.events.filter(e=>e.type==='markcut:spots-change').at(-1).detail.spots;
  expect(dots[0]).toMatchObject({id:0,scope:'overall',placeholder:true});
 });
 it('toggles default Overall marker off and back on',()=>{
  const h=harness();
  expect(h.nodes['overall-mode'].hidden).toBe(false);
  h.selectSpot(0);
  let dots=h.events.filter(e=>e.type==='markcut:spots-change').at(-1).detail.spots;
  expect(dots[0].selected).toBe(false);
  expect(h.nodes['comment-mode'].hidden).toBe(false);
  expect(h.nodes['overall-mode'].hidden).toBe(true);
  expect(h.nodes.feedback.value).toBe('');
  h.selectSpot(0);
  expect(h.nodes['overall-mode'].hidden).toBe(false);
  expect(h.events.filter(e=>e.type==='markcut:spots-change').at(-1).detail.spots[0].selected).toBe(true);
 });
 it('auto-saves edits and new overall drafts when switching marker selection',()=>{
  const h=harness();
  h.selectSpot(0); // Leave default Overall to create timeline-specific spots.
  h.scene({sceneId:'s1',sceneName:'Scene-A',sceneStart:0,timeSeconds:0});
  h.nodes.feedback.value='First spot';h.nodes['save-spot'].onclick?.();
  h.scene({sceneId:'s1',sceneName:'Scene-A',sceneStart:0,timeSeconds:5});
  h.nodes.feedback.value='Second spot';h.nodes['save-spot'].onclick?.();
  let dots=h.events.filter(e=>e.type==='markcut:spots-change').at(-1).detail.spots;
  const first=dots.find((x:any)=>x.text==='First spot');
  const second=dots.find((x:any)=>x.text==='Second spot');
  h.selectSpot(first.id);
  h.nodes.feedback.value='Edited first spot';
  h.selectSpot(second.id);
  dots=h.events.filter(e=>e.type==='markcut:spots-change').at(-1).detail.spots;
  expect(dots.find((x:any)=>x.id===first.id)).toMatchObject({text:'Edited first spot',context:{timeSeconds:0}});
  expect(dots.find((x:any)=>x.id===second.id).selected).toBe(true);
  h.nodes.feedback.value='';h.selectSpot(first.id);
  dots=h.events.filter(e=>e.type==='markcut:spots-change').at(-1).detail.spots;
  expect(dots.find((x:any)=>x.id===second.id).text).toBe('Second spot');
  h.selectSpot(0);h.nodes.feedback.value='Overall draft';h.selectSpot(second.id);
  dots=h.events.filter(e=>e.type==='markcut:spots-change').at(-1).detail.spots;
  expect(dots.filter((x:any)=>x.scope==='overall')).toEqual([expect.objectContaining({text:'Overall draft'})]);
 });
 it('saves overall, scene and spot scopes at their canonical timeline positions',async()=>{
  const h=harness();h.result({id:'multi',revisionId:'r1',contentHash:'hash',compiled:{children:[]}});
  h.nodes.feedback.value='Improve pacing';h.nodes['save-spot'].onclick?.();
  h.selectSpot(0); // Deselect Overall before creating scene/spot comments.
  h.scene({sceneId:'s1',sceneName:'Scene-A',sceneStart:3,timeSeconds:4});
  h.nodes['comment-mode'].value='scene';
  h.nodes.feedback.value='Improve intro';h.nodes['save-spot'].onclick?.();
  h.nodes['comment-mode'].value='spot';
  h.nodes.feedback.value='Delay subtitle';h.nodes['save-spot'].onclick?.();
  const markers=h.events.filter(e=>e.type==='markcut:spots-change').at(-1).detail.spots;
  expect(markers.map((x:any)=>[x.scope,x.context.timeSeconds])).toEqual([['overall',0],['scene',3],['spot',4]]);
  expect(h.events.filter(e=>e.type==='markcut:comments-change').at(-1).detail.sceneNames).toEqual(['Scene-A']);
  h.nodes.approve.onclick?.();expect(h.nodes.status.textContent).toContain('Submit or remove');
  h.nodes.changes.onclick?.();
  await nextTick();
  const payload=JSON.parse(h.messages.filter(m=>m.method==='ui/message').at(-1).params.content[0].text);
  expect(payload.comments.map((x:any)=>x.scope)).toEqual(['overall','scene','spot']);
 });
 it('supports multiple timed notes on one scene and restores a saved note',async()=>{
  const h=harness();
  h.selectSpot(0);
  h.result({id:'spots',revisionId:'r1',contentHash:'hash',compiled:{children:[]}});
  h.scene({sceneId:'s1',sceneName:'Scene-A',timeSeconds:1});
  h.nodes.feedback.value='Trim opening';
  h.nodes['save-spot'].onclick?.();
  expect(h.nodes.feedback.value).toBe('');
  h.scene({sceneId:'s2',sceneName:'Scene-B',timeSeconds:5});
  h.scene({sceneId:'s1',sceneName:'Scene-A',timeSeconds:7});
  h.nodes.feedback.value='Keep reaction';
  h.nodes['save-spot'].onclick?.();
  const markers=h.events.filter(e=>e.type==='markcut:spots-change').at(-1).detail.spots;
  expect(markers).toHaveLength(3);
  expect(markers.filter((x:any)=>!x.placeholder).map((x:any)=>x.context.timeSeconds)).toEqual([1,7]);
  h.selectSpot(markers.find((x:any)=>!x.placeholder).id);
  expect(h.nodes.feedback.value).toBe('Trim opening');
  h.nodes.feedback.value='Trim first second';
  h.nodes['save-spot'].onclick?.();
  h.nodes.changes.onclick?.();
  await nextTick();
  const payload=JSON.parse(h.messages.at(-1).params.content[0].text);
  expect(payload.comments).toHaveLength(2);
  expect(payload.comments.map((x:any)=>x.text)).toContain('Trim first second');
  expect(payload.comments.map((x:any)=>x.text)).toContain('Keep reaction');
 });
 it('submits typed unsaved text immediately as Overall feedback without an extra plus click',async()=>{
  const h=harness();h.result({id:'draft',revisionId:'r',contentHash:'hash',compiled:{children:[]}});
  h.nodes.feedback.value='Keep this text';
  h.nodes.changes.onclick?.();
  await nextTick();
  const sent=h.messages.filter(m=>m.method==='ui/message');
  expect(sent).toHaveLength(1);
  expect(JSON.parse(sent[0].params.content[0].text)).toMatchObject({
    decision:'changes_requested',feedback:'Keep this text',comments:[{scope:'overall',text:'Keep this text'}]
  });
  expect(h.nodes.status.textContent).not.toContain('Add or remove');
 });
 it('deletes only the selected timeline marker',async()=>{
  const h=harness();
  h.selectSpot(0);h.result({id:'dots',revisionId:'r1',contentHash:'hash',compiled:{children:[]}});
  h.scene({sceneId:'s1',sceneName:'Scene-A',timeSeconds:1});
  h.nodes.feedback.value='First';h.nodes['save-spot'].onclick?.();
  h.scene({sceneId:'s2',sceneName:'Scene-B',timeSeconds:3});
  h.nodes.feedback.value='Second';h.nodes['save-spot'].onclick?.();
  const markers=h.events.filter(e=>e.type==='markcut:spots-change').at(-1).detail.spots;
  h.selectSpot(markers.find((x:any)=>!x.placeholder).id);
  expect(h.nodes['remove-spot'].disabled).toBe(false);
  h.nodes['remove-spot'].onclick?.();
  expect(h.nodes['remove-spot'].disabled).toBe(true);
  expect(h.events.filter(e=>e.type==='markcut:spots-change').at(-1).detail.spots).toHaveLength(2);
  h.nodes.changes.onclick?.();
  await nextTick();
  expect(JSON.parse(h.messages.at(-1).params.content[0].text).comments.map((x:any)=>x.text)).toEqual(['Second']);
 });
describe('static compiled-JSON bridge',()=>{
 const base='https://neoy.qili2.com/files/_neoy/markcut/cache/';
 const staticData={width:640,height:480,fps:30,children:[{name:'Static-Scene'}]};
 const makeFetch=(latestHash:string)=>async (url:string)=>{
  if(url.includes('/cache/'))return {ok:true,json:async()=>staticData};
  if(url.includes('/revisions/'))return {ok:true,json:async()=>({contentHash:latestHash})};
  return {ok:false,status:404,json:async()=>({})};
 };
 it('loads immutable JSON over HTTPS and enables review only for current hash',async()=>{
  const hash='a'.repeat(64),h=harness(undefined,makeFetch(hash));
  h.result({id:hash,revisionId:hash,contentHash:hash,path:'/tmp/video.md',
   compiledUrl:base+hash+'.json'});
  for(let i=0;i<5 && !h.events.length;i++)await nextTick();
  expect(h.events.at(-1)?.detail?.compiled.children[0].name).toBe('Static-Scene');
  await nextTick();
  expect(h.nodes.approve.disabled).toBe(false);
  h.nodes.approve.onclick?.();
  await nextTick();
  expect(h.messages.filter(m=>m.method==='ui/message')).toHaveLength(1);
 });
 it('shows historical previews but blocks review submission',async()=>{
  const hash='b'.repeat(64),h=harness(undefined,makeFetch('c'.repeat(64)));
  h.result({id:hash,revisionId:hash,contentHash:hash,path:'/tmp/video.md',
   compiledUrl:base+hash+'.json'});
  for(let i=0;i<5;i++)await nextTick();
  expect(h.events.at(-1)?.detail?.compiled.children[0].name).toBe('Static-Scene');
  expect(h.nodes.approve.disabled).toBe(true);
  expect(h.nodes.status.textContent).toContain('Historical Preview');
  h.nodes.approve.onclick?.();
  await nextTick();
  expect(h.messages.filter(m=>m.method==='ui/message')).toHaveLength(0);
 });
});

describe('async compilation UI transition',()=>{
 const origin='https://neoy.qili2.com/files/_neoy/markcut/';
 const hash='d'.repeat(64);
 const opId='12345678-1234-1234-1234-123456789abc';
 const operation={operationId:opId,operationUrl:origin+'operations/'+opId+'.json',path:'/tmp/video.md',requestedPath:'/tmp/video.md'};
 const compiled={width:640,height:480,fps:30,children:[{name:'Ready Scene'}]};
 it('keeps interactive controls hidden while compiling and reveals the player on ready',async()=>{
  let n=0;
  const fetch=async (url:string)=>{
   if(url.includes('/operations/')){
    n++;
    return {ok:true,json:async()=>n===1?{state:'compiling',stage:'generating-media',startedAt:Date.now()}:
      {state:'ready',result:{id:hash,revisionId:hash,contentHash:hash,path:'/tmp/video.md',compiledUrl:origin+'cache/'+hash+'.json'}}};
   }
   if(url.includes('/cache/'))return {ok:true,json:async()=>compiled};
   return {ok:true,json:async()=>({contentHash:hash})};
  };
  const h=harness(undefined,fetch);
  h.result(operation);
  expect(h.nodes['interactive-ui'].hidden).toBe(true);
  expect(h.nodes.approve.disabled).toBe(true);
  await nextTick();
  expect(h.nodes.status.textContent).toContain('generating-media');
  await new Promise(resolve=>setTimeout(resolve,1150));
  expect(h.events.at(-1)?.detail?.compiled.children[0].name).toBe('Ready Scene');
  expect(h.nodes['interactive-ui'].hidden).toBe(false);
  expect(h.nodes.approve.disabled).toBe(false);
 });
 it('keeps player hidden on a failed compile',async()=>{
  const h=harness(undefined,async()=>({ok:true,json:async()=>({state:'failed',error:'TTS unavailable'})}));
  h.result(operation);
  await nextTick();
  expect(h.nodes['interactive-ui'].hidden).toBe(true);
  expect(h.nodes.approve.disabled).toBe(true);
  expect(h.nodes.status.textContent).toContain('TTS unavailable');
 });
});

describe('Review event delivery',()=>{
 const template={type:'task.interactive_decision',
  source:'job/551/task/producer/execution/e1',data:{interactive:{jobId:'551',taskId:'producer',executionId:'e1',invocationId:'review-551'},purpose:'video'}};
 const media={id:'video1',requestId:'d9b2006a-0618-45aa-a3d8-31363fa629ca',revisionId:'rv1',
   contentHash:'a'.repeat(64),path:'/tmp/video.md',compiled:{children:[]},review:{delivery:'event',commitSha:'c'.repeat(40),eventTemplate:template}};
 it('does not publish until explicit Submit, preserves fixed envelope and scoped comments',async()=>{
  const h=harness(undefined,undefined, m=> m.method==='tools/call'?{published:true,event:{event_id:'ack'}}:undefined);
  h.result(media);h.selectSpot(0);h.scene({sceneId:'intro',timeSeconds:2.25,sceneStart:0});
  h.nodes.feedback.value='Trim opening';h.nodes['save-spot'].onclick?.();
  expect(h.messages.filter(m=>m.method==='tools/call')).toHaveLength(0);
  h.nodes.changes.onclick?.();await nextTick();
  const calls=h.messages.filter(m=>m.method==='tools/call');
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({params:{name:'events',arguments:{command:'publish',
    args:{type:template.type,source:template.source,data:{purpose:'video',
      interactive:{jobId:'551',taskId:'producer',executionId:'e1',invocationId:'review-551',
        requestId:media.requestId,revision:'c'.repeat(40),commitSha:'c'.repeat(40),
        decision:'changes_requested',feedback:'Trim opening',comments:[{sceneId:'intro',timeSeconds:2.25,text:'Trim opening'}]}}}}}});
  expect(h.messages.filter(m=>m.method==='ui/message')).toHaveLength(0);
  expect(h.nodes.status.textContent).toContain('submitted');
 });
 it('rejects legacy Markcut event templates instead of publishing or falling back to messages',async()=>{
  const legacy={...template,type:'markcut.review.submitted'};
  const h=harness(undefined,undefined,m=>m.method==='tools/call'?{published:true}:undefined);
  h.result({...media,review:{delivery:'event',eventTemplate:legacy}});
  h.nodes.approve.onclick?.();await nextTick();
  expect(h.nodes.status.textContent).toContain('Review not submitted');
  expect(h.messages.filter(m=>m.method==='tools/call'||m.method==='ui/message')).toHaveLength(0);
 });
 it('fails visibly without host Events access and reuses the idempotency key on retry',async()=>{
  const h=harness(undefined,undefined,m=>m.method==='tools/call'?{rpcError:{message:'Host denies cross-server tool'}}:undefined);
  h.result(media);h.nodes.approve.onclick?.();await nextTick();await nextTick();
  expect(h.nodes.status.textContent).toContain('Review not submitted');
  h.nodes.approve.onclick?.();await nextTick();await nextTick();
  const calls=h.messages.filter(m=>m.method==='tools/call');
  expect(calls).toHaveLength(2);
  expect(calls[0].params.arguments.args.data.interactive.idempotencyKey)
    .toBe(calls[1].params.arguments.args.data.interactive.idempotencyKey);
  expect(h.messages.filter(m=>m.method==='ui/message')).toHaveLength(0);
 });
 it('rejects non-acknowledging host and prevents a second submit after acceptance',async()=>{
  let accepted=false;
  const h=harness(undefined,undefined,m=>m.method==='tools/call'?{published:accepted}:undefined);
  h.result(media);h.nodes.approve.onclick?.();await nextTick();await nextTick();
  expect(h.nodes.status.textContent).toContain('not submitted');
  accepted=true;h.nodes.approve.onclick?.();await nextTick();await nextTick();
  h.nodes.approve.onclick?.();
  expect(h.messages.filter(m=>m.method==='tools/call')).toHaveLength(2);
 });
});
