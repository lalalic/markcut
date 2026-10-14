export function buildPreviewBridgeScript() {
return `
const feedback=document.getElementById('feedback'),status=document.getElementById('status'),pathLabel=document.getElementById('path-label');
let nextId=0,identity=null,busy=false;
const pending=new Map();
function send(msg){window.parent.postMessage(msg,'*');}
function request(method,params){const id=++nextId;send({jsonrpc:'2.0',id,method,params});return new Promise((resolve,reject)=>pending.set(id,{resolve,reject}));}
function applyToolResult(params){
 const result=params?.result||params||{};
 const data=result.structuredContent||result.structured_content||result._meta?.ui?.props||{};
 if(data.path)pathLabel.textContent=data.path;
 if(!data.compiled){status.textContent='Compiled Remotion scenes unavailable';return;}
 identity={previewId:data.id,revisionId:data.revisionId,contentHash:data.contentHash};
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
 }else if(message.method==='ui/notifications/tool-result')applyToolResult(message.params);
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
 if(decision==='changes_requested')result.feedback=value;
 busy=true;status.textContent='Submitting…';
 try{await request('ui/message',{role:'user',content:[{type:'text',text:JSON.stringify(result)}]});status.textContent=decision==='approved'?'Approved.':'Changes requested.';}
 catch(e){busy=false;status.textContent=e.message||'Unable to submit review';}
}
document.getElementById('approve').onclick=()=>submit('approved');
document.getElementById('changes').onclick=()=>submit('changes_requested');
initialize();
`;
}
