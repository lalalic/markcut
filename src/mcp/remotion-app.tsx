import * as React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {createRoot} from 'react-dom/client';
import {createPortal} from 'react-dom';
import type {PlayerRef} from '@remotion/player';
import {SharedPlayer} from '../player/SharedPlayer';
import {SceneThumbnails} from '../player/components/SceneThumbnails';
import {useWebAudioPreview} from './web-audio-preview';
import {withoutRecordedNarration} from './audio-preview-tree';
import {useBrowserSpeechPreview} from './browser-speech-preview';
// The question text is stored as base64 UTF-8 in the normal compiled Scene title.
function QuestionsPanel({data,revisionId}:{data:any;revisionId:string}){
 const scenes=React.useMemo(()=> (data?.children||[]).filter((scene:any)=>scene.type==='scene').map((scene:any,index:number)=>({
  name:String(scene.name||'Q'+(index+1)),id:scene.id,
  markdown:decodeQuestion(String(scene.title||'')),
 })),[data]);
 const [answers,setAnswers]=React.useState<Record<string,string>>({});
 const emit=(next:Record<string,string>)=>window.dispatchEvent(new CustomEvent('markcut:questions-change',{detail:{answers:next}}));
 React.useEffect(()=>{setAnswers({});emit({});},[revisionId]);
 return <section id="markcut-questions" aria-label="Questions" style={{display:'grid',gap:18,padding:'10px 0 18px'}}>
  {scenes.map((q:{name:string;id:string;markdown:string},index:number)=><div key={q.name} className="markcut-question" style={{borderTop:"1px solid #e2e8f0",paddingTop:10}}>
   <div style={{color:'#64748b',fontSize:12,fontWeight:600}}>Q{index+1}</div>
   <div className="markcut-question-md" style={{lineHeight:1.55,overflowWrap:"anywhere"}}><ReactMarkdown remarkPlugins={[remarkGfm]}>{q.markdown}</ReactMarkdown></div>
   <textarea aria-label={'Answer '+(index+1)} placeholder="Your answer…" rows={3} style={{boxSizing:"border-box",width:"100%",minHeight:75,border:"1px solid #b5bdc8",borderRadius:6,padding:9,font:"inherit",resize:"vertical"}} value={answers[q.name]||''}
     onChange={e=>{const next={...answers,[q.name]:e.target.value};setAnswers(next);emit(next);}}/>
  </div>)}
 </section>;
}
function decodeQuestion(value:string){
 if(!value.startsWith('md64:'))return value;
 try{return new TextDecoder().decode(Uint8Array.from(atob(value.slice(5)),char=>char.charCodeAt(0)));}
 catch{return 'Question unavailable';}
}
const PLAYER_VERSION='v38';
const contextTime=(scene:{start:number;end:number}|undefined,time:number)=>
 Math.round(Math.max(scene?.start??0,Math.min(scene?.end??time,time))*10)/10;
