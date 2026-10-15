#!/usr/bin/env node
// Real MCP stdio compile-and-release verification. No player manager or HTTP child.
import {Client} from "@modelcontextprotocol/client";
import {StdioClientTransport} from "@modelcontextprotocol/client/stdio";
import {mkdtemp,writeFile,readFile,readdir,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {execFileSync} from "node:child_process";
import assert from "node:assert/strict";

const run=await mkdtemp(join(tmpdir(),"markcut-static-e2e-"));
const exportRoot=join(run,"export");
const report={timestamp:new Date().toISOString(),checks:[]};
let client;
function processes(){
 return execFileSync("ps",["-axo","pid,ppid,command"],{encoding:"utf8"}).split("\n")
 .filter(x=>x.includes("src/mcp/managed-player.mjs")||
   (x.includes("src/player/server.mjs")&&x.includes(".markcut-preview-")));
}
const before=processes();
async function connect(){
 const transport=new StdioClientTransport({
  command:process.execPath,args:["src/mcp/server.mjs"],cwd:process.cwd(),
  env:{...process.env,NEOY_PUBLIC_ORIGIN:"https://neoy.example.test",MARKCUT_EXPORT_ROOT:exportRoot}
 });
 client=new Client({name:"static-e2e",version:"1.0.0"});
 await client.connect(transport);
}
async function preview(file){
 const result=await client.callTool({name:"markcut.preview",arguments:{path:file}});
 if(result.isError)throw new Error(result.content?.[0]?.text||"preview failed");
 const data=result.structuredContent;
 assert.match(data.compiledUrl,/^https:\/\/neoy\.example\.test\/files\/_neoy\/markcut\/cache\/[a-f0-9]{64}\.json$/);
 assert.ok(!data.previewUrl,"no live local player URL");
 return data;
}
async function compiled(p){
 return JSON.parse(await readFile(join(exportRoot,"cache",p.contentHash+".json"),"utf8"));
}
async function check(name,fn){
 try {const detail=await fn();report.checks.push({name,status:"PASS",detail});}
 catch(e){report.checks.push({name,status:"FAIL",error:String(e)});throw e;}
}
const md=(name)=>'# video\nwidth:640 height:480 fps:30 layout:series\n## '+name+'\n- component duration:2 jsx:"<div>'+name+'</div>"\n';
try {
 const a=join(run,"A.md"),b=join(run,"B.md");
 await writeFile(a,md("Alpha-v1"));
 await writeFile(b,md("Beta-v1"));
 await connect();
 let A,B;
 await check("two Videos coexist",async()=>{
  [A,B]=await Promise.all([preview(a),preview(b)]);
  assert.notEqual(A.contentHash,B.contentHash);
  assert.match(JSON.stringify(await compiled(A)),/Alpha-v1/);
  assert.match(JSON.stringify(await compiled(B)),/Beta-v1/);
  return {a:A.contentHash,b:B.contentHash};
 });
 await check("repeated compile uses same immutable hash",async()=>{
  const identical=await preview(a);
  assert.equal(identical.contentHash,A.contentHash);
 });
 await writeFile(a,md("Alpha-v2"));
 await check("new version preserves older static JSON",async()=>{
  const latest=await preview(a);
  assert.notEqual(latest.contentHash,A.contentHash);
  assert.match(JSON.stringify(await compiled(A)),/Alpha-v1/);
  assert.match(JSON.stringify(await compiled(latest)),/Alpha-v2/);
  assert.match(JSON.stringify(await compiled(B)),/Beta-v1/);
 });
 await check("no port slots: eleven versions of one Video retain only ten",async()=>{
  const versions=[];
  for(let i=0;i<11;i++){
   await writeFile(a,md("Alpha-"+i));
   versions.push(await preview(a));
  }
  const cache=await readdir(join(run,".markcut","cache"));
  assert.equal(cache.filter(x=>x.endsWith(".json")).length,11); // 10 A + 1 B
  await readFile(join(exportRoot,"cache",versions[10].contentHash+".json"));
  await assert.rejects(readFile(join(exportRoot,"cache",versions[0].contentHash+".json")));
  assert.match(JSON.stringify(await compiled(B)),/Beta-v1/);
  return {aHistory:10,bHistory:1};
 });
 await check("restart does not expire retained static preview",async()=>{
  await client.close();
  await connect();
  const latest=await preview(b);
  assert.equal(latest.contentHash,B.contentHash);
  assert.match(JSON.stringify(await compiled(B)),/Beta-v1/);
 });
 await check("invalid path does not replace previous compiled",async()=>{
  const invalid=await client.callTool({name:"markcut.preview",arguments:{path:join(run,"missing.md")}});
  assert.equal(invalid.isError,true);
  const existing=await compiled(B);
  assert.match(JSON.stringify(existing),/Beta-v1/);
 });
 await client.close();client=null;
 await check("no managed player or child process spawned",async()=>{
  const after=processes();
  assert.deepEqual(after,before);
  return {preexisting:before.length,new:0};
 });
}catch(error){report.error=String(error);process.exitCode=1;}
finally{
 try{await client?.close()}catch{}
 report.completedAt=new Date().toISOString();
 const out=process.env.MARKCUT_EVIDENCE_FILE;
 if(out)await writeFile(out,JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify(report,null,2));
 await rm(run,{recursive:true,force:true});
}
