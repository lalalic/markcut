import * as React from 'react';
import {createRoot} from 'react-dom/client';
import type {PlayerRef} from '@remotion/player';
import {SharedPlayer} from '../player/SharedPlayer';
import {useWebAudioPreview} from './web-audio-preview';
const PLAYER_VERSION='v20';
function App(){
 const [revision,setRevision]=React.useState<any>(()=>(window as any).__markcutRevision||null);
 const ref=React.useRef<PlayerRef|null>(null);
 React.useEffect(()=>{const receive=(e:Event)=>setRevision((e as CustomEvent).detail);window.addEventListener('markcut:revision',receive);return ()=>window.removeEventListener('markcut:revision',receive)},[]);
 const data=revision?.compiled?.root||revision?.compiled;
 const {playbackRoot,status}=useWebAudioPreview(data,ref);
 if(!revision)return <div id="remotion-waiting">Player {PLAYER_VERSION} · Waiting for compiled scenes…</div>;
 if(!data)return <div>Missing compiled scene tree</div>;
 const videoName=String(revision.title||revision.videoTitle||revision.path?.split('/').pop()?.replace(/\.md$/i,'').replace(/[-_]+/g,' ')||'Video');
 return <div id="remotion-preview" data-revision={revision.revisionId}>
  <div id="preview-version" style={{fontSize:12,padding:'4px 0',overflowWrap:'anywhere'}}>Player {PLAYER_VERSION} · Video {videoName} · Revision {String(revision.revisionId||'').slice(0,8)}</div>
  <div id="remotion-canvas" style={{width:'100%',aspectRatio:`${data.width||1080}/${data.height||1920}`,maxHeight:'65vh',margin:'auto'}}>
   <SharedPlayer key={revision.revisionId} root={playbackRoot} playerRef={ref} numberOfSharedAudioTags={0} style={{width:'100%',height:'100%'}} />
  </div>
  {status && !/initializing|ready|paused/i.test(status) && <div id="preview-audio-status" role="status" style={{fontSize:12,padding:'4px 0'}}>{status.replace(/^Web Audio /,'Audio ')}</div>}
 </div>;
}
const el=document.getElementById('remotion-root');
if(el)createRoot(el).render(<App/>);
