import * as React from 'react';
import {Player} from '@remotion/player';
import {MarkCut, getDurationInSeconds} from '../entry';

// Shared Remotion composition, controls, and native MarkCut audio tree.
export function SharedPlayer({root, playerRef, ...props}: {root:any;playerRef?:React.Ref<any>;[key:string]:any}) {
 const fps=root?.fps||30;
 const durationInFrames=Math.max(1,Math.ceil((getDurationInSeconds(root,true)||5)*fps));
 const inputProps=React.useMemo(()=>({root,compose:{}}),[root]);
 return <Player ref={playerRef as any} component={MarkCut} inputProps={inputProps}
  durationInFrames={durationInFrames} fps={fps}
  compositionWidth={root?.width||1080} compositionHeight={root?.height||1920}
  errorFallback={({error}) => <div data-testid="markcut-player-error" role="alert" style={{
   color:"#fff",background:"#471818",fontSize:16,padding:24,whiteSpace:"pre-wrap",overflowWrap:"anywhere",
   width:"100%",height:"100%",boxSizing:"border-box",display:"flex",alignItems:"center",justifyContent:"center",
  }}>{"Playback error: "+String(error?.message||error).slice(0,800)}</div>}
  controls={true} showPlaybackRateControl={true} allowFullscreen={true}
  clickToPlay={false} doubleClickToFullscreen={true} autoPlay={false} {...props}/>;
}
