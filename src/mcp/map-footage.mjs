import {mkdtemp,writeFile,stat,rename,rm,mkdir} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve,dirname} from "node:path";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {fileURLToPath} from "node:url";
const run=promisify(execFile);
const projectRoot=resolve(dirname(fileURLToPath(import.meta.url)),"../..");
export function findMapScenes(root){
 return (root?.children||[]).filter(x=>x?.type==="scene"&&x.visible!==false&&
  Array.isArray(x.children)&&x.children.some(child=>child.type==="map"));
}
export async function renderMapFootage(compiled,{generatedDir,key,onProgress=()=>{}}){
 const root=compiled.root||compiled;
 const scenes=findMapScenes(root);
 if(!scenes.length)return {compiled,rendered:0,skipped:0};
 if(!key)return {compiled,rendered:0,skipped:scenes.length};
 const output=structuredClone(compiled);
 const outputRoot=output.root||output;
 let rendered=0,skipped=0;
 await mkdir(generatedDir,{recursive:true});
 for(const [index,scene] of findMapScenes(outputRoot).entries()){
  // Render a complete scene so map overlays are retained. The fallback tree
  // remains unchanged until the video has been successfully produced.
  const duration=Number(scene.durationInSeconds)||0;
  if(duration<=0){skipped++;continue;}
  const name="map-footage-"+index+".mp4";
  const destination=join(generatedDir,name);
  const temporary=await mkdtemp(join(tmpdir(),"markcut-map-render-"));
  try{
   const source=structuredClone(scene);
   const isolated={...structuredClone(outputRoot),isSeries:true,children:[source],durationInSeconds:duration};
   delete isolated.subtitle; // Global captions belong to the final video, not map footage.
   const file=join(temporary,"props.json");
   await writeFile(file,JSON.stringify({root:isolated}),{mode:0o600});
   onProgress("rendering-map-footage-"+(index+1)+"-of-"+scenes.length);
   await run(resolve(projectRoot,"node_modules/.bin/remotion"),[
    "render",resolve(projectRoot,"src/index.ts"),"Root",join(temporary,name),
    "--props",file,"--codec","h264","--concurrency","1"
   ],{cwd:projectRoot,timeout:180000,maxBuffer:1024*1024*4,env:process.env});
   if((await stat(join(temporary,name))).size<1024)throw Error("Empty map footage");
   await rename(join(temporary,name),destination);
   scene.children=[{id:"map-footage-"+index,type:"video",visible:true,start:0,end:duration,
    durationInSeconds:duration,src:destination,volume:0}];
   rendered++;
  }catch(error){
   skipped++;
   onProgress("map-footage-fallback-"+(index+1));
  }finally{await rm(temporary,{recursive:true,force:true});}
 }
 return {compiled:output,rendered,skipped};
}
