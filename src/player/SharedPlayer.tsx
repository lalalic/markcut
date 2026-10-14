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
  controls={true} showPlaybackRateControl={true} allowFullscreen={true}
  clickToPlay={false} doubleClickToFullscreen={true} autoPlay={false} {...props}/>;
}