function App(){
 const [revision,setRevision]=React.useState<any>(()=>(window as any).__markcutRevision||null);
 const ref=React.useRef<PlayerRef|null>(null);
 const [currentTime,setCurrentTime]=React.useState(0);
 const [browserTts,setBrowserTts]=React.useState(true);
 const [compact,setCompact]=React.useState(()=>window.matchMedia('(max-width: 640px), (max-width: 900px) and (max-height: 520px)').matches);
 React.useEffect(()=>{
  const query=window.matchMedia('(max-width: 640px), (max-width: 900px) and (max-height: 520px)');
  const update=()=>setCompact(query.matches);
  query.addEventListener('change',update);
  return ()=>query.removeEventListener('change',update);
 },[]);
 const [commentedScenes,setCommentedScenes]=React.useState<string[]>([]);
 const [spotMarkers,setSpotMarkers]=React.useState<Array<{id:number;scope:'overall'|'scene'|'spot';text:string;context:{timeSeconds:number;sceneName?:string};selected:boolean;placeholder?:boolean}>>([{id:0,scope:'overall',text:'',context:{timeSeconds:0},selected:true,placeholder:true}]);
 const [seekBar,setSeekBar]=React.useState<HTMLElement|null>(null);
 React.useEffect(()=>{
  const listener=(event:Event)=>setCommentedScenes((event as CustomEvent).detail?.sceneNames||[]);
  window.addEventListener('markcut:comments-change',listener);
  return ()=>window.removeEventListener('markcut:comments-change',listener);
 },[]);
 React.useEffect(()=>{
  const listener=(event:Event)=>setSpotMarkers((event as CustomEvent).detail?.spots||[]);
  window.addEventListener('markcut:spots-change',listener);
  return ()=>window.removeEventListener('markcut:spots-change',listener);
 },[]);
 React.useEffect(()=>{const receive=(e:Event)=>setRevision((e as CustomEvent).detail);window.addEventListener('markcut:revision',receive);return ()=>window.removeEventListener('markcut:revision',receive)},[]);
 const data=revision?.compiled?.root||revision?.compiled;
 const useBrowserTts=browserTts&&Boolean(data?.subtitle?.src);
 const {playbackRoot:generatedRoot}=useWebAudioPreview(data,ref);
 const playbackRoot=React.useMemo(()=>{
  if(!useBrowserTts)return generatedRoot;
  return withoutRecordedNarration(generatedRoot);
 },[data,generatedRoot,useBrowserTts]);
 const {caption}=useBrowserSpeechPreview(data,ref,useBrowserTts);
 const fps=data?.fps||30;
 const scenes=React.useMemo(()=>{
  const children=(data?.children||[]).filter((x:any)=>x.type==='scene'&&x.visible!==false);
  const overlap=data?.transition?Math.max(0,Number(data?.transitionTime)||0):0;
  let start=0;
  return children.map((scene:any,index:number)=>{
   const duration=Math.max(0,Number(scene.durationInSeconds)||0);
   const entry={name:String(scene.name||'Scene '+(index+1)),start,end:start+duration,id:scene.id};
   start+=Math.max(0,duration-(index<children.length-1?overlap:0));
   return entry;
  });
 },[data]);
 React.useEffect(()=>{
  const player=ref.current;if(!player)return;
  const listener=(e:any)=>{if(typeof e.detail?.frame==='number')setCurrentTime(e.detail.frame/fps);};
  player.addEventListener('frameupdate',listener);
  return ()=>player.removeEventListener('frameupdate',listener);
 },[revision?.revisionId,playbackRoot,fps]);
 React.useEffect(()=>{
  const active=[...scenes].reverse().find(scene=>currentTime>=scene.start);
  (window as any).__markcutPlaybackContext={
   sceneId:active?.id||null,sceneName:active?.name||null,sceneStart:active?.start||0,
   timeSeconds:contextTime(active,currentTime)
  };
 },[scenes,currentTime]);
 const activeScene=[...scenes].reverse().find(scene=>currentTime>=scene.start);
 React.useEffect(()=>{
  let timer:number;
  const find=()=>{
   const bar=Array.from(document.querySelectorAll<HTMLElement>('#remotion-canvas div')).find(el=>
    el.style.cursor==='pointer'&&el.style.touchAction==='none'&&el.style.position==='relative');
   if(bar){
    bar.style.marginLeft='44px';setSeekBar(bar);window.clearInterval(timer);
   }
  };
  find();timer=window.setInterval(find,150);
  return ()=>window.clearInterval(timer);
 },[revision?.revisionId]);
 React.useEffect(()=>{
  window.dispatchEvent(new CustomEvent('markcut:scene-change',{detail:{sceneId:activeScene?.id||null,sceneName:activeScene?.name||null,sceneStart:activeScene?.start||0,timeSeconds:contextTime(activeScene,currentTime)}}));
 },[revision?.revisionId,activeScene?.id,activeScene?.name]);
 React.useEffect(()=>{
  const listener=(event:Event)=>{const context=(event as CustomEvent).detail;const scene=scenes.find((x:{id?:string;name:string;start:number;end:number})=>x.id===context?.sceneId||x.name===context?.sceneName);
   if(scene){const second=Number(context.timeSeconds);const time=Number.isFinite(second)?Math.max(scene.start,Math.min(scene.end,second)):scene.start;ref.current?.seekTo(Math.round(time*fps));setCurrentTime(time);}
  };
  window.addEventListener('markcut:comment-select',listener);
  return ()=>window.removeEventListener('markcut:comment-select',listener);
 },[scenes,fps]);
 if(!revision)return <div id="remotion-waiting">Player {PLAYER_VERSION} · Waiting for compiled scenes…</div>;
 if(!data)return <div>Missing compiled scene tree</div>;
 if(revision.review?.mode==='questions')return <QuestionsPanel key={revision.revisionId} data={data} revisionId={revision.revisionId}/>;
 const videoName=String(revision.title||revision.videoTitle||revision.path?.split('/').pop()?.replace(/\.md$/i,'').replace(/[-_]+/g,' ')||'Video');
 return <div id="remotion-preview" data-revision={revision.revisionId}>
  {Boolean(data?.subtitle?.src)&&document.getElementById("header-tts")&&createPortal(
   <label style={{display:"flex",gap:5,alignItems:"center",fontSize:12,whiteSpace:"nowrap",cursor:"pointer"}} title="Use browser narration with captions from the script">
    <input type="checkbox" checked={useBrowserTts} disabled={!data?.subtitle?.src} onChange={e=>setBrowserTts(e.target.checked)}/>
    Browser TTS
   </label>,document.getElementById("header-tts")!)}
  <div id="remotion-canvas" style={{position:'relative',aspectRatio:`${data.width||1080}/${data.height||1920}`,margin:'auto', '--markcut-player-ratio':String((data.width||1080)/(data.height||1920))} as React.CSSProperties}>
   <SharedPlayer key={revision.revisionId} root={playbackRoot} playerRef={ref} numberOfSharedAudioTags={0} showPlaybackRateControl={!compact} style={{width:'100%',height:'100%'}} />
   {useBrowserTts&&caption&&<div id="browser-tts-caption" aria-live="off" style={{position:'absolute',bottom:50,left:12,right:12,zIndex:5,pointerEvents:'none',textAlign:'center'}}>
    <span style={{display:'inline-block',maxWidth:'90%',padding:'5px 10px',borderRadius:5,background:'rgba(0,0,0,.72)',color:'#fff',fontSize:'clamp(12px,1.6vw,18px)',lineHeight:1.4,textShadow:'0 1px 2px #000',overflowWrap:'anywhere'}}>{caption}</span>
   </div>}
  </div>
  <SceneThumbnails sceneData={scenes} commentedScenes={commentedScenes} currentTime={currentTime} onSeek={t=>{ref.current?.seekTo(Math.round(t*fps));setCurrentTime(t);}} />
  {seekBar&&createPortal(<>
   {spotMarkers.map(note=>{
    const duration=Math.max(0.001,Number(data.durationInSeconds)||scenes.at(-1)?.end||1);
    const time=Number(note.context.timeSeconds)||0;
    const left=note.scope==='overall'?'0px':(Math.max(0,Math.min(1,time/duration))*100)+'%';
    return <button key={note.id} type="button" className={'comment-marker scope-'+note.scope+(note.selected?' selected':'')+(note.placeholder?' placeholder':'')}
     style={{left}} title={note.placeholder?'Add overall comment':note.scope+' · '+time+'s · '+note.text}
     aria-label={note.placeholder?'Add overall comment':'Edit '+note.scope+' comment at '+time+' seconds'}
     onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();window.dispatchEvent(new CustomEvent('markcut:spot-select',{detail:{id:note.id}}));}}/>;
   })}
  </>,seekBar)}
 </div>;
}
const el=document.getElementById('remotion-root');
if(el)createRoot(el).render(<App/>);
