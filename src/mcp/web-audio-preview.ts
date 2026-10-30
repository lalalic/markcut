import * as React from 'react';
import type {PlayerRef} from '@remotion/player';
import {extractRemotePreviewAudio,previewBgmGain} from './audio-preview-tree';

export function useWebAudioPreview(root:any, playerRef:React.RefObject<PlayerRef|null>) {
 const [status,setStatus]=React.useState('');
 const {audio,playbackRoot}=React.useMemo(()=>extractRemotePreviewAudio(root),[root]);
 React.useEffect(()=>{
  if(!audio)return;
  setStatus('BGM loading');
  // Fetch the media before creating an AudioContext: embedded hosts can defer
  // context creation until playback is authorized.
  let ctx:AudioContext|null=null;
  let buffer:AudioBuffer|null=null,source:AudioBufferSourceNode|null=null,gain:GainNode|null=null,disposed=false;
  let generation=0, narrationSpeaking=false;
  const stop=()=>{generation++;if(source){source.onended=null;try{source.stop()}catch{}source.disconnect();source=null;}gain?.disconnect();gain=null;};
  const play=async()=>{
   const ticket=++generation;
   try{
    ctx??=new AudioContext();
    await ctx.resume();
    if(ticket!==generation||disposed)return;
    if(!buffer){setStatus('BGM loading; will start after decoding');return;}
    const player=playerRef.current;if(!player)return;
    const offset=player.getCurrentFrame()/(root.fps||30);
    if(offset>=buffer.duration)return;
    if(source){source.onended=null;try{source.stop()}catch{}source.disconnect();}
    const s=ctx.createBufferSource();const g=ctx.createGain();s.buffer=buffer;
    g.gain.value=previewBgmGain(player.getVolume(),audio.volume??1,player.isMuted(),narrationSpeaking);
    s.connect(g);g.connect(ctx.destination);s.start(0,Math.max(0,offset));
    source=s;gain=g;setStatus(ctx.state==='running'?`BGM playing · ${offset.toFixed(2)}s · volume ${g.gain.value}`:`BGM suspended: ${ctx.state}`);
   }catch(e){setStatus('Playback failed: '+String(e));}
  };
  // Play may start before the MP3 downloads and decodes. Automatically
  // attach the soundtrack at the current frame once it becomes ready.
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),15000);
  fetch(audio.src,{mode:'cors',signal:controller.signal})
   .then(response=>{if(!response.ok)throw new Error('HTTP '+response.status);return response.arrayBuffer();})
   .then(bytes=>{if(disposed)return null;ctx??=new AudioContext();return ctx.decodeAudioData(bytes);})
   .then(b=>{if(disposed||!b)return;buffer=b;setStatus(`BGM decoded · ${b.duration.toFixed(2)}s`);if(playerRef.current?.isPlaying())void play();})
   .catch(e=>{if(!disposed)setStatus('BGM load failed: '+String(e));})
   .finally(()=>clearTimeout(timeout));
  const pause=()=>{stop();setStatus('Web Audio paused');};
  const seek=()=>{stop();if(playerRef.current?.isPlaying())void play();};
  const volume=()=>{
   const p=playerRef.current;
   if(!gain||!p||!ctx)return;
   const value=previewBgmGain(p.getVolume(),audio.volume??1,p.isMuted(),narrationSpeaking);
   gain.gain.cancelScheduledValues(ctx.currentTime);
   gain.gain.setTargetAtTime(value,ctx.currentTime,0.08);
  };
  const onNarration=(e:Event)=>{
   narrationSpeaking=Boolean((e as CustomEvent<{active:boolean}>).detail?.active);
   volume();
  };
  window.addEventListener('markcut:tts-speaking',onNarration);
  let player:PlayerRef|null=null;
  const attach=()=>{if(player)return;const p=playerRef.current;if(!p)return;player=p;
   p.addEventListener('play',play);p.addEventListener('pause',pause);p.addEventListener('ended',pause);
   p.addEventListener('seeked',seek);p.addEventListener('volumechange',volume);p.addEventListener('mutechange',volume);
  };
  attach();const poll=setInterval(attach,100);
  return()=>{disposed=true;controller.abort();clearTimeout(timeout);clearInterval(poll);if(player){player.removeEventListener('play',play);player.removeEventListener('pause',pause);player.removeEventListener('ended',pause);player.removeEventListener('seeked',seek);player.removeEventListener('volumechange',volume);player.removeEventListener('mutechange',volume);}stop();window.removeEventListener('markcut:tts-speaking',onNarration);if(ctx)void ctx.close();};
 },[audio,playerRef,root]);
 return {playbackRoot,status};
}
