// The MCP iframe plays HTTPS tracks through Web Audio instead of Remotion media
// elements. Keep the selected track separate from the visual playback tree.
export function extractRemotePreviewAudio(root:any) {
 let audio:any=null;
 const strip=(node:any):any=>{
  if(!node||typeof node!=='object')return node;
  if(node.type==='audio'&&String(node.src).startsWith('https://')){
   audio??=node;
   return null;
  }
  return {...node,...(Array.isArray(node.children)?{children:node.children.map(strip).filter(Boolean)}:{})};
 };
 // IMPORTANT: do not return {audio, playbackRoot: strip(root)}. Object
 // properties are evaluated left to right; audio would be captured as null.
 const playbackRoot=strip(root);
 return {audio,playbackRoot};
}

// Browser TTS suppresses recorded non-background audio, but preserves the soundtrack.
export function withoutRecordedNarration(root:any):any {
 if(!root||typeof root!=='object')return root;
 if(root.type==='audio'&&!root.isBackground)return null;
 return {...root,...(Array.isArray(root.children)?{children:root.children.map(withoutRecordedNarration).filter(Boolean)}:{}),
  ...(root.type==='root'?{subtitle:undefined}:{})};
}
