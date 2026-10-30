import {describe,expect,it} from 'vitest';
import {extractRemotePreviewAudio,withoutRecordedNarration} from '../src/mcp/audio-preview-tree';

const remote='https://neoy.qili2.com/files/_neoy/markcut/generated/test/audio.mp3';
const soundtrack={type:'audio',src:remote,isBackground:true,volume:0.95};
const narration={type:'audio',src:'assets/narration.mp3',foreground:true};
const scene={type:'scene',name:'Opening',children:[{type:'image',src:'image.jpg'},narration]};
const root={type:'root',fps:30,subtitle:{src:'captions.vtt'},children:[soundtrack,scene]};

describe('MCP Web Audio preview source preservation',()=>{
 it('captures the HTTPS soundtrack before returning a tree without the native audio tag',()=>{
  const {audio,playbackRoot}=extractRemotePreviewAudio(root);
  expect(audio).toBe(soundtrack);
  expect(playbackRoot.children.map((node:{type:string})=>node.type)).toEqual(['scene']);
  expect(root.children[0]).toBe(soundtrack);
  expect(root.children).toHaveLength(2);
 });
 it('keeps background music with browser TTS while removing recorded narration',()=>{
  const processed=withoutRecordedNarration(root);
  expect(processed.children[0]).toEqual(soundtrack);
  expect(processed.children[1].children).toEqual([{type:'image',src:'image.jpg'}]);
  expect(processed.subtitle).toBeUndefined();
  expect(root.subtitle.src).toBe('captions.vtt');
 });
 it('retains local music when remote audio was extracted and browser TTS is active',()=>{
  const local={type:'audio',src:'assets/music.mp3',isBackground:true};
  const {audio,playbackRoot}=extractRemotePreviewAudio({...root,children:[local,soundtrack,scene]});
  expect(audio).toBe(soundtrack);
  expect(withoutRecordedNarration(playbackRoot).children).toEqual([local,{...scene,children:[scene.children[0]]}]);
 });
 it('does not create an audio source when the tree contains no remote soundtrack',()=>{
  const {audio,playbackRoot}=extractRemotePreviewAudio({type:'root',children:[scene]});
  expect(audio).toBeNull();
  expect(playbackRoot.children[0].children).toHaveLength(2);
 });
});
