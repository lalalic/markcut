// The MCP iframe plays HTTPS tracks through Web Audio instead of Remotion media
// elements. Keep the selected track separate from the visual playback tree.
export function extractRemotePreviewAudio(root:any) {
 let audio:any=null;
 const strip=(node:any):any=>{
  if(!node||typeof node!=='object')return node;
  // Only take the global HTTPS music bed. Preserve environmental/SFX tracks
  // in the Remotion tree instead of silently dropping all remote audio.
  if(node.type==='audio'&&node.isBackground&&String(node.src).startsWith('https://')&&!audio){
   audio=node;
   return null;
  }
  return {...node,...(Array.isArray(node.children)?{children:node.children.map(strip).filter(Boolean)}:{})};
 };
 // IMPORTANT: do not return {audio, playbackRoot: strip(root)}. Object
 // properties are evaluated left to right; audio would be captured as null.
 const playbackRoot=strip(root);
 return {audio,playbackRoot};
}

// Suppress only identified generated narration, not arbitrary non-background
// sounds. Resolution deletes script text but retains speaker, and generated
// narration paths use the tts directory.
export function isRecordedNarration(node:any):boolean {
 if(node?.type!=='audio'||node.isBackground)return false;
 if(node.isNarration===true)return true;
 const label=String(node.role||node.kind||node.name||node.id||'').toLowerCase();
 const src=String(node.src||'');
 return Boolean(node.speaker) || /^(narration|voiceover|tts)(?:[-_ ]|$)/.test(label)
  || /(?:^|[/\\])tts[/\\]/i.test(src);
}

export function withoutRecordedNarration(root:any):any {
 if(!root||typeof root!=='object')return root;
 if(isRecordedNarration(root))return null;
 return {...root,...(Array.isArray(root.children)?{children:root.children.map(withoutRecordedNarration).filter(Boolean)}:{}),
  ...(root.type==='root'?{subtitle:undefined}:{})};
}

export const NARRATION_DUCK_FACTOR=0.28;
export function previewBgmGain(playerVolume:number,trackVolume:number,muted:boolean,narrationSpeaking:boolean){
 return muted?0:Math.max(0,playerVolume)*Math.max(0,trackVolume)*(narrationSpeaking?NARRATION_DUCK_FACTOR:1);
}
