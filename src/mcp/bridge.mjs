export function buildPreviewBridgeScript() {
return `
const feedback=document.getElementById('feedback'),status=document.getElementById('status'),pathLabel=document.getElementById('path-label');
let nextId=0,identity=null,busy=false,expectedPath=null,activePath=null,activeRelay=null,submittedRevision=null;
const pending=new Map();
const resultsByPath=new Map();
let fallbackGeneration=0;
async function loadRemoteScenes(path){
 const generation=++fallbackGeneration;
 try{
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(path));
  const hash=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
  const url=__MARKCUT_ORIGIN__+'/files/_neoy/markcut/revisions/'+hash+'.json';
  for(let attempt=0;attempt<25 && generation===fallbackGeneration;attempt++){
   try{
    const response=await fetch(url+'?try='+attempt,{cache:'no-store'});
    if(response.ok){const data=await response.json();
      if(data.requestedPath===path && (data.compiledUrl||data.compiled) && generation===fallbackGeneration){
       if(window.__markcutRevision?.requestedPath===path)return;
       resultsByPath.set(path,data);renderRevision(data);return;
      }
    }
   }catch(e){if(attempt===24)status.textContent='Scene fetch failed: '+String(e);}
   await new Promise(resolve=>setTimeout(resolve,600));
  }
  if(generation===fallbackGeneration && !window.__markcutRevision)status.textContent='Scene data unavailable from NeoY';
 }catch(e){status.textContent='Scene lookup failed: '+String(e);}
}
function send(msg){window.parent.postMessage(msg,'*');}
function request(method,params){const id=++nextId;send({jsonrpc:'2.0',id,method,params});return new Promise((resolve,reject)=>pending.set(id,{resolve,reject}));}
function showVideoName(path,title){const el=document.getElementById('video-md-version');if(!el)return;const file=typeof path==='string'?decodeURIComponent(path.split('/').pop()||'video.md'):'video.md';el.textContent=typeof title==='string'&&title.trim()?title.trim():file.replace(/\.md$/i,'').replace(/[-_]+/g,' ');}
function applyToolInput(params){
 const input=params?.arguments||params?.input||params?.toolInput||params||{};
 if(typeof input.path!=='string')return;
 expectedPath=input.path;
 loadRemoteScenes(expectedPath);
 showVideoName(expectedPath);
 const cached=resultsByPath.get(expectedPath);
 if(cached){if(cached.operationUrl)trackOperation(cached);else renderRevision(cached);return;}
 if(window.__markcutRevision?.path!==expectedPath && window.__markcutRevision?.requestedPath!==expectedPath){
  identity=null;
  window.__markcutRevision=null;
  window.dispatchEvent(new CustomEvent('markcut:revision',{detail:null}));
  pathLabel.textContent=expectedPath;
  status.textContent='Waiting for matching video scenes…';
 }
}
let operationGeneration=0;
async function trackOperation(data){
 const generation=++operationGeneration;
 ++fallbackGeneration; // Prevent an old published revision from replacing in-progress UI.
 let url;
 try{url=new URL(data.operationUrl);}catch{status.textContent='Invalid operation URL';return;}
 if(url.origin!==__MARKCUT_ORIGIN__||!url.pathname.startsWith('/files/_neoy/markcut/operations/')||!(/^[a-f0-9-]{36}[.]json$/.test(url.pathname.split('/').pop()))){
  status.textContent='Invalid operation URL';return;
 }
 document.getElementById('interactive-ui').hidden=true;
 reviewReadonly(true,'Compiling…');
 for(let attempt=0;attempt<1800&&generation===operationGeneration;attempt++){
  try{
   const response=await fetch(url.href+'?t='+Date.now(),{cache:'no-store'});
   if(!response.ok)throw new Error('HTTP '+response.status);
   const progress=await response.json();
   if(generation!==operationGeneration)return;
   if(progress.state==='ready'&&progress.result){renderRevision({...progress.result,requestedPath:data.requestedPath||data.path,relay:data.relay});return;}
   if(progress.state==='failed'){reviewReadonly(true,'Compilation failed: '+progress.error);return;}
   const elapsed=Math.round((Date.now()-(progress.startedAt||Date.now()))/1000);
   status.textContent='Compiling · '+(progress.stage||'working')+' · '+elapsed+'s';
  }catch(e){status.textContent='Waiting for compile status… '+String(e);}
  await new Promise(resolve=>setTimeout(resolve,1000));
 }
 if(generation===operationGeneration)status.textContent='Compilation status timed out';
}
function applyToolResult(params){
 const result=params?.result||params||{};
 const data=result.structuredContent||result.structured_content||result._meta?.ui?.props||{};
 if(typeof data.path==='string')resultsByPath.set(data.path,data);
 if(typeof data.requestedPath==='string')resultsByPath.set(data.requestedPath,data);
 if(expectedPath&&data.path!==expectedPath&&data.requestedPath!==expectedPath)return;
 if(data.operationUrl){trackOperation(data);return;}
 renderRevision(data);
}
let renderGeneration=0;
async function currentRevisionMatches(path,hash){
 if(!path||!hash)return false;
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(path));
 const key=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
 const response=await fetch(__MARKCUT_ORIGIN__+'/files/_neoy/markcut/revisions/'+key+'.json?t='+Date.now(),{cache:'no-store'});
 if(!response.ok)throw new Error('Latest preview status unavailable');
 const latest=await response.json();
 return latest.contentHash===hash;
}
function reviewReadonly(readonly,message){
 document.getElementById('approve').disabled=readonly;
 document.getElementById('changes').disabled=readonly;
 if(readonly&&message)status.textContent=message;
}
async function renderRevision(data){
 const generation=++renderGeneration;
 if(data.path){pathLabel.textContent=data.path;showVideoName(data.path,data.title||data.videoTitle);}
 if(!data.compiled&&!data.compiledUrl){status.textContent='Compiled scenes unavailable';return;}
 identity={previewId:data.id,revisionId:data.revisionId,contentHash:data.contentHash};
 activePath=data.requestedPath||data.path||expectedPath||null;
 activeRelay=data.relay||null;
 if(submittedRevision!==data.revisionId){busy=false;submittedRevision=null;}
 reviewReadonly(true,'Loading static compiled scenes…');
 try{
  let compiled=data.compiled;
  if(data.compiledUrl){
   const url=new URL(data.compiledUrl);
   if(url.origin!==__MARKCUT_ORIGIN__||!url.pathname.startsWith('/files/_neoy/markcut/cache/')||!(/^[a-f0-9]{64}[.]json$/.test(url.pathname.split('/').pop())))
    throw new Error('Invalid immutable preview URL');
   const response=await fetch(url.href,{cache:'force-cache'});
   if(!response.ok)throw new Error('Static compiled scenes unavailable: HTTP '+response.status);
   compiled=await response.json();
  }
  if(generation!==renderGeneration)return;
  document.getElementById('interactive-ui').hidden=false;
  window.__markcutRevision={...data,compiled};
  window.dispatchEvent(new CustomEvent('markcut:revision',{detail:window.__markcutRevision}));
  status.textContent=data.compiledUrl?'Static scenes loaded.':'Remotion scenes loaded for review.';
  if(!data.compiledUrl){reviewReadonly(false);return;}
  const same=await currentRevisionMatches(activePath,identity.contentHash);
  if(generation!==renderGeneration)return;
  reviewReadonly(!same,same?'':'Historical Preview · Read-only');
 }catch(e){
  if(generation!==renderGeneration)return;
  reviewReadonly(true,'Preview unavailable or review state unverified: '+String(e));
 }
}
window.addEventListener('message',event=>{
 if(event.source!==window.parent)return;
 const message=event.data;
 if(!message||message.jsonrpc!=='2.0')return;
 if(Object.prototype.hasOwnProperty.call(message,'id')&&pending.has(message.id)){
  const item=pending.get(message.id);pending.delete(message.id);
  if(message.error)item.reject(new Error(message.error.message||'MCP request failed'));
  else item.resolve(message.result);
 }else if(message.method==='ui/notifications/tool-input')applyToolInput(message.params);
 else if(message.method==='ui/notifications/tool-result')applyToolResult(message.params);
});
async function initialize(){
 try {await request('ui/initialize',{appInfo:{name:'Markcut Preview',version:'2.0.0'},appCapabilities:{},protocolVersion:'2026-01-26'});send({jsonrpc:'2.0',method:'ui/notifications/initialized'});}
 catch(e){status.textContent=e.message||'MCP initialization failed';}
}
async function submit(decision){
 if(busy)return;
 const value=feedback.value.trim();
 if(decision==='changes_requested'&&!value){status.textContent='Feedback is required.';return;}
 if(!identity){status.textContent='Preview identity unavailable.';return;}
 if(window.__markcutRevision?.compiledUrl){
  try{if(!await currentRevisionMatches(activePath,identity.contentHash)){reviewReadonly(true,'Historical Preview · Read-only');return;}}
  catch(e){reviewReadonly(true,'Cannot verify latest preview: '+String(e));return;}
 }
 const result={...identity,decision};
 if(activePath)result.path=activePath;
 if(activeRelay)result.relay=activeRelay;
 if(decision==='changes_requested')result.feedback=value;
 busy=true;status.textContent='Submitting…';
 const submittedId=result.revisionId;
 try{await request('ui/message',{role:'user',content:[{type:'text',text:JSON.stringify(result)}]});if(identity?.revisionId===submittedId){submittedRevision=submittedId;status.textContent=decision==='approved'?'Approved.':'Changes requested. Waiting for the updated preview.';}}
 catch(e){busy=false;status.textContent=e.message||'Unable to submit review';}
}
document.getElementById('approve').onclick=()=>submit('approved');
document.getElementById('changes').onclick=()=>submit('changes_requested');
initialize();
`;
}
