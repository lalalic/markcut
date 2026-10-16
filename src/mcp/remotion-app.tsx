import * as React from 'react';
import {createRoot} from 'react-dom/client';
import type {PlayerRef} from '@remotion/player';
import {SharedPlayer} from '../player/SharedPlayer';
import {SceneThumbnails} from '../player/components/SceneThumbnails';
import {useWebAudioPreview} from './web-audio-preview';
import {useBrowserSpeechPreview} from './browser-speech-preview';
const PLAYER_VERSION='v23';
function App(){
 const [revision,setRevision]=React.useState<any>(()=>(window as any).__markcutRevision||null);
 const ref=React.useRef<PlayerRef|null>(null);
 const [currentTime,setCurrentTime]=React.useState(0);
 const [browserTts,setBrowserTts]=React.useState(true);
 React.useEffect(()=>{const receive=(e:Event)=>setRevision((e as CustomEvent).detail);window.addEventListener('markcut:revision',receive);return ()=>window.removeEventListener('markcut:revision',receive)},[]);
 const data=revision?.compiled?.root||revision?.compiled;
 const useBrowserTts=browserTts&&Boolean(data?.subtitle?.src);
 const {playbackRoot:generatedRoot,status}=useWebAudioPreview(useBrowserTts?null:data,ref);
 const playbackRoot=React.useMemo(()=>{
  if(!useBrowserTts)return generatedRoot;
  const strip=(n:any):any=>{
   if(!n||typeof n!=="object")return n;
   if(n.type==="audio")return null;
   return {...n,...(Array.isArray(n.children)?{children:n.children.map(strip).filter(Boolean)}:{})};
  };
  return {...strip(data),subtitle:undefined};
 },[data,generatedRoot,useBrowserTts]);
 const {caption}=useBrowserSpeechPreview(data,ref,useBrowserTts);
 const fps=data?.fps||30;
 const scenes=React.useMemo(()=>{
  const children=(data?.children||[]).filter((x:any)=>x.type==='scene'&&x.visible!==false);
  const overlap=Math.max(0,Number(data?.transitionTime)||0);
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
   sceneId:active?.id||null,sceneName:active?.name||null,
   timeSeconds:Math.round(currentTime*10)/10
  };
 },[scenes,currentTime]);
 if(!revision)return <div id="remotion-waiting">Player {PLAYER_VERSION} · Waiting for compiled scenes…</div>;
 if(!data)return <div>Missing compiled scene tree</div>;
 const videoName=String(revision.title||revision.videoTitle||revision.path?.split('/').pop()?.replace(/\.md$/i,'').replace(/[-_]+/g,' ')||'Video');
 return <div id="remotion-preview" data-revision={revision.revisionId}>
  <label style={{display:"flex",gap:8,alignItems:"center",fontSize:12,padding:"5px 0"}}>
   <input type="checkbox" checked={useBrowserTts} disabled={!data?.subtitle?.src} onChange={e=>setBrowserTts(e.target.checked)}/>
   Browser TTS + script captions
  </label>
  <div id="remotion-canvas" style={{width:'100%',aspectRatio:`${data.width||1080}/${data.height||1920}`,maxHeight:'65vh',margin:'auto'}}>
   <SharedPlayer key={revision.revisionId} root={playbackRoot} playerRef={ref} numberOfSharedAudioTags={0} style={{width:'100%',height:'100%'}} />
  </div>
  {useBrowserTts&&caption&&<div role="status" style={{textAlign:"center",padding:"6px 12px",fontSize:13}}>{caption}</div>}
  <SceneThumbnails sceneData={scenes} currentTime={currentTime} onSeek={t=>{ref.current?.seekTo(Math.round(t*fps));setCurrentTime(t);}} />
  {status && !/initializing|ready|paused/i.test(status) && <div id="preview-audio-status" role="status" style={{fontSize:12,padding:'4px 0'}}>{status.replace(/^Web Audio /,'Audio ')}</div>}
 </div>;
}
const el=document.getElementById('remotion-root');
if(el)createRoot(el).render(<App/>);
