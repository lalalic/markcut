import {describe,expect,it} from 'vitest';
import {parseVtt} from '../src/mcp/browser-speech-preview';
describe('browser TTS captions',()=>{
 it('uses existing VTT words and timing without STT',()=>{
  const cues=parseVtt('WEBVTT\n\n1\n00:00:01.200 --> 00:00:02.900\n<b>Hello</b> world\n\n2\n00:00:03.000 --> 00:00:04.500\nRoute begins\n');
  expect(cues).toEqual([{start:1.2,end:2.9,text:'Hello world'},{start:3,end:4.5,text:'Route begins'}]);
 });
});
