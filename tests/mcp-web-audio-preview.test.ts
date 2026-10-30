import {describe,expect,it} from 'vitest';
import {extractRemotePreviewAudio,isRecordedNarration,previewBgmGain,withoutRecordedNarration} from '../src/mcp/audio-preview-tree';

const remote='https://neoy.qili2.com/files/_neoy/markcut/generated/test/audio.mp3';
const soundtrack={type:'audio',src:remote,isBackground:true,volume:0.95};
const narration={type:'audio',src:'assets/tts/voice-001.mp3',foreground:true};
const ambient={type:'audio',src:'assets/stream.mp3',foreground:true};
const publishedNarration={type:'audio',src:'https://neoy.qili2.com/files/generated/run/file-3.mp3',isNarration:true};
const fx={type:'audio',src:'https://neoy.qili2.com/files/fx/swoosh.mp3',name:'transition'};
const video={type:'video',src:'https://neoy.qili2.com/files/environment.mp4',volume:1};
const scene={type:'scene',name:'Opening',children:[{type:'image',src:'image.jpg'},narration,ambient,fx,video]};
const root={type:'root',fps:30,subtitle:{src:'captions.vtt'},children:[soundtrack,scene]};

describe('MCP Web Audio preview source preservation and narration mixing',()=>{
 it('captures remote background music before returning the visual tree',()=>{
  const {audio,playbackRoot}=extractRemotePreviewAudio(root);
  expect(audio).toBe(soundtrack);
  expect(playbackRoot.children.map((node:{type:string})=>node.type)).toEqual(['scene']);
  expect(playbackRoot.children[0].children).toEqual(scene.children);
  expect(root.children[0]).toBe(soundtrack);
 });
 it('Browser TTS removes only identified narration, retaining BGM, ambient audio, SFX, video sound',()=>{
  const processed=withoutRecordedNarration(root);
  expect(processed.children[0]).toEqual(soundtrack);
  expect(processed.children[1].children).toEqual([scene.children[0],ambient,fx,video]);
  expect(processed.subtitle).toBeUndefined();
  expect(root.subtitle.src).toBe('captions.vtt');
 });
 it('retains local BGM and other remote audio when extracting the music bed',()=>{
  const local={type:'audio',src:'assets/music.mp3',isBackground:true};
  const extra={type:'audio',src:'https://neoy.qili2.com/files/second-bed.mp3',isBackground:true};
  const {audio,playbackRoot}=extractRemotePreviewAudio({...root,children:[local,soundtrack,extra,scene]});
  expect(audio).toBe(soundtrack);
  expect(withoutRecordedNarration(playbackRoot).children).toEqual([local,extra,{...scene,children:[scene.children[0],ambient,fx,video]}]);
 });
 it('identifies synthetic speech without treating environment or sound effects as narration',()=>{
  expect(isRecordedNarration(narration)).toBe(true);
  expect(isRecordedNarration(publishedNarration)).toBe(true);
  expect(withoutRecordedNarration({type:'root',children:[publishedNarration,ambient]}).children).toEqual([ambient]);
  expect(isRecordedNarration({type:'audio',speaker:'Ray'})).toBe(true);
  expect(isRecordedNarration({type:'audio',role:'narration'})).toBe(true);
  expect(isRecordedNarration(ambient)).toBe(false);
  expect(isRecordedNarration(fx)).toBe(false);
  expect(isRecordedNarration(soundtrack)).toBe(false);
 });
 it('ducks the BGM during synthesized speech and restores its gain afterward',()=>{
  expect(previewBgmGain(1,0.95,false,false)).toBeCloseTo(0.95);
  expect(previewBgmGain(1,0.95,false,true)).toBeCloseTo(0.266);
  expect(previewBgmGain(0.5,0.95,false,true)).toBeCloseTo(0.133);
  expect(previewBgmGain(1,0.95,true,true)).toBe(0);
  expect(previewBgmGain(1,0.95,false,false)).toBeCloseTo(0.95);
 });
 it('does not create an external audio source when there is no remote BGM',()=>{
  const {audio,playbackRoot}=extractRemotePreviewAudio({type:'root',children:[scene]});
  expect(audio).toBeNull();
  expect(playbackRoot.children[0].children).toEqual(scene.children);
 });
});
