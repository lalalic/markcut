import * as React from 'react';
import {createRoot} from 'react-dom/client';
import {createPortal} from 'react-dom';
import type {PlayerRef} from '@remotion/player';
import {SharedPlayer} from '../player/SharedPlayer';
import {SceneThumbnails} from '../player/components/SceneThumbnails';
import {useWebAudioPreview} from './web-audio-preview';
import {withoutRecordedNarration} from './audio-preview-tree';
import {useBrowserSpeechPreview} from './browser-speech-preview';
const PLAYER_VERSION='v38';
const contextTime=(scene:{start:number;end:number}|undefined,time:number)=>
 Math.round(Math.max(scene?.start??0,Math.min(scene?.end??time,time))*10)/10;
function App(){
 const [revision,setRevision]=React.useState<any>(()=>(window as any).__markcutRevision||null);
 const ref=React.useRef<PlayerRef|null>(null);
 const [currentTime,setCurrentTime]=React.useState(0);
 const [browserTts,setBrowserTts]=React.useState(true);
 const [commentedScenes,setCommentedScenes]=React.useState<string[]>([]);
 const [spotMarkers,setSpotMarkers]=React.useState<Array<{id:number;scope:'overall'|'scene'|'spot';text:string;context:{timeSeconds:number;sceneName?:string};selected:boolean;placeholder?:boolean}>>([{id:0,scope:'overall',text:'',context:{timeSeconds:0},selected:false,placeholder:true}]);
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
 const {playbackRoot:generatedRoot,status}=useWebAudioPreview(data,ref);
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
 const videoName=String(revision.title||revision.videoTitle||revision.path?.split('/').pop()?.replace(/\.md$/i,'').replace(/[-_]+/g,' ')||'Video');
 return <div id="remotion-preview" data-revision={revision.revisionId}>
  {document.getElementById("header-tts")&&createPortal(
   <label style={{display:"flex",gap:5,alignItems:"center",fontSize:12,whiteSpace:"nowrap",cursor:"pointer"}} title="Use browser narration with captions from the script">
    <input type="checkbox" checked={useBrowserTts} disabled={!data?.subtitle?.src} onChange={e=>setBrowserTts(e.target.checked)}/>
    Browser TTS
   </label>,document.getElementById("header-tts")!)}
  <div id="remotion-canvas" style={{position:'relative',width:'100%',aspectRatio:`${data.width||1080}/${data.height||1920}`,maxHeight:'65vh',margin:'auto'}}>
   <SharedPlayer key={revision.revisionId} root={playbackRoot} playerRef={ref} numberOfSharedAudioTags={0} style={{width:'100%',height:'100%'}} />
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
  {status && !/initializing|ready|paused/i.test(status) && <div id="preview-audio-status" role="status" style={{fontSize:12,padding:'4px 0'}}>{status.replace(/^Web Audio /,'Audio ')}</div>}
 </div>;
}
const el=document.getElementById('remotion-root');
if(el)createRoot(el).render(<App/>);
