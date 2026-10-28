export function buildPreviewBridgeScript() {
return `
const feedback=document.getElementById('feedback'),status=document.getElementById('status'),pathLabel=document.getElementById('path-label');
let nextId=0,identity=null,busy=false,expectedPath=null,activePath=null,activeRelay=null,submittedRevision=null;
const comments=[];
let currentScene={sceneId:null,sceneName:null,sceneStart:0,timeSeconds:0},selectedId=null,nextCommentId=0;
const mode=document.getElementById('comment-mode');
const sceneKey=c=>String(c?.sceneName||c?.sceneId||'Overall');
function allComments(){
 return comments.filter(x=>x.text.trim()).map(({scope,text,context})=>({scope,text:text.trim(),playbackContext:context}));
}
function redrawComments(){
 const names=[...new Set(comments.filter(x=>x.text.trim()&&x.scope!=='overall').map(x=>sceneKey(x.context)))];
 window.dispatchEvent(new CustomEvent('markcut:comments-change',{detail:{sceneNames:names}}));
 const count=document.getElementById('comment-count');
 if(count)count.textContent=comments.length+' comment'+(comments.length===1?'':'s');
 const remove=document.getElementById('remove-spot');
 if(remove)remove.disabled=selectedId===null||selectedId===0;
 const overall=selectedId===0||comments.some(x=>x.id===selectedId&&x.scope==='overall');
 mode.hidden=overall;document.getElementById('overall-mode').hidden=!overall;
 const spots=comments.map(x=>({...x,selected:x.id===selectedId}));
 if(!spots.some(x=>x.scope==='overall'))spots.unshift({id:0,scope:'overall',text:'',context:{timeSeconds:0},selected:selectedId===0,placeholder:true});
 window.dispatchEvent(new CustomEvent('markcut:spots-change',{detail:{spots}}));
}
function clearComments(){
 comments.length=0;selectedId=null;currentScene={sceneId:null,sceneName:null,sceneStart:0,timeSeconds:0};feedback.value='';mode.value='spot';redrawComments();
}
window.addEventListener('markcut:scene-change',event=>{currentScene={...(event.detail||{})};});
function autoSaveBeforeSwitch(){
 const value=feedback.value.trim();
 if(!value)return true; // Empty text never implicitly deletes a saved comment; use −.
 const existing=comments.find(x=>x.id===selectedId);
 if(existing){
  existing.text=value;
  if(existing.scope!=='overall'){
   existing.scope=mode.value;
   if(existing.scope==='scene')existing.context.timeSeconds=Number(existing.context.sceneStart)||0;
  }
  return true;
 }
 const scope=selectedId===0?'overall':mode.value;
 const live=window.__markcutPlaybackContext||currentScene;
 if(scope!=='overall'&&!live.sceneId&&!live.sceneName){status.textContent='Choose a scene first.';return false;}
 comments.push({id:++nextCommentId,scope,text:value,context:scope==='overall'?{sceneId:null,sceneName:null,timeSeconds:0}:
  {...live,timeSeconds:scope==='scene'?(Number(live.sceneStart)||0):(Number(live.timeSeconds)||0)}});
 return true;
}
window.addEventListener('markcut:spot-select',event=>{
 const id=event.detail?.id;
 if(!comments.some(x=>x.id===id)&&id!==0)return;
 if(!autoSaveBeforeSwitch())return;
 const targetId=id===0?(comments.find(x=>x.scope==='overall')?.id??0):id;
 const note=comments.find(x=>x.id===targetId);
 if(selectedId===targetId){
  selectedId=null;feedback.value='';redrawComments();return;
 }
 selectedId=targetId;feedback.value=note?.text||'';if(note&&note.scope!=='overall')mode.value=note.scope;
 if(note&&note.scope!=='overall')window.dispatchEvent(new CustomEvent('markcut:comment-select',{detail:note.context}));
 redrawComments();
});
mode.onchange=()=>redrawComments();
document.getElementById('remove-spot').onclick=()=>{
 if(selectedId===null)return;
 const at=comments.findIndex(x=>x.id===selectedId);
 if(at>=0)comments.splice(at,1);
 selectedId=null;feedback.value='';
 redrawComments();
};
document.getElementById('save-spot').onclick=()=>{
 const value=feedback.value.trim(),scope=(selectedId===0||comments.some(x=>x.id===selectedId&&x.scope==='overall'))?'overall':mode.value;
 if(!value){status.textContent='Write a comment first.';return;}
 const live=window.__markcutPlaybackContext||currentScene;
 if(scope!=='overall'&&!live.sceneId&&!live.sceneName){status.textContent='Choose a scene first.';return;}
 const context=scope==='overall'?{sceneId:null,sceneName:null,timeSeconds:0}:
  {...live,timeSeconds:scope==='scene'?(Number(live.sceneStart)||0):(Number(live.timeSeconds)||0)};
 if(selectedId!==null&&selectedId!==0){
  const note=comments.find(x=>x.id===selectedId);
  if(note){note.text=value;note.scope=scope;note.context=context;}
 }else comments.push({id:++nextCommentId,scope,text:value,context});
 selectedId=null;feedback.value='';status.textContent='';redrawComments();
};
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
 if(identity?.revisionId&&identity.revisionId!==data.revisionId)clearComments();
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
  status.textContent='';
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
 if(feedback.value.trim()&&(selectedId===null||comments.find(x=>x.id===selectedId)?.text!==feedback.value.trim())){status.textContent='Add or remove the current comment before submitting.';return;}
 const preparedComments=allComments();
 if(decision==='changes_requested'&&!preparedComments.length){status.textContent='Feedback is required.';return;}
 if(decision==='approved'&&preparedComments.length){status.textContent='Submit or remove draft comments before approval.';return;}
 if(!identity){status.textContent='Preview identity unavailable.';return;}
 if(window.__markcutRevision?.compiledUrl){
  try{if(!await currentRevisionMatches(activePath,identity.contentHash)){reviewReadonly(true,'Historical Preview · Read-only');return;}}
  catch(e){reviewReadonly(true,'Cannot verify latest preview: '+String(e));return;}
 }
 const result={...identity,decision};
 if(activePath)result.path=activePath;
 if(activeRelay)result.relay=activeRelay;
 if(decision==='changes_requested'){
  result.comments=preparedComments;
  result.feedback=preparedComments.length===1?preparedComments[0].text:preparedComments.map((item,index)=>String(index+1)+'. ['+sceneKey(item.playbackContext)+' @ '+(item.playbackContext.timeSeconds??0)+'s] '+item.text).join('\\n');
  if(window.__markcutPlaybackContext)result.playbackContext=window.__markcutPlaybackContext;
 }
 busy=true;status.textContent='Submitting…';
 const submittedId=result.revisionId;
 try{await request('ui/message',{role:'user',content:[{type:'text',text:JSON.stringify(result)}]});if(identity?.revisionId===submittedId){submittedRevision=submittedId;status.textContent=decision==='approved'?'Approved.':'Feedback sent. Waiting for the updated preview.';}}
 catch(e){busy=false;status.textContent=e.message||'Unable to submit review';}
}
document.getElementById('approve').onclick=()=>submit('approved');
document.getElementById('changes').onclick=()=>submit('changes_requested');
initialize();
`;
}
