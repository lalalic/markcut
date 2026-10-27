import * as React from "react";
import type {PlayerRef} from "@remotion/player";

type Cue={start:number;end:number;text:string};
function seconds(s:string){const a=s.replace(",",".").split(":").map(Number);return a.reduce((v,n)=>v*60+n,0);}
export function parseVtt(text:string):Cue[]{
 const lines=text.replace(/\r/g,"").split("\n"),cues:Cue[]=[];
 for(let i=0;i<lines.length;i++){
  if(!lines[i]!.includes("-->"))continue;
  const match=lines[i]!.match(/(\d{2}:)?\d{2}:\d{2}[.,]\d+\s*-->\s*((\d{2}:)?\d{2}:\d{2}[.,]\d+)/);
  if(!match)continue;
  const [from,to]=match[0].split("-->").map(x=>x.trim());
  const start=seconds(from!),end=seconds(to!);
  let content="";while(lines[++i]?.trim())content+=(content?" ":"")+lines[i]!.replace(/<[^>]*>/g,"");
  if(content)cues.push({start,end,text:content});
 }
 return cues;
}
export function useBrowserSpeechPreview(root:any,playerRef:React.RefObject<PlayerRef|null>,enabled:boolean){
 const [cues,setCues]=React.useState<Cue[]>([]);
 const [time,setTime]=React.useState(0);
 React.useEffect(()=>{
  setCues([]);
  if(!enabled||!root?.subtitle?.src)return;
  const ctrl=new AbortController();
  fetch(root.subtitle.src,{signal:ctrl.signal}).then(r=>{if(!r.ok)throw Error("VTT unavailable");return r.text()})
    .then(text=>setCues(parseVtt(text))).catch(()=>{});
  return ()=>ctrl.abort();
 },[root?.subtitle?.src,enabled]);
 React.useEffect(()=>{
  if(!enabled||typeof window==="undefined"||!("speechSynthesis" in window))return;
  const synth=window.speechSynthesis;
  let player:PlayerRef|null=null,disposed=false,lastIndex=-1;
  const stop=()=>{synth.cancel();lastIndex=-1;};
  const update=()=>{
   if(!player||disposed)return;
   const t=player.getCurrentFrame()/(root?.fps||30);
   setTime(t);
   if(!player.isPlaying()){stop();return;}
   const index=cues.findIndex(c=>t>=c.start&&t<c.end);
   if(index===lastIndex)return;
   synth.cancel();lastIndex=index;
   if(index>=0&&!player.isMuted()){
    const utterance=new SpeechSynthesisUtterance(cues[index]!.text);
    utterance.rate=1;utterance.volume=player.getVolume();
    synth.speak(utterance);
   }
  };
  const attach=()=>{
   if(player||!playerRef.current)return;
   player=playerRef.current;
   for(const event of ["frameupdate","play","pause","seeked","ended","mutechange"] as const)player.addEventListener(event,update);
  };
  attach();
  const poll=setInterval(attach,150);
  return()=>{disposed=true;clearInterval(poll);if(player)for(const event of ["frameupdate","play","pause","seeked","ended","mutechange"] as const)player.removeEventListener(event,update);stop();};
 },[enabled,cues,root?.fps,playerRef]);
 const active=cues.find(c=>time>=c.start&&time<c.end);
 return {caption:enabled?active?.text||"":""};
}
