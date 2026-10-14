import * as React from 'react';
import type {PlayerRef} from '@remotion/player';

export function useWebAudioPreview(root:any, playerRef:React.RefObject<PlayerRef|null>) {
 const [status,setStatus]=React.useState('Web Audio initializing');
 const audio=React.useMemo(()=>root?.children?.find((x:any)=>x.type==='audio'&&String(x.src).startsWith('data:audio/')),[root]);
 const playbackRoot=React.useMemo(()=>audio?{...root,children:root.children.filter((x:any)=>x!==audio)}:root,[root,audio]);
 React.useEffect(()=>{
  if(!audio)return;
  const match=/^data:audio\/[^;,]+;base64,(.*)$/s.exec(audio.src);
  if(!match?.[1]){setStatus('Invalid audio data');return;}
  const ctx=new AudioContext();
  let buffer:AudioBuffer|null=null,source:AudioBufferSourceNode|null=null,gain:GainNode|null=null,disposed=false;
  let generation=0;
  const stop=()=>{generation++;if(source){source.onended=null;try{source.stop()}catch{}source.disconnect();source=null;}gain?.disconnect();gain=null;};
  const bytes=Uint8Array.from(atob(match[1]),c=>c.charCodeAt(0));
  ctx.decodeAudioData(bytes.buffer).then(b=>{buffer=b;if(!disposed)setStatus(`Web Audio ready · ${b.duration.toFixed(2)}s`);}).catch(e=>setStatus('Decode failed: '+String(e)));
  const play=async()=>{
   const ticket=++generation;
   try{
    await ctx.resume();
    if(ticket!==generation||disposed)return;
    if(!buffer){setStatus('Audio decoding; retry Play');return;}
    const player=playerRef.current;if(!player)return;
    const offset=player.getCurrentFrame()/(root.fps||30);
    if(offset>=buffer.duration)return;
    if(source){source.onended=null;try{source.stop()}catch{}source.disconnect();}
    const s=ctx.createBufferSource();const g=ctx.createGain();s.buffer=buffer;
    g.gain.value=player.isMuted()?0:player.getVolume();
    s.connect(g);g.connect(ctx.destination);s.start(0,Math.max(0,offset));
    source=s;gain=g;setStatus(`Web Audio playing · ${offset.toFixed(2)}s · volume ${g.gain.value}`);
   }catch(e){setStatus('Playback failed: '+String(e));}
  };
  const pause=()=>{stop();setStatus('Web Audio paused');};
  const seek=()=>{stop();if(playerRef.current?.isPlaying())void play();};
  const volume=()=>{if(gain&&playerRef.current)gain.gain.value=playerRef.current.isMuted()?0:playerRef.current.getVolume();};
  let player:PlayerRef|null=null;
  const attach=()=>{if(player)return;const p=playerRef.current;if(!p)return;player=p;
   p.addEventListener('play',play);p.addEventListener('pause',pause);p.addEventListener('ended',pause);
   p.addEventListener('seeked',seek);p.addEventListener('volumechange',volume);p.addEventListener('mutechange',volume);
  };
  attach();const poll=setInterval(attach,100);
  return()=>{disposed=true;clearInterval(poll);if(player){player.removeEventListener('play',play);player.removeEventListener('pause',pause);player.removeEventListener('ended',pause);player.removeEventListener('seeked',seek);player.removeEventListener('volumechange',volume);player.removeEventListener('mutechange',volume);}stop();void ctx.close();};
 },[audio,playerRef,root]);
 return {playbackRoot,status};
}
