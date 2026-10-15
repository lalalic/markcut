import * as React from 'react';
import type {PlayerRef} from '@remotion/player';

export function useWebAudioPreview(root:any, playerRef:React.RefObject<PlayerRef|null>) {
 const [status,setStatus]=React.useState('');
 const {audio,playbackRoot}=React.useMemo(()=>{
  let audio:any=null;
  const strip=(node:any):any=>{
   if(!node||typeof node!=='object')return node;
   if(node.type==='audio'&&String(node.src).startsWith('https://')){audio??=node;return null;}
   return {...node,...(Array.isArray(node.children)?{children:node.children.map(strip).filter(Boolean)}:{})};
  };
  return {audio,playbackRoot:strip(root)};
 },[root]);
 React.useEffect(()=>{
  if(!audio)return;
  const ctx=new AudioContext();
  let buffer:AudioBuffer|null=null,source:AudioBufferSourceNode|null=null,gain:GainNode|null=null,disposed=false;
  let generation=0;
  const stop=()=>{generation++;if(source){source.onended=null;try{source.stop()}catch{}source.disconnect();source=null;}gain?.disconnect();gain=null;};
  fetch(audio.src,{mode:'cors'}).then(response=>{if(!response.ok)throw new Error('HTTP '+response.status);return response.arrayBuffer();})
  .then(bytes=>ctx.decodeAudioData(bytes)).then(b=>{buffer=b;if(!disposed)setStatus(`Web Audio ready · ${b.duration.toFixed(2)}s`);}).catch(e=>setStatus('Decode failed: '+String(e)));
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
