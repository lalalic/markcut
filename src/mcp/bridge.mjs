export function buildPreviewBridgeScript(submitToolName) {
  return `
const feedback=document.getElementById('feedback'),status=document.getElementById('status'),player=document.getElementById('video-player'),pathLabel=document.getElementById('path-label');
let nextRequestId=0;
const pendingRequests=new Map();
function send(message){window.parent.postMessage(message,'*');}
function rpcRequest(method,params){const id=++nextRequestId;send({jsonrpc:'2.0',id,method,params});return new Promise((resolve,reject)=>pendingRequests.set(id,{resolve,reject}));}
async function waitForVideo(url){status.textContent='Preparing video…';for(;;){try{const response=await fetch(url+'api/ready',{cache:'no-store'});if(response.ok){const ready=await response.json();if(ready.ready){player.src=url;status.textContent='Video ready for review.';return;}}}catch{}await new Promise(resolve=>setTimeout(resolve,1500));}}
function applyToolResult(params){const result=params?.result||params||{},data=result.structuredContent||result.structured_content||{};if(typeof data.path==='string')pathLabel.textContent=data.path;if(typeof data.previewUrl==='string')waitForVideo(data.previewUrl);}
window.addEventListener('message',event=>{if(event.source!==window.parent)return;const message=event.data;if(!message||typeof message!=='object'||message.jsonrpc!=='2.0')return;if(Object.prototype.hasOwnProperty.call(message,'id')&&pendingRequests.has(message.id)){const pending=pendingRequests.get(message.id);pendingRequests.delete(message.id);if(message.error)pending.reject(new Error(message.error.message||'MCP request failed'));else pending.resolve(message.result);return;}if(message.method==='ui/notifications/tool-result')applyToolResult(message.params);});
async function initializeBridge(){try{await rpcRequest('ui/initialize',{appInfo:{name:'Markcut Preview',version:'1.1.0'},appCapabilities:{},protocolVersion:'2026-01-26'});send({jsonrpc:'2.0',method:'ui/notifications/initialized'});if(!player.src)status.textContent='Waiting for video preview…';}catch(error){status.textContent=error.message||'MCP initialization failed.';}}
async function submit(decision){const value=feedback.value.trim();if(decision==='changes_requested'&&!value){status.textContent='Feedback is required.';feedback.focus();return;}const result={decision};if(value&&decision==='changes_requested')result.feedback=value;status.textContent='Submitting...';try{await rpcRequest('tools/call',{name:'${submitToolName}',arguments:result});await rpcRequest('ui/message',{role:'user',content:[{type:'text',text:JSON.stringify(result)}]});status.textContent=decision==='approved'?'Approved.':'Changes requested.';}catch(error){status.textContent=error.message||'Unable to submit review.';}}
initializeBridge();
document.getElementById('approve').onclick=()=>submit('approved');document.getElementById('changes').onclick=()=>submit('changes_requested');
`;
}
