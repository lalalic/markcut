export function buildPreviewBridgeScript() {
  return `
const feedback=document.getElementById('feedback'),status=document.getElementById('status'),player=document.getElementById('video-player'),pathLabel=document.getElementById('path-label');
let nextRequestId=0;
const pendingRequests=new Map();
let previewIdentity=null,reviewBusy=false;
function send(message){window.parent.postMessage(message,'*');}
function rpcRequest(method,params){const id=++nextRequestId;send({jsonrpc:'2.0',id,method,params});return new Promise((resolve,reject)=>pendingRequests.set(id,{resolve,reject}));}
function loadEmbeddedVideo(){const encoded=player.dataset.videoBase64;if(!encoded)return;const binary=atob(encoded);const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);player.removeAttribute('data-video-base64');player.src=URL.createObjectURL(new Blob([bytes],{type:'video/mp4'}));player.load();}
function videoReady(){status.textContent=player.readyState>=1?'Video ready for review.':player.getAttribute('src')?'Loading embedded video…':'Waiting for embedded video…';}
player.addEventListener('loadedmetadata',()=>{status.textContent='Video ready for review.';});
player.addEventListener('error',()=>{status.textContent='Video playback error (code '+(player.error?.code||'unknown')+').';});
player.addEventListener('stalled',()=>{status.textContent='Video loading stalled.';});
function applyToolResult(params){const result=params?.result||params||{},data=result.structuredContent||result.structured_content||{};if(typeof data.path==='string')pathLabel.textContent=data.path;if(typeof data.previewUrl==='string'){previewIdentity={previewId:data.id,revisionId:data.revisionId,contentHash:data.contentHash};videoReady();}}
window.addEventListener('message',event=>{if(event.source!==window.parent)return;const message=event.data;if(!message||typeof message!=='object'||message.jsonrpc!=='2.0')return;if(Object.prototype.hasOwnProperty.call(message,'id')&&pendingRequests.has(message.id)){const pending=pendingRequests.get(message.id);pendingRequests.delete(message.id);if(message.error)pending.reject(new Error(message.error.message||'MCP request failed'));else pending.resolve(message.result);return;}if(message.method==='ui/notifications/tool-result')applyToolResult(message.params);});
async function initializeBridge(){try{await rpcRequest('ui/initialize',{appInfo:{name:'Markcut Preview',version:'1.1.0'},appCapabilities:{},protocolVersion:'2026-01-26'});send({jsonrpc:'2.0',method:'ui/notifications/initialized'});videoReady();}catch(error){status.textContent=error.message||'MCP initialization failed.';}}
async function submit(decision){if(reviewBusy)return;const value=feedback.value.trim();if(decision==='changes_requested'&&!value){status.textContent='Feedback is required.';feedback.focus();return;}if(!previewIdentity?.previewId){status.textContent='Preview identity unavailable.';return;}const result={...previewIdentity,decision};if(value&&decision==='changes_requested')result.feedback=value;reviewBusy=true;status.textContent='Submitting...';try{await rpcRequest('ui/message',{role:'user',content:[{type:'text',text:JSON.stringify(result)}]});status.textContent=decision==='approved'?'Approved.':'Changes requested.';}catch(error){status.textContent=error.message||'Unable to submit review.';reviewBusy=false;}}
loadEmbeddedVideo();
initializeBridge();
document.getElementById('approve').onclick=()=>submit('approved');document.getElementById('changes').onclick=()=>submit('changes_requested');
`;
}
