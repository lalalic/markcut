export function buildPreviewBridgeScript() {
return `
const feedback=document.getElementById('feedback'),status=document.getElementById('status'),pathLabel=document.getElementById('path-label');
let nextId=0,identity=null,busy=false,expectedPath=null,activePath=null,activeRelay=null,submittedRevision=null;
const pending=new Map();
const resultsByPath=new Map();
function send(msg){window.parent.postMessage(msg,'*');}
function request(method,params){const id=++nextId;send({jsonrpc:'2.0',id,method,params});return new Promise((resolve,reject)=>pending.set(id,{resolve,reject}));}
function applyToolInput(params){
 const input=params?.arguments||params?.input||params?.toolInput||params||{};
 if(typeof input.path!=='string')return;
 expectedPath=input.path;
 const cached=resultsByPath.get(expectedPath);
 if(cached){renderRevision(cached);return;}
 if(window.__markcutRevision?.path!==expectedPath){
  identity=null;
  window.__markcutRevision=null;
  window.dispatchEvent(new CustomEvent('markcut:revision',{detail:null}));
  pathLabel.textContent=expectedPath;
  status.textContent='Waiting for matching video scenes…';
 }
}
function applyToolResult(params){
 const result=params?.result||params||{};
 const data=result.structuredContent||result.structured_content||result._meta?.ui?.props||{};
 if(typeof data.path==='string')resultsByPath.set(data.path,data);
 if(expectedPath&&data.path!==expectedPath)return;
 renderRevision(data);
}
function renderRevision(data){
 if(data.path)pathLabel.textContent=data.path;
 if(!data.compiled){status.textContent='Compiled Remotion scenes unavailable';return;}
 identity={previewId:data.id,revisionId:data.revisionId,contentHash:data.contentHash};
 activePath=data.path||expectedPath||null;
 activeRelay=data.relay||null;
 if(submittedRevision!==data.revisionId){busy=false;submittedRevision=null;}
 window.__markcutRevision=data;
 window.dispatchEvent(new CustomEvent('markcut:revision',{detail:data}));
 status.textContent='Remotion scenes loaded for review.';
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
