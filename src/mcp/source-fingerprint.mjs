import {createHash} from "node:crypto";
import {closeSync,openSync,readFileSync,readSync,statSync} from "node:fs";
import {basename,dirname,isAbsolute,resolve} from "node:path";

const assetPattern=/\b(?:src|audio)\s*:\s*["']?([^"'\s;]+\.(?:png|jpe?g|webp|svg|gif|mp4|mov|webm|wav|mp3|m4a|ogg|vtt|srt))/gi;
function hashFile(path){
  const fd=openSync(path,"r"),buffer=Buffer.allocUnsafe(1024*1024),hash=createHash("sha256");
  try{let count;while((count=readSync(fd,buffer,0,buffer.length,null))>0)hash.update(buffer.subarray(0,count));return hash.digest("hex");}
  finally{closeSync(fd);}
}
export function fingerprintInputs(path, sourceBytes=readFileSync(path)) {
  const source=Buffer.isBuffer(sourceBytes)?sourceBytes:Buffer.from(sourceBytes);
  const base=dirname(path), assets=[];
  for(const match of source.toString("utf8").matchAll(assetPattern)){
    const candidate=match[1]; if(candidate.includes("://")||isAbsolute(candidate))continue;
    try {const file=resolve(base,candidate),info=statSync(file);if(info.isFile())assets.push([candidate,hashFile(file)]);}catch{}
  }
  if(![...source.toString("utf8").matchAll(assetPattern)].some(match=>/\baudio\s*:/i.test(match[0]))){
    const file=resolve(base,basename(path,".md")+".wav");
    try {const info=statSync(file);if(info.isFile())assets.push([file,hashFile(file)]);}catch{}
  }
  assets.sort((a,b)=>String(a[0]).localeCompare(String(b[0])));
  return {source,assets};
}
