import {readFileSync,mkdirSync,writeFileSync,existsSync,realpathSync,renameSync} from "node:fs";
import {homedir} from "node:os";
import {join,resolve,sep,isAbsolute} from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";

const supportDir = join(homedir(),"Library","Application Support","NeoY");
export const EXPORT_ROOT = join(supportDir,"exports","_neoy","markcut");
const DATA_URI = /data:(image|audio|video)\/[a-z0-9.+-]+(?:;base64)?,[a-z0-9%+\/=._~!$&()*,:;@?-]+/gi;
const MAX_BYTES = 16 * 1024 * 1024;

export function publicOrigin() {
  if(process.env.NEOY_PUBLIC_ORIGIN) {
    const url=new URL(process.env.NEOY_PUBLIC_ORIGIN);
    if(url.protocol!=="https:")throw new Error("NeoY public origin requires HTTPS");
    return url.origin;
  }
  const config=JSON.parse(readFileSync(join(supportDir,"deployment.json"),"utf8"));
  if(config.tunnelMode==="named" && config.publicHostname) return "https://"+config.publicHostname;
  const quick=join(supportDir,"public-url");
  if(existsSync(quick)){
    const url=new URL(readFileSync(quick,"utf8").trim());
    if(url.protocol==="https:")return url.origin;
  }
  throw new Error("No public HTTPS URL configured for NeoY");
}

export function resolveMountedFile(path,origin=null,mountedRoots=null) {
  let mounts=mountedRoots||{};
  if(!mountedRoots)try{mounts=JSON.parse(readFileSync(join(supportDir,"file-mounts.json"),"utf8"));}catch{}
  const absolute=resolve(path);
  for(const [name,base] of Object.entries(mounts)){
    if(!/^[a-z0-9_-]{1,64}$/i.test(name)||typeof base!=="string")continue;
    const root=resolve(base);
    if(!absolute.startsWith(root+sep))continue;
    const relative=absolute.slice(root.length+1).split(sep);
    if(relative.some(part=>part.startsWith(".")||part===".."||part===""))continue;
    return (origin||publicOrigin())+"/files/"+encodeURIComponent(name)+"/"+relative.map(encodeURIComponent).join("/");
  }
  return null;
}

export function resolvePreviewPath(input, origin=publicOrigin(), mountedRoots=null) {
  if(typeof input!=="string")throw new Error("Preview path must be a string");
  if(isAbsolute(input) && !input.startsWith("/files/"))return input;
  const url=new URL(input.startsWith("/files/") ? origin+input : input);
  if(url.origin!==origin || url.search || url.hash || !url.pathname.startsWith("/files/"))
    throw new Error("Only NeoY file URLs under /files/<mount>/ are accepted");
  const parts=url.pathname.slice("/files/".length).split("/").map(decodeURIComponent);
  const [name,...relative]=parts;
  if(!name || name==="_neoy" || !/^[a-z0-9_-]{1,64}$/i.test(name) || !relative.length ||
     relative.some(part=>!part || part==="." || part===".." || part.startsWith(".") || part.includes("/")))
    throw new Error("Invalid mounted preview path");
  let roots=mountedRoots||{};
  if(!mountedRoots)try{roots=JSON.parse(readFileSync(join(supportDir,"file-mounts.json"),"utf8"));}catch{}
  const base=roots[name];
  if(typeof base!=="string" || !base.startsWith("/"))throw new Error("Unknown NeoY file mount: "+name);
  const root=realpathSync(base);
  const file=realpathSync(resolve(root,...relative));
  if(!file.startsWith(root+sep))throw new Error("Preview path escapes NeoY mounted root");
  return file;
}

export function publishPlayerBundle(bundlePath, origin=publicOrigin()) {
  const bytes=readFileSync(bundlePath);
  const hash=createHash("sha256").update(bytes).digest("hex").slice(0,20);
  const directory=join(EXPORT_ROOT,"player");
  mkdirSync(directory,{recursive:true});
  const filename=hash+".js";
  const target=join(directory,filename);
  if(!existsSync(target))writeFileSync(target,bytes,{flag:"wx",mode:0o644});
  return origin+"/files/_neoy/markcut/player/"+filename;
}

