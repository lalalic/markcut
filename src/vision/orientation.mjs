// Full Markcut Vision owns semantic source orientation and safe in-place correction.
import {createHash,randomUUID} from 'node:crypto';
import {createReadStream,lstatSync,readdirSync,writeFileSync,renameSync,rmSync,existsSync,realpathSync,mkdirSync,chmodSync,rmdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {basename,extname,join} from 'node:path';
import {VIDEO_EXTS} from '../config.mjs';

const instructions='Start the response with exactly one line: ORIENTATION_CW=0|90|180|270|uncertain; CONFIDENCE=high|low (choose one value each). Angle is the clockwise rotation needed AFTER normal EXIF/container display orientation, not the camera metadata angle. Judge actual displayed pixels using gravity, people, readable text and horizon. Use high only for unambiguous evidence; intentional inverted composition, abstract scenes, conflicting frames or changing orientation must be uncertain. Never rotate merely because a frame is portrait or landscape. Then describe the scene in its natural upright orientation and the evidence for the orientation judgment in 3–4 concise sentences. The first line is a factual observation, not an editing instruction.';
export const orientationInstructions=instructions;
const parse=text=>/^\s*ORIENTATION_CW=(0|90|180|270|uncertain);\s*CONFIDENCE=(high|low)(?:[\s;.]|$)/i.exec(String(text??''));
export function orientationDecision(item,video){
 const observations=[item?.perception?.desc,...(video?Object.values(item?.perception?.segments??{}).map(s=>s.vision):[])];
 const parsed=observations.map(parse);
 if(video&&observations.length<2 || parsed.some(p=>!p||p[1].toLowerCase()==='uncertain'||p[2].toLowerCase()!=='high') || new Set(parsed.map(p=>p?.[1])).size!==1)return {status:'uncertain',reason:'missing, ambiguous or conflicting displayed-frame evidence'};
 const angle=Number(parsed[0][1]);return {status:angle?'correction-required':'upright',clockwise:angle};
}
const hash=async path=>{const h=createHash('sha256');for await(const chunk of createReadStream(path))h.update(chunk);return h.digest('hex')};
const save=(folder,metadata)=>{const path=join(folder,'metadata.json'),tmp=join(folder,'.metadata-'+randomUUID()+'.tmp');try{writeFileSync(tmp,JSON.stringify(metadata,null,2)+'\n',{mode:0o600,flag:'wx'});renameSync(tmp,path)}finally{rmSync(tmp,{force:true})}};
const probe=path=>JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',path],{encoding:'utf8',maxBuffer:8*1024*1024}));
const visual=p=>p.streams.find(s=>s.codec_type==='video'&&s.disposition?.attached_pic!==1);
const displaySize=s=>{const angle=Number(s.side_data_list?.find(x=>typeof x.rotation==='number')?.rotation??0);return Math.abs(angle)%180===90?[s.height,s.width]:[s.width,s.height]};
const filter={90:'transpose=clock',180:'hflip,vflip',270:'transpose=cclock'};
function transform(src,temp,angle,video){
 const before=probe(src),v=visual(before);if(!v)throw Error('No video/image stream');
 const [w,h]=displaySize(v),size=angle===180?[w,h]:[h,w];
 const ext=extname(src).toLowerCase();
 const args=['-nostdin','-v','error','-xerror','-n','-i',src,'-map','0:v:0','-vf',filter[angle],'-map_metadata','0'];
 if(video){
   // Preserve the original audio/subtitle tracks, timing and container tags.
   if(!['.mov','.mp4','.m4v','.mkv','.webm'].includes(ext))throw Error('Unsupported safe video correction container: '+ext);
   if(['smpte2084','arib-std-b67'].includes(v.color_transfer)||Number(v.bits_per_raw_sample)>8||/10|12|16/.test(v.pix_fmt??''))throw Error('HDR/high-bit-depth source requires a lossless-compatible correction path');
   const codec=ext==='.webm'?['-c:v','libvpx-vp9','-crf','16','-b:v','0']:['-c:v','libx264','-preset','fast','-crf','16'];
   args.push('-map','0:a?','-map','0:s?','-map','0:d?','-c','copy',...codec,'-fps_mode','passthrough','-metadata:s:v:0','rotate=0');
   if(['.mov','.mp4','.m4v'].includes(ext))args.push('-movflags','use_metadata_tags+faststart');
 }else{
   if(!['.jpg','.jpeg','.png','.webp'].includes(ext))throw Error('Unsupported safe image correction format: '+ext);
   if(Number(v.nb_frames)>1)throw Error('Animated image correction requires animation preservation');
   args.push('-frames:v','1',...(ext==='.jpg'||ext==='.jpeg'?['-q:v','2']:ext==='.webp'?['-c:v','libwebp','-lossless','1']:[]));
 }
 execFileSync('ffmpeg',[...args,temp],{stdio:['ignore','ignore','pipe'],maxBuffer:4*1024*1024});
 // Copy factual EXIF capture metadata, not stale orientation/dimensions/thumbnails.
 if(!video)execFileSync('exiftool',['-overwrite_original','-TagsFromFile',src,'-EXIF:DateTimeOriginal','-EXIF:CreateDate','-GPS:all','-EXIF:Orientation#=1',temp],{stdio:['ignore','ignore','pipe']});
 const after=probe(temp),a=visual(after);if(!a||a.width!==size[0]||a.height!==size[1]||displaySize(a).join()!==size.join())throw Error('Corrected display dimensions mismatch');
 if(video){const d=Number(before.format.duration),e=Number(after.format.duration);if(!Number.isFinite(d)||!Number.isFinite(e)||Math.abs(d-e)>0.12)throw Error('Corrected duration mismatch');
   const tracks=p=>p.streams.filter(s=>s.codec_type==='audio'||s.codec_type==='subtitle'||s.codec_type==='data').map(s=>[s.codec_type,s.codec_name,s.sample_rate,s.channels]);
   if(JSON.stringify(tracks(before))!==JSON.stringify(tracks(after)))throw Error('Corrected nonvisual tracks mismatch');
   if(v.nb_frames&&a.nb_frames&&v.nb_frames!==a.nb_frames)throw Error('Corrected frame count mismatch');
 }
 return {width:a.width,height:a.height};
}
function invalidate(folder,file,item){
 const dir=join(folder,'.normalized');if(existsSync(dir)&&lstatSync(dir).isSymbolicLink())throw Error('Unsafe normalized directory');
 const paths=[item.normalized,`.normalized/${file}_full.mp4`,...(existsSync(dir)?readdirSync(dir).filter(name=>name.startsWith(file+'_')&&/^\d+\.jpg$/.test(name.slice(file.length+1))).map(name=>'.normalized/'+name):[])].filter(p=>typeof p==='string'&&/^\.normalized\/[^/]+$/.test(p));
 for(const path of new Set(paths))rmSync(join(folder,path),{force:true});
 delete item.normalized;delete item._cache;
}
export async function correctOrientations(folder,files,metadata){
 folder=realpathSync(folder);
 const staging=join(folder,'.orientation-work');
 if(existsSync(staging)&&(!lstatSync(staging).isDirectory()||lstatSync(staging).isSymbolicLink()))throw Error('Unsafe orientation staging directory');
 let refresh=false;
 for(const file of files){
   if(file!==basename(file))throw Error('Unsafe source name');
   const path=join(folder,file),item=metadata[file],video=VIDEO_EXTS.has(extname(file).toLowerCase());
   const st=lstatSync(path);
   const prior=item.orientation;
   if(prior?.status==='corrected'){
     if(await hash(path)!==prior.sha256)throw Error('Corrected source changed: '+file);
     if(!Object.hasOwn(item,'normalized'))refresh=true;
     continue;
   }
   if(prior?.status==='pending'){
     if(!st.isFile()||st.nlink!==1)throw Error('Orientation requires independent regular source: '+file);
     const current=await hash(path),temp=join(folder,prior.temp);
     if(!/^\.orientation-work\/[a-f0-9-]+\.[a-zA-Z0-9]+$/.test(prior.temp))throw Error('Unsafe pending orientation path');
     if(current===prior.beforeSha256){if(!existsSync(temp)||await hash(temp)!==prior.sha256)throw Error('Missing staged orientation correction: '+file);invalidate(folder,file,item);renameSync(temp,path);}
     else if(current!==prior.sha256)throw Error('Orientation source changed during recovery: '+file);
     invalidate(folder,file,item);item.width=prior.width;item.height=prior.height;item.orientation={...prior,status:'corrected'};delete item.orientation.temp;save(folder,metadata);refresh=true;continue;
   }
   const decision=orientationDecision(item,video);
   if(decision.status!=='correction-required'){item.orientation=decision;save(folder,metadata);continue;}
   if(!st.isFile()||st.nlink!==1)throw Error('Orientation requires independent regular source: '+file);
   mkdirSync(staging,{recursive:true,mode:0o700});
   const tempName='.orientation-work/'+randomUUID()+extname(file),temp=join(folder,tempName);let journaled=false;
   try{
     const beforeSha256=await hash(path),size=transform(path,temp,decision.clockwise,video),sha256=await hash(temp);
     chmodSync(temp,st.mode&0o777);
     if(await hash(path)!==beforeSha256)throw Error('Source changed during orientation transform');
     // Durable intent before atomic rename prevents a crash from double-rotating.
     item.orientation={status:'pending',clockwise:decision.clockwise,beforeSha256,sha256,temp:tempName,...size};
     save(folder,metadata);journaled=true;
     invalidate(folder,file,item);renameSync(temp,path);
     item.width=size.width;item.height=size.height;item.orientation={...item.orientation,status:'corrected'};delete item.orientation.temp;save(folder,metadata);refresh=true;
   }finally{if(!journaled)rmSync(temp,{force:true});}
 }
 if(existsSync(staging)){try{rmdirSync(staging)}catch(error){if(error.code!=='ENOTEMPTY')throw error;}}
 return refresh;
}
