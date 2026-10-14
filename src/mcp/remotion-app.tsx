import * as React from 'react';
import {createRoot} from 'react-dom/client';
import {SharedPlayer} from '../player/SharedPlayer';

const PLAYER_VERSION='v14';

function prepareAudio(root:any){
 const urls:string[]=[];
 const children=(root.children||[]).map((child:any)=>{
  if(child.type!=='audio'||typeof child.src!=='string'||!child.src.startsWith('data:audio/'))return child;
  const match=/^data:(audio\/[^;,]+);base64,(.+)$/s.exec(child.src);
  if(!match||!match[1]||!match[2])return child;
  try{
   const raw=atob(match[2]);
   const bytes=new Uint8Array(raw.length);
   for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
   const url=URL.createObjectURL(new Blob([bytes],{type:match[1]}));
   urls.push(url);
   return {...child,src:url};
  }catch{return child;}
 });
 return {root:{...root,children},urls};
}
function App(){
 const [revision,setRevision]=React.useState<any>(()=>(window as any).__markcutRevision||null);
 const [audioDiagnostics,setAudioDiagnostics]=React.useState('');
 const ref=React.useRef<any>(null);
 React.useEffect(()=>{const receive=(e:Event)=>setRevision((e as CustomEvent).detail);window.addEventListener('markcut:revision',receive);return ()=>window.removeEventListener('markcut:revision',receive)},[]);
 const data=revision?.compiled?.root||revision?.compiled;
 const prepared=React.useMemo(()=>data?prepareAudio(data):null,[data]);
 React.useEffect(()=>()=>{prepared?.urls.forEach(url=>URL.revokeObjectURL(url))},[prepared]);
 React.useEffect(()=>{
  const check=()=>{
   if(!data)return;
   const track=data.children?.find((x:any)=>x.type==='audio');
   if(!track){setAudioDiagnostics('No audio track in scene tree');return;}
   const elements=Array.from(document.querySelectorAll('audio'));
   if(!elements.length){setAudioDiagnostics('Audio track present; browser audio element not mounted');return;}
   const a=elements.find(x=>x.currentSrc.startsWith('blob:'))||elements[0];
   if(!a)return;
   const error=a.error;
   const state=error?`error ${error.code}: ${error.message}`:`readyState ${a.readyState}/4 · networkState ${a.networkState} · ${a.paused?'paused':'playing'}`;
   setAudioDiagnostics(`Audio ${prepared?.urls.length?'Blob':'data URI'} · ${state} · ${a.muted?'muted':'unmuted'} · volume ${a.volume} · elements ${elements.length}`);
  };
  check();const timer=setInterval(check,500);return()=>clearInterval(timer);
 },[data,prepared]);
 if(!revision)return <div id="remotion-waiting">Player {PLAYER_VERSION} · Waiting for compiled scenes…</div>;
 if(!prepared)return <div>Missing compiled scene tree</div>;
 const root=prepared.root;
 const videoName=String(revision.path||'unknown.md').split('/').pop();
 return <div id="remotion-preview" data-revision={revision.revisionId}>
  <div id="preview-version" style={{fontSize:12,padding:'4px 0',overflowWrap:'anywhere'}}>Player {PLAYER_VERSION} · Video {videoName} · Revision {String(revision.revisionId||'').slice(0,8)}</div>
  <div id="remotion-canvas" style={{width:'100%',aspectRatio:`${root.width||1080}/${root.height||1920}`,maxHeight:'65vh',margin:'auto'}}>
   <SharedPlayer key={revision.revisionId} root={root} playerRef={ref} style={{width:'100%',height:'100%'}} />
  </div>
  <div id="preview-audio-status" role="status" style={{fontSize:12,padding:'4px 0'}}>{audioDiagnostics}</div>
 </div>;
}
const el=document.getElementById('remotion-root');
if(el)createRoot(el).render(<App/>);