export function resolvePreviewSource(src,sourceDir,origin=publicOrigin(),mounts=null) {
  if(src.startsWith("data:"))return src;
  if(src.startsWith("https://"))return src;
  if(src.startsWith("http://"))throw new Error("Preview media URL must be HTTPS");
  if(src.startsWith("blob:"))throw new Error("Blob URLs cannot be shared with MCP App");
  if(!sourceDir && !src.startsWith("file://") && !isAbsolute(src))return src;
  const path=src.startsWith("file://")?fileURLToPath(src):isAbsolute(src)?src:resolve(sourceDir,src);
  const mapped=resolveMountedFile(path,origin,mounts);
  if(!mapped)throw new Error("Preview media file is not under a NeoY mounted root: "+path);
  return mapped;
}

export function externalizePreviewMedia(compiled,revisionId,origin=publicOrigin(),sourceDir=null) {
  if(!/^[a-f0-9-]{36}$/i.test(revisionId))throw new Error("Invalid revision identity");
  const directory=join(EXPORT_ROOT,"generated",revisionId);
  const assets=[];
  let bytes=0;
  function replace(value){
    if(typeof value==="string"){
      if(/https?:\/\/(?:localhost|127\.0\.0\.1)(?=[:/]|$)/i.test(value))
        throw new Error("Preview contains local media URL");
      const converted = sourceDir ? value.replace(/(\bsrc\s*=\s*)(['"])([^'"\n]+)\2/g,
        (all,prefix,quote,path)=>prefix+quote+resolvePreviewSource(path,sourceDir,origin)+quote) : value;
      return converted.replace(DATA_URI,uri=>{
        const comma=uri.indexOf(",");
        const mime=uri.slice(5,comma).split(";")[0].toLowerCase();
        const data=uri.slice(comma+1);
        const buffer=uri.slice(0,comma).includes(";base64") ? Buffer.from(data,"base64") : Buffer.from(decodeURIComponent(data));
        bytes+=buffer.length;
        if(bytes>MAX_BYTES||assets.length>=64)throw new Error("Preview media asset limit exceeded");
        const ext=({ "audio/wav":"wav","audio/mpeg":"mp3","audio/mp4":"m4a","audio/ogg":"ogg",
          "image/png":"png","image/jpeg":"jpg","image/webp":"webp","image/svg+xml":"svg","video/mp4":"mp4" })[mime];
        if(!ext)throw new Error("Unsupported media MIME type: "+mime);
        mkdirSync(directory,{recursive:true});
        const filename=assets.length+"."+ext;
        const target=join(directory,filename);
        if(existsSync(target)) {
          if(!readFileSync(target).equals(buffer))throw new Error("Immutable preview asset collision");
        }else writeFileSync(target,buffer,{flag:"wx",mode:0o644});
        assets.push(filename);
        return origin+"/files/_neoy/markcut/generated/"+revisionId+"/"+filename;
      });
    }
    if(Array.isArray(value))return value.map(replace);
    if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value).map(([key,v])=>
      [key,key==="src" && typeof v==="string" && !v.startsWith("data:")
        ? resolvePreviewSource(v,sourceDir,origin) : replace(v)]));
    return value;
  }
  return {compiled:replace(compiled),assets};
}

// Fallback for hosts that deliver tool-input but omit tool-result notifications.
export function publishPreviewRevision(requestedPath,payload) {
  const key=createHash("sha256").update(requestedPath).digest("hex");
  const dir=join(EXPORT_ROOT,"revisions");
  mkdirSync(dir,{recursive:true});
  const target=join(dir,key+".json");
  const temp=join(dir,key+"."+process.pid+".tmp");
  writeFileSync(temp,JSON.stringify(payload),{mode:0o644});
  renameSync(temp,target);
  return publicOrigin()+"/files/_neoy/markcut/revisions/"+key+".json";
}
