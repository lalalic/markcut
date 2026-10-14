import * as React from 'react';
import {createRoot} from 'react-dom/client';
import {Player} from '@remotion/player';
import {MarkCut, getDurationInSeconds} from '../entry';
function App(){
 const [revision,setRevision]=React.useState<any>(()=>(window as any).__markcutRevision||null);
 const ref=React.useRef<any>(null);
 const [frame,setFrame]=React.useState(0);
 const [playing,setPlaying]=React.useState(false);
 React.useEffect(()=>{const receive=(e:Event)=>{setRevision((e as CustomEvent).detail);setFrame(0);setPlaying(false)};window.addEventListener('markcut:revision',receive);return ()=>window.removeEventListener('markcut:revision',receive)},[]);
 React.useEffect(()=>{const player=ref.current;if(!player)return;(window as any).__markcutPlayer=player;const tick=()=>{setFrame(player.getCurrentFrame());setPlaying(player.isPlaying())};player.addEventListener('frameupdate',tick);player.addEventListener('play',tick);player.addEventListener('pause',tick);tick();return ()=>{player.removeEventListener('frameupdate',tick);player.removeEventListener('play',tick);player.removeEventListener('pause',tick)}},[revision]);
 if(!revision)return <div id="remotion-waiting">Waiting for compiled scenes…</div>;
 const data=revision.compiled?.root||revision.compiled;
 if(!data)return <div>Missing compiled scene tree</div>;
 const fps=data.fps||30;
 const duration=Math.max(1,Math.ceil((getDurationInSeconds(data,true)||5)*fps));
 const seek=(value:number)=>ref.current?.seekTo(Math.min(duration-1,Math.max(0,value)));
 return <div id="remotion-preview" data-revision={revision.revisionId}>
 <div id="remotion-canvas" style={{width:'100%',aspectRatio:`${data.width||1080}/${data.height||1920}`,maxHeight:'65vh',margin:'auto'}}>
 <Player key={revision.revisionId} ref={ref} component={MarkCut} inputProps={{root:data}} durationInFrames={duration} fps={fps} compositionWidth={data.width||1080} compositionHeight={data.height||1920} style={{height:'100%',width:'100%'}} controls={false} autoPlay={false} initiallyMuted={true}/>
 </div>
 <div className="transport"><button type="button" id="remotion-toggle" onClick={()=>playing?ref.current?.pause():ref.current?.play()}>{playing?'Pause':'Play'}</button>
 <input id="remotion-seek" type="range" min={0} max={duration-1} value={frame} onChange={e=>seek(Number(e.target.value))}/>
 <output id="remotion-frame">{frame} / {duration-1} frames</output></div>
 </div>;
}
const el=document.getElementById('remotion-root');
if(el)createRoot(el).render(<App/>);