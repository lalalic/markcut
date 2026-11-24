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
// Escape JSX expression delimiters as well as HTML, since EDL strings are
// inserted into JSX children, not into an ordinary inert HTML document.
const html=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/{/g,'&#123;').replace(/}/g,'&#125;').replace(/[\r\n]+/g,' ');
// Keep complete Editorial Decision text in the playable overlay: EDL is the
// source of truth and should never be silently ellipsized or drop fields.
// Prefer the large 1080x1920 typography, then decrease type only when the
// FULL caption needs the space. Unlike a scroll region, these sizes are
// deterministic Remotion frames and remain visible in exported video.
function shotTypography(edit,src,sections,width,height){
 const canvasScale=Math.min(width/1080,height/1920);
 // CSS percentage padding uses the container WIDTH on all four sides.
 const usableWidth=width*0.90,usableHeight=height-width*0.10;
 const glyphWidth=text=>[...String(text)].reduce((sum,ch)=>sum+(
  /[\u2E80-\u9FFF\uAC00-\uD7AF\uFF01-\uFF60]/u.test(ch)?1:
  /\s/.test(ch)?.36:/[iIl.,:;!|'`]/.test(ch)?.34:/[MW@#%&]/.test(ch)?.83:.61),0);
 const estimateLines=(text,font)=>Math.max(1,Math.ceil(glyphWidth(text)*font*1.18/usableWidth));
 const source=`SOURCE: ${src} [${edit.in_seconds.toFixed(2)}–${edit.out_seconds.toFixed(2)}s]`;
 const desc=sections.map(([label,text])=>`${label}: ${text}`);
 for(let n=20;n>=9;n--){
  const shrink=n/20*canvasScale;
  const title=68*shrink,sourceFont=38*shrink,body=46*shrink,gap=23*shrink;
  const needed=estimateLines(edit.shot_id,title)*title*1.14+
    estimateLines(source,sourceFont)*sourceFont*1.3+
    desc.reduce((sum,text)=>sum+estimateLines(text,body)*body*1.28,0)+
    (desc.length+1)*gap;
  if(needed<=usableHeight*0.95)
   return {title:Math.round(title*100)/100,source:Math.round(sourceFont*100)/100,body:Math.round(body*100)/100,label:Math.round(34*shrink*100)/100,gap:Math.round(gap*100)/100};
 }
 throw Error('EDL Shot '+edit.shot_id+' has too much decision text to fit on one frame; split the decision into separate shots instead of clipping it');
}
function overlay(edit,index,src,width,height){
 const sections=[
  ['BEAT',edit.shot_purpose],
  ['STORY',edit.beat],
  ['STORY BEAT ID',edit.story_beat_id],
  ['EDITOR REASON',edit.editor_reason],
  ['CUT REASON',edit.cut_reason],
  ['VISUAL RELATIONSHIP',edit.visual_relationship],
  ['SOUND DECISION',edit.sound_decision],
  ['AUDIO INTENT',edit.audioIntent],
  ['TRANSITION',edit.transition],
  ['REVISION NOTE',edit.revision_note],
 ].filter(([,value])=>nonEmpty(value));
 const size=shotTypography(edit,src,sections,width,height);
 const heading=`<div style={{fontSize:${size.title},fontWeight:800,lineHeight:1.14,overflowWrap:'anywhere'}}>${html(edit.shot_id)}</div>`;
 const source=`<div style={{fontSize:${size.source},fontWeight:600,lineHeight:1.3,opacity:.9,overflowWrap:'anywhere'}}>SOURCE: ${html(src)} [${edit.in_seconds.toFixed(2)}–${edit.out_seconds.toFixed(2)}s]</div>`;
 const descriptions=sections.map(([label,value])=>`<div style={{fontSize:${size.body},lineHeight:1.28,overflowWrap:'anywhere',whiteSpace:'pre-wrap'}}><span style={{fontSize:${size.label},fontWeight:700,letterSpacing:1,color:'#a5d8ff'}}>${label}:</span> ${html(value)}</div>`).join('');
 return `<div style={{boxSizing:'border-box',width:'100%',height:'100%',display:'flex',flexDirection:'column',justifyContent:'flex-start',alignItems:'stretch',gap:${size.gap},overflowY:'hidden',padding:'5%',color:'white',fontFamily:'Arial,sans-serif',textShadow:'0 2px 5px rgba(0,0,0,.85)',background:'linear-gradient(180deg,rgba(0,0,0,.94),rgba(0,0,0,.78) 62%,rgba(0,0,0,.34))'}}>${heading}${source}${descriptions}</div>`;
}

export function editorDecisionToMarkdown(videoPath,edl,markdown=readFileSync(videoPath,'utf8')){
 validateEditorDecision(edl);
 const width=Number(/\bwidth:(\d+)/.exec(markdown)?.[1]||1080),height=Number(/\bheight:(\d+)/.exec(markdown)?.[1]||1920);
 const fps=Number(/\bfps:(\d+)/.exec(markdown)?.[1]||30);
 const out=['# video','width:'+width+' height:'+height+' fps:'+fps+' layout:series'];
 if(nonEmpty(edl.editorial_intent)){
  const jsx="<div style={{boxSizing:'border-box',width:'100%',height:'100%',background:'#111827',color:'white',display:'flex',alignItems:'center',justifyContent:'center',padding:'10%',fontSize:46,textAlign:'center'}}>"+html(edl.editorial_intent)+'</div>';
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
  out.push('- component duration:'+duration.toFixed(4)+' jsx:'+JSON.stringify(overlay(e,i,src,width,height)));
 }
 return out.join('\n')+'\n';
}
