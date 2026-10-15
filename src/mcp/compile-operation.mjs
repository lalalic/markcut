import {spawn} from "node:child_process";
import {randomUUID,createHash} from "node:crypto";
import {mkdirSync,writeFileSync,renameSync,statSync,readFileSync,readdirSync,rmSync} from "node:fs";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {EXPORT_ROOT,publicOrigin,resolvePreviewPath} from "./remote-assets.mjs";
import {validateMarkdownPath} from "./preview.mjs";
const folder=join(EXPORT_ROOT,"operations");
const RETAIN_MS=24*60*60*1000;
function cleanupOldOperations(){
 try{
  const cutoff=Date.now()-RETAIN_MS;
  for(const entry of readdirSync(folder,{withFileTypes:true})){
   if(!entry.isFile()||!entry.name.endsWith(".json"))continue;
   const file=join(folder,entry.name);
   const info=statSync(file);
   if(info.mtimeMs<cutoff)rmSync(file,{force:true});
  }
 }catch{}
}

export function writeOperation(id,data){
 if(!/^[a-f0-9-]{36}$/.test(id))throw new Error("Invalid operation ID");
 mkdirSync(folder,{recursive:true});
 const temp=join(folder,id+"."+process.pid+".tmp");
 writeFileSync(temp,JSON.stringify(data),{mode:0o644});
 renameSync(temp,join(folder,id+".json"));
}
export function startCompileOperation(path,relay){
 const valid=validateMarkdownPath(resolvePreviewPath(path));
 if(!statSync(valid).isFile())throw new Error("Preview source must be a Markdown file");
 const sourceHash=createHash("sha256").update(readFileSync(valid)).digest("hex");
 cleanupOldOperations();
 const id=randomUUID(),startedAt=Date.now();
 writeOperation(id,{id,state:"compiling",stage:"queued",startedAt,requestedPath:path});
 const worker=fileURLToPath(new URL("./compile-worker.mjs",import.meta.url));
 const child=spawn(process.execPath,[worker,id,valid,path,JSON.stringify(relay||null),sourceHash],{detached:true,stdio:"ignore"});
 child.on("error",e=>{
  writeOperation(id,{id,state:"failed",stage:"failed",startedAt,requestedPath:path,error:e.message});
 });
 child.on("exit",(code,signal)=>{
  try{
   const state=JSON.parse(readFileSync(join(folder,id+".json"),"utf8"));
   if(state.state==="compiling"){
    writeOperation(id,{id,state:"failed",stage:"failed",startedAt,requestedPath:path,
      error:"Compiler exited unexpectedly: "+(signal||code)});
   }
  }catch{}
 });
 child.unref();
 return {operationId:id,operationUrl:publicOrigin()+"/files/_neoy/markcut/operations/"+id+".json",path:valid,requestedPath:path,state:"compiling"};
}
