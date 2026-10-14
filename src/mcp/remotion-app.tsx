import * as React from 'react';
import {createRoot} from 'react-dom/client';
import {SharedPlayer} from '../player/SharedPlayer';
const PLAYER_VERSION='v12';
function App(){
 const [revision,setRevision]=React.useState<any>(()=>(window as any).__markcutRevision||null);
 const [audioDiagnostics,setAudioDiagnostics]=React.useState('');
 const ref=React.useRef<any>(null);
 React.useEffect(()=>{const receive=(e:Event)=>setRevision((e as CustomEvent).detail);window.addEventListener('markcut:revision',receive);return ()=>window.removeEventListener('markcut:revision',receive)},[]);
 React.useEffect(()=>{
  const check=()=>{
   const elements=Array.from(document.querySelectorAll('audio'));
   if(!revision)return;
   const audioTrack=(revision.compiled?.root||revision.compiled)?.children?.find((x:any)=>x.type==='audio');
   if(!audioTrack){setAudioDiagnostics('No audio track in scene tree');return;}
   if(!elements.length){setAudioDiagnostics('Audio track present; browser audio element not mounted');return;}
   const a=elements[0];
   const err=a.error;
   setAudioDiagnostics(err?`Audio error ${err.code}: ${err.message}`:`Audio ${a.readyState>=2?'loaded':'loading'} · ${a.muted?'muted':'unmuted'} · volume ${a.volume} · ${a.paused?'paused':'playing'}`);
  };
  check();const timer=setInterval(check,1000);return()=>clearInterval(timer);
 },[revision]);
 if(!revision)return <div id="remotion-waiting">Player {PLAYER_VERSION} · Waiting for compiled scenes…</div>;
 const data=revision.compiled?.root||revision.compiled;
 if(!data)return <div>Missing compiled scene tree</div>;
 const videoName=String(revision.path||'unknown.md').split('/').pop();
 return <div id="remotion-preview" data-revision={revision.revisionId}>
  <div id="preview-version" style={{fontSize:12,padding:'4px 0',overflowWrap:'anywhere'}}>Player {PLAYER_VERSION} · Video {videoName} · Revision {String(revision.revisionId||'').slice(0,8)}</div>
  <div id="remotion-canvas" style={{width:'100%',aspectRatio:`${data.width||1080}/${data.height||1920}`,maxHeight:'65vh',margin:'auto'}}>
   <SharedPlayer key={revision.revisionId} root={data} playerRef={ref} style={{width:'100%',height:'100%'}} />
  </div>
  <div id="preview-audio-status" role="status" style={{fontSize:12,padding:'4px 0'}}>{audioDiagnostics}</div>
 </div>;
}
const el=document.getElementById('remotion-root');
if(el)createRoot(el).render(<App/>);
