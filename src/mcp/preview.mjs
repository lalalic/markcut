import { readFile } from "node:fs/promises";
import { isAbsolute, extname } from "node:path";

export const TOOL_NAME = "markcut.preview";
export const SUBMIT_TOOL_NAME = "markcut.preview.submit";
export const RESOURCE_URI = "ui://markcut/markdown-preview.html";

export function validateMarkdownPath(value) {
  if (typeof value !== "string" || !isAbsolute(value)) {
    throw new Error("path must be an absolute filesystem path");
  }
  if (extname(value).toLowerCase() !== ".md") {
    throw new Error("path must point to a Markdown file (.md)");
  }
  return value;
}

export async function readMarkdownPreview(path) {
  const validatedPath = validateMarkdownPath(path);
  try {
    return { path: validatedPath, markdown: await readFile(validatedPath, "utf8") };
  } catch (error) {
    throw new Error(`unable to read Markdown file: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function reviewResult(decision, feedback = "") {
  if (decision === "approved") return { decision };
  if (decision === "changes_requested") {
    const normalized = typeof feedback === "string" ? feedback.trim() : "";
    if (!normalized) throw new Error("feedback is required when requesting changes");
    return { decision, feedback: normalized };
  }
  throw new Error(`unsupported review decision: ${String(decision)}`);
}

export function reviewMessage(result) {
  const normalized = reviewResult(result?.decision, result?.feedback);
  return {
    jsonrpc: "2.0",
    method: "ui/message",
    params: {
      role: "user",
      content: [{ type: "text", text: JSON.stringify(normalized) }],
    },
  };
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function renderMarkdown(markdown) {
  return markdown.split(/\r?\n/).map((line) => {
    const escaped = escapeHtml(line);
    if (line.startsWith("### ")) return `<h3>${escaped.slice(4)}</h3>`;
    if (line.startsWith("## ")) return `<h2>${escaped.slice(3)}</h2>`;
    if (line.startsWith("# ")) return `<h1>${escaped.slice(2)}</h1>`;
    if (line.startsWith("- ")) return `<li>${escaped.slice(2)}</li>`;
    return line.trim() ? `<p>${escaped}</p>` : "";
  }).join("\n");
}

export function buildPreviewHtml({ path = "", markdown = "" }) {
  const safePath = escapeHtml(path);
  const rendered = renderMarkdown(markdown);
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>MarkCut Markdown review</title>
<style>body{font:15px system-ui,sans-serif;margin:0;padding:24px;color:#17202a;background:#fff}main{max-width:860px;margin:auto}article{border:1px solid #d8dee4;border-radius:8px;padding:20px;overflow:auto}h1,h2,h3{margin-top:0}p{line-height:1.5}textarea{box-sizing:border-box;width:100%;min-height:100px;margin:16px 0 10px;padding:10px;border:1px solid #8c959f;border-radius:6px;font:inherit}button{border:0;border-radius:6px;padding:9px 14px;margin-right:8px;font:inherit;cursor:pointer}#approve{background:#1f883d;color:#fff}#changes{background:#cf222e;color:#fff}#status{min-height:1.4em;color:#cf222e}</style></head>
<body><main><h1>Review Markdown</h1><p><code>${safePath}</code></p><article>${rendered}</article>
<label for="feedback">Feedback (required for requested changes)</label><textarea id="feedback" placeholder="What should be changed?"></textarea><div id="status" role="status"></div>
<button id="approve">Approve</button><button id="changes">Request changes</button></main>
<script>
const feedback=document.getElementById('feedback'),status=document.getElementById('status'),article=document.querySelector('article'),pathLabel=document.querySelector('main>p code');
let requestId=0,initialized=false;
function send(message){window.parent.postMessage(message,'*');}
function submit(decision){const value=feedback.value.trim();if(decision==='changes_requested'&&!value){status.textContent='Feedback is required.';feedback.focus();return;}const result={decision};if(value&&decision==='changes_requested')result.feedback=value;
  send({jsonrpc:'2.0',id:++requestId,method:'tools/call',params:{name:'${SUBMIT_TOOL_NAME}',arguments:result}});
  send({jsonrpc:'2.0',method:'ui/message',params:{role:'user',content:[{type:'text',text:JSON.stringify(result)}]}});
  status.textContent=decision==='approved'?'Approved.':'Changes requested.';
}
function applyToolResult(params){const result=params?.result||params||{},data=result.structuredContent||result.structured_content||{};if(typeof data.path==='string')pathLabel.textContent=data.path;if(typeof data.markdown==='string'){article.innerHTML=data.markdown.split(/\\r?\\n/).map(line=>{const escaped=line.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));if(line.startsWith('### '))return '<h3>'+escaped.slice(4)+'</h3>';if(line.startsWith('## '))return '<h2>'+escaped.slice(3)+'</h2>';if(line.startsWith('# '))return '<h1>'+escaped.slice(2)+'</h1>';if(line.startsWith('- '))return '<li>'+escaped.slice(2)+'</li>';return line.trim()?'<p>'+escaped+'</p>':''}).join('\\n');}}
window.addEventListener('message',event=>{const message=event.data;if(!message||typeof message!=='object')return;if(message.method==='ui/notifications/tool-result'){applyToolResult(message.params);return;}if(message.method==='ui/notifications/tool-input'){return;}if(message.id===1&&message.result){initialized=true;status.textContent='Ready for review.';}});
send({jsonrpc:'2.0',id:1,method:'ui/initialize',params:{protocolVersion:'2026-01-26',capabilities:{},clientInfo:{name:'markcut-preview',version:'1'}}});
document.getElementById('approve').onclick=()=>submit('approved');document.getElementById('changes').onclick=()=>submit('changes_requested');
</script></body></html>`;
}
