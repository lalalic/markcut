import * as React from 'react';
import {createRoot} from 'react-dom/client';
import {SharedPlayer} from '../player/SharedPlayer';
function App(){
 const [revision,setRevision]=React.useState<any>(()=>(window as any).__markcutRevision||null);
 React.useEffect(()=>{const receive=(e:Event)=>setRevision((e as CustomEvent).detail);window.addEventListener('markcut:revision',receive);return ()=>window.removeEventListener('markcut:revision',receive)},[]);
 if(!revision)return <div id="remotion-waiting">Waiting for compiled scenes…</div>;
 const data=revision.compiled?.root||revision.compiled;
 if(!data)return <div>Missing compiled scene tree</div>;
 return <div id="remotion-preview" data-revision={revision.revisionId}>
  <div id="remotion-canvas" style={{width:'100%',aspectRatio:`${data.width||1080}/${data.height||1920}`,maxHeight:'65vh',margin:'auto'}}>
   <SharedPlayer key={revision.revisionId} root={data} style={{width:'100%',height:'100%'}} />
  </div>
 </div>;
}
const el=document.getElementById('remotion-root');
if(el)createRoot(el).render(<App/>);
