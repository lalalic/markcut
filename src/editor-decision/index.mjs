/** Markcut built-in Editor Decision sidecar and its playable video converter.
 * The executable Markdown remains authoritative for the finished film.
 */
import {readFileSync, existsSync, readdirSync, realpathSync} from 'node:fs';
import {resolve, dirname, basename, extname, relative, isAbsolute, sep, join} from 'node:path';
import * as yaml from 'js-yaml';

const videoExts=new Set(['.mp4','.mov','.m4v','.webm','.mkv','.avi']);
const imageExts=new Set(['.png','.jpg','.jpeg','.webp','.gif','.bmp']);
const nonEmpty=x=>typeof x==='string'&&x.trim().length>0;
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const inside=(base,path)=>{const rel=relative(base,path);return !!rel&&rel!=='..'&&!rel.startsWith('..'+sep)&&!isAbsolute(rel);};
const frontRe=/^\uFEFF?---\s*\r?\n([\s\S]*?)\r?\n---(?:\s*\r?\n|\s*$)/;

export function frontmatterEdl(markdown){
 const found=frontRe.exec(markdown);
 if(!found)return undefined;
 const obj=yaml.load(found[1]);
 if(obj==null)return undefined;
 if(typeof obj!=='object'||Array.isArray(obj))throw Error('Markcut frontmatter must be a YAML mapping');
 if(!Object.hasOwn(obj,'edl'))return undefined;
 if(!nonEmpty(obj.edl))throw Error('Frontmatter edl must name a relative .json file');
 return obj.edl.trim();
}

/** Explicit frontmatter path wins; otherwise discover the existing <name>.edl.json sidecar. */
export function resolveEditorDecisionPath(videoPath,markdown=readFileSync(videoPath,'utf8')){
 const declared=frontmatterEdl(markdown);
 const name=declared??basename(videoPath,'.md')+'.edl.json';
 if(extname(name).toLowerCase()!=='.json'||isAbsolute(name)||name.includes('\\')||/^[a-z][a-z\d+.-]*:/i.test(name))throw Error('EDL must be a local relative JSON path');
 const base=dirname(resolve(videoPath)),full=resolve(base,name);
 if(!inside(base,full))throw Error('EDL reference escapes the video directory');
 if(!existsSync(full)){
  if(declared)throw Error('Declared EDL not found: '+name);
  return null;
 }
 if(!inside(realpathSync(base),realpathSync(full)))throw Error('EDL symlink escapes the video directory');
 return full;
}

export function validateEditorDecision(edl){
 if(!edl||typeof edl!=='object'||Array.isArray(edl)||edl.schema_version!==1||!Array.isArray(edl.edits)||!edl.edits.length)
  throw Error('Editor Decision v1 requires schema_version:1 and nonempty edits[]');
 if(edl.edits.length>500)throw Error('EDL exceeds 500 shots');
 const ids=new Set();
 for(const [i,e] of edl.edits.entries()){
  if(!e||typeof e!=='object'||!nonEmpty(e.shot_id)||ids.has(e.shot_id))throw Error('EDL edits['+i+'] requires unique shot_id');
  ids.add(e.shot_id);
  if(!nonEmpty(e.source_src)&&!nonEmpty(e.source_id))throw Error('EDL edits['+i+'] requires source_src or source_id');
  if(!finite(e.in_seconds)||e.in_seconds<0||!finite(e.out_seconds)||e.out_seconds<=e.in_seconds)throw Error('EDL edits['+i+'] has invalid in/out seconds');
  if(e.playbackSpeed!=null&&(!finite(e.playbackSpeed)||e.playbackSpeed<=0))throw Error('EDL edits['+i+'] has invalid playbackSpeed');
  if(e.timelineDuration!=null&&(!finite(e.timelineDuration)||e.timelineDuration<=0))throw Error('EDL edits['+i+'] has invalid timelineDuration');
 }
 return edl;
}

