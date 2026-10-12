#!/usr/bin/env node
// Real MCP stdio + real HTTP player regression; no mocked transport or server.
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
const origin="http://127.0.0.1:4571";
const dir=await mkdtemp(join(tmpdir(),"markcut-real-e2e-"));
const report={timestamp:new Date().toISOString(),dir,checks:[],previews:[],processes:{}};
let client,transport;
function check(label,fn){return Promise.resolve().then(fn).then(detail=>{report.checks.push({label,status:"PASS",detail:detail??""});}).catch(err=>{report.checks.push({label,status:"FAIL",error:String(err)});throw err;});}
function markdown(label){return '# video\nwidth:640 height:480 fps:30 layout:series\n## '+label.replaceAll(" ","_")+'\n- component duration:2 jsx:"<div>'+label+'</div>"\n';}
async function connect(){
  transport=new StdioClientTransport({command:process.execPath,args:["src/mcp/server.mjs"],cwd:process.cwd(),stderr:"pipe"});
  client=new Client({name:"markcut-real-e2e",version:"1.0.0"});
  await client.connect(transport);
}
async function preview(path){
 const result=await client.callTool({name:"markcut.preview",arguments:{path}});
 if(result.isError)throw new Error(result.content?.[0]?.text??"MCP error");
 assert.ok(result.structuredContent?.previewUrl);
 report.previews.push(result.structuredContent);
 return result.structuredContent;
}
async function get(url){
 const response=await fetch(url,{signal:AbortSignal.timeout(10000)});
 assert.equal(response.status,200, url+" "+response.status);
 return response.json();
}
async function compiled(instance){
 return get(instance.previewUrl+"api/video-data");
}
function processes(){return execFileSync("ps",["-axo","pid,ppid,command"],{encoding:"utf8"}).split("\n").filter(s=>s.includes("src/mcp/managed-player.mjs")||s.includes("src/player/server.mjs")&&s.includes(".markcut-preview-"));}
try {
 const a=join(dir,"A.md"),b=join(dir,"B.md");
 await writeFile(a,markdown("Alpha v1"));await writeFile(b,markdown("Beta v1"));
 await connect();
 let A,B,Av2,original;
 await check("A-v1 and B-v1 parallel real MCP calls",async()=>{
   [A,B]=await Promise.all([preview(a),preview(b)]);
   assert.notEqual(A.previewUrl,B.previewUrl);
   assert.notEqual(A.contentHash,B.contentHash);
   return {A:A.previewUrl,B:B.previewUrl};
 });
 await check("HTTP readiness and identity A/B",async()=>{
   for(const instance of [A,B]) assert.equal((await get(instance.previewUrl+"api/ready")).ready,true);
   const dataA=await compiled(A),dataB=await compiled(B);
   assert.notDeepEqual(dataA,dataB);
   assert.match(JSON.stringify(dataA),/Alpha v1/); assert.match(JSON.stringify(dataB),/Beta v1/);
   original=JSON.stringify(dataA);
   return {AIdentity:"Alpha v1",BIdentity:"Beta v1"};
 });
 await check("HTTP player HTML and bundled JavaScript per revision",async()=>{
   for(const instance of [A,B]){
     const html=await fetch(instance.previewUrl);
     assert.equal(html.status,200);
     assert.match(await html.text(),/player\.js/);
     const js=await fetch(origin+"/player.js",{headers:{referer:instance.previewUrl}});
     assert.equal(js.status,200);
     assert.match(js.headers.get("content-type"),/javascript/);
   }
 });
 await check("revisit both URLs",async()=>{
   assert.equal(JSON.stringify(await compiled(A)),original);
   assert.match(JSON.stringify(await compiled(B)),/Beta v1/);
 });
 await check("repeat identical path deduplicates",async()=>{
   const again=await preview(a);assert.equal(again.id,A.id); return again.id;
 });
 await writeFile(a,markdown("Alpha v2"));
 await check("A-v2 revision, immutable A-v1",async()=>{
   Av2=await preview(a);
   assert.notEqual(Av2.previewUrl,A.previewUrl);
   assert.notEqual(Av2.contentHash,A.contentHash);
   assert.match(JSON.stringify(await compiled(Av2)),/Alpha v2/);
   assert.equal(JSON.stringify(await compiled(A)),original);
   assert.match(JSON.stringify(await compiled(B)),/Beta v1/);
   return {A1:A.previewUrl,A2:Av2.previewUrl};
 });
 await check("parallel repeat calls",async()=>{
   const x=await Promise.all(Array.from({length:12},()=>preview(a)));
   assert.equal(new Set(x.map(p=>p.id)).size,1);
   return {calls:x.length,instances:1};
 });
 await check("invalid paths rejected by actual MCP",async()=>{
   for(const path of ["relative.md",join(dir,"bad.txt"),join(dir,"missing.md")]){
     const response=await client.callTool({name:"markcut.preview",arguments:{path}});
     assert.equal(response.isError,true);
   }
 });
 await check("cross-origin browser request rejected",async()=>{
   const response=await fetch(origin+"/__markcut/previews",{
     method:"POST",headers:{"content-type":"application/json","origin":"https://malicious.invalid"},
     body:JSON.stringify({path:a}),
   });
   assert.equal(response.status,403);
 });
 await check("bounded six revisions and graceful seventh refusal",async()=>{
   for(let i=0;i<3;i++){const p=join(dir,"extra"+i+".md");await writeFile(p,markdown("Extra "+i));await preview(p);}
   const p=join(dir,"extra-overflow.md");await writeFile(p,markdown("Overflow"));
   const r=await client.callTool({name:"markcut.preview",arguments:{path:p}});
   assert.equal(r.isError,true);assert.match(r.content[0].text,/capacity exceeded/);
   return "6 active slots maximum";
 });
 report.processes.active=processes();
 await client.close();
 await new Promise(r=>setTimeout(r,1500));
 for(let attempt=0;attempt<30 && processes().length;attempt++){
   await new Promise(r=>setTimeout(r,500));
 }
 report.processes.afterClose=processes();
 await check("cleanup manager and child processes",()=>{assert.equal(report.processes.afterClose.length,0,JSON.stringify(report.processes.afterClose));});
 await check("foreign process on 4571 is not killed or reused",async()=>{
   const foreign=createServer((_req,res)=>{res.writeHead(200,{"content-type":"application/json"});res.end('{"service":"foreign"}');});
   await new Promise((resolve,reject)=>foreign.once("error",reject).listen(4571,"127.0.0.1",resolve));
   try {
     await connect();
     const response=await client.callTool({name:"markcut.preview",arguments:{path:b}});
     assert.equal(response.isError,true);
     assert.match(response.content[0].text,/port 4571|unavailable|manager failed/);
     assert.equal((await get(origin+"/__markcut/health")).service,"foreign");
     await client.close();
   } finally {
     await new Promise(resolve=>foreign.close(resolve));
   }
 });
 await connect();
 await check("restart expires old URLs (no historical persistence advertised)",async()=>{
   const fresh=await preview(b);
   assert.notEqual(fresh.id,B.id);
   const response=await fetch(A.previewUrl,{signal:AbortSignal.timeout(10000)});
   assert.equal(response.status,404);
   return {old:A.previewUrl,oldStatus:404,new:fresh.previewUrl};
 });
 await client.close();
 await new Promise(r=>setTimeout(r,1000));
 for(let attempt=0;attempt<30 && processes().length;attempt++){
   await new Promise(r=>setTimeout(r,500));
 }
 await check("restart cleanup",()=>assert.equal(processes().length,0));
} catch(err){report.error=String(err);process.exitCode=1;}
finally {
 try{await client?.close()}catch{}
 report.completedAt=new Date().toISOString();
 const out=process.env.MARKCUT_EVIDENCE_FILE||join(process.cwd(),"docs","evidence-markcut-real-e2e.json");
 await writeFile(out,JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify({evidence:out,checks:report.checks,processes:report.processes,error:report.error},null,2));
 if(!process.env.MARKCUT_KEEP_FIXTURES)await rm(dir,{recursive:true,force:true});
}