export function loadEditorDecision(videoPath,markdown=readFileSync(videoPath,'utf8')){
 const path=resolveEditorDecisionPath(videoPath,markdown);
 if(!path)return null;
 let edl;
 try{edl=JSON.parse(readFileSync(path,'utf8'));}catch(e){throw Error('Invalid EDL JSON '+basename(path)+': '+e.message);}
 validateEditorDecision(edl);
 return {path,edl};
}
function confinedMediaSrc(videoPath,src){
 const base=dirname(resolve(videoPath));
 if(!nonEmpty(src)||isAbsolute(src)||src.includes('\\')||/^[a-z][a-z\d+.-]*:/i.test(src))throw Error('EDL media must be local relative path: '+src);
 const full=resolve(base,src);
 if(!inside(base,full)||!existsSync(full)||!inside(realpathSync(base),realpathSync(full)))throw Error('EDL media is missing or outside video directory: '+src);
 const rel=relative(base,full).split(sep).join('/');
 if(/[\s"\r\n]/.test(rel))throw Error('EDL media path must not contain whitespace or quotes: '+rel);
 return rel;
}
function mediaSrc(videoPath,edit){
 if(nonEmpty(edit.source_src))return confinedMediaSrc(videoPath,edit.source_src);
 const id=edit.source_id;
 if(/[/\\]/.test(id))return confinedMediaSrc(videoPath,id);
 if(extname(id)){
  if(existsSync(resolve(dirname(videoPath),id)))return confinedMediaSrc(videoPath,id);
  return confinedMediaSrc(videoPath,'input/media/'+id);
 }
 const dir=join(dirname(resolve(videoPath)),'input','media');
 const candidates=existsSync(dir)?readdirSync(dir).filter(name=>basename(name,extname(name))===id&&(videoExts.has(extname(name).toLowerCase())||imageExts.has(extname(name).toLowerCase()))):[];
 if(candidates.length!==1)throw Error('EDL source_id '+JSON.stringify(id)+' does not uniquely resolve; specify source_src');
 return confinedMediaSrc(videoPath,'input/media/'+candidates[0]);
}
const html=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/[\r\n]+/g,' ');
const short=(s,n=140)=>{const text=String(s??'').trim();return text.length>n?text.slice(0,n-1)+'…':text;};
function overlay(edit,index,src){
 const fields=[edit.shot_purpose||edit.beat||edit.story_beat_id,edit.editor_reason||edit.cut_reason,edit.visual_relationship,edit.sound_decision||edit.audioIntent,edit.revision_note].filter(nonEmpty).map(s=>short(s));
 const lines=['SOURCE: '+src+' ['+edit.in_seconds.toFixed(2)+'–'+edit.out_seconds.toFixed(2)+'s]',...fields].slice(0,5);
 const body=lines.map((line,i)=>'<div style={{fontSize:'+(i===0?18:24)+',opacity:'+(i===0?0.7:1)+",marginTop:10,overflowWrap:'anywhere'}}>"+html(line)+'</div>').join('');
 return "<div style={{boxSizing:'border-box',width:'100%',height:'100%',display:'flex',flexDirection:'column',justifyContent:'flex-end',padding:'5%',color:'white',fontFamily:'Arial,sans-serif',background:'linear-gradient(0deg,rgba(0,0,0,.94),rgba(0,0,0,.6) 45%,transparent 90%)'}}><div style={{fontSize:33,fontWeight:700}}>SHOT "+(index+1)+' · '+html(edit.shot_id)+'</div>'+body+'</div>';
}
export function editorDecisionToMarkdown(videoPath,edl,markdown=readFileSync(videoPath,'utf8')){
 validateEditorDecision(edl);
 const width=Number(/\bwidth:(\d+)/.exec(markdown)?.[1]||1080),height=Number(/\bheight:(\d+)/.exec(markdown)?.[1]||1920);
 const fps=Number(/\bfps:(\d+)/.exec(markdown)?.[1]||30);
 const out=['# video','width:'+width+' height:'+height+' fps:'+fps+' layout:series'];
 if(nonEmpty(edl.editorial_intent)){
  const jsx="<div style={{boxSizing:'border-box',width:'100%',height:'100%',background:'#111827',color:'white',display:'flex',alignItems:'center',justifyContent:'center',padding:'10%',fontSize:46,textAlign:'center'}}>"+html(short(edl.editorial_intent,320))+'</div>';
  out.push('','## EditorialIntent','layout:parallel','- component duration:3 jsx:'+JSON.stringify(jsx));
 }
 for(const [i,e] of edl.edits.entries()){
  const src=mediaSrc(videoPath,e),ext=extname(src).toLowerCase(),speed=e.playbackSpeed||1;
  const duration=e.timelineDuration||(e.out_seconds-e.in_seconds)/speed;
  if(!finite(duration)||duration<=0)throw Error('EDL shot '+e.shot_id+' has invalid duration');
  out.push('','## Shot'+(i+1),'layout:parallel');
  if(imageExts.has(ext))out.push('- image src:'+src+' duration:'+duration.toFixed(4)+' fit:cover');
  else if(videoExts.has(ext))out.push('- video src:'+src+' startFrom:'+e.in_seconds+' endAt:'+e.out_seconds+' duration:'+duration.toFixed(4)+' playbackRate:'+speed+' volume:1 fit:cover');
  else throw Error('Unsupported EDL media format: '+src);
  out.push('- component duration:'+duration.toFixed(4)+' jsx:'+JSON.stringify(overlay(e,i,src)));
 }
 return out.join('\n')+'\n';
}
