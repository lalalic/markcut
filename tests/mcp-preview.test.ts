import {describe,it,expect} from 'vitest';
process.env.NEOY_PUBLIC_ORIGIN = 'https://neoy.example.test';
import {buildPreviewHtml,buildPreviewResourceResult,RESOURCE_URI,LEGACY_RESOURCE_URIS,validateMarkdownPath,getPreviewMedia,readPreviewAudio,withPreviewAudio} from '../src/mcp/preview.mjs';
import {buildPreviewBridgeScript} from '../src/mcp/bridge.mjs';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readFileSync} from 'node:fs';
describe('Markcut Remotion MCP App',()=>{
 it('requires absolute Markdown path',()=>{expect(()=>validateMarkdownPath('a.md')).toThrow(/absolute/);expect(()=>validateMarkdownPath('/tmp/a.txt')).toThrow(/Markdown/);});
 it('loads the React Remotion bundle from remote HTTPS',()=>{
  const html=buildPreviewHtml();
  expect(html).toContain('id="remotion-root"');
  expect(html).toContain('id="player-version"');
  expect(html).toContain('>'+RESOURCE_URI.match(/video-preview-(v\d+)/)?.[1]+'</span>');
  expect(html).toContain('id="video-md-version"');
  expect(html).toContain('<textarea id="feedback" rows="3"');
  expect(html).toContain('id="comment-tools"');
  expect(html).toContain('id="overall-mode" hidden>Overall');
  expect(html).toContain('id="review-delivery-mode"');
  expect(html).toContain('Text mode');
  expect(html).toContain('Submit feedback');
  expect(html).not.toContain('Submit all feedback');
  expect(html).not.toContain('id="comment-count"');
  expect(html).not.toContain('Add or remove the current comment before submitting.');
  expect(html).not.toContain('<option value="overall"');
  expect(html).toContain('#comment-tools>*{width:30px;height:28px;padding:0;border:0');
  expect(html).toContain('https://neoy.example.test/files/_neoy/markcut/player/');
  expect(html).not.toContain('id="remotion-bundle"');
  // The generic event contract requires client-side identity and reserved-field validation.
  expect(html.length).toBeLessThan(26000);
  expect(html).not.toContain('<video id="video-player"');
  expect(html).not.toContain('data:video/mp4');
  expect(html).not.toContain('127.0.0.1');
  expect(html).not.toContain('src="/player.js"');
 });
 it('omits the developer BGM decode-status row while preserving Web Audio playback',()=>{
  const renderer=readFileSync(new URL('../src/mcp/remotion-app.tsx',import.meta.url),'utf8');
  const audio=readFileSync(new URL('../src/mcp/web-audio-preview.ts',import.meta.url),'utf8');
  expect(renderer).not.toContain('id="preview-audio-status"');
  expect(audio).toContain('ctx.decodeAudioData(bytes)');
  expect(audio).toContain("p.addEventListener('play',play)");
 });
 it('publishes v46 while retaining v45 as a compatible alias',()=>{
  expect(RESOURCE_URI).toBe('ui://markcut/video-preview-v46.html');
  expect(LEGACY_RESOURCE_URIS).toContain('ui://markcut/video-preview-v45.html');
 });
 it('registers latest resource at startup and aliases previous URIs',()=>{
  for(const uri of [RESOURCE_URI,...LEGACY_RESOURCE_URIS]){
   const result=buildPreviewResourceResult(uri);
   expect(result.contents[0].uri).toBe(uri);
   expect(result.contents[0].text).toContain('remotion-canvas');
   expect(result.contents[0]._meta.ui.csp.connectDomains).toEqual([
    'https://neoy.example.test',
    'https://maps.googleapis.com', 'https://maps.gstatic.com',
    'https://maps-api-v3.googleapis.com', 'https://routes.googleapis.com',
   ]);
   expect(result.contents[0]._meta.ui.csp.resourceDomains).toContain('https://maps.googleapis.com');
  }
 });
 it('does not perform secondary tool calls for compiled scenes',()=>{
  const script=buildPreviewBridgeScript();
  expect(script).toContain('ui/notifications/tool-result');
  expect(script).toContain("CustomEvent('markcut:revision'");
  expect(script).toContain('data.compiled');
  expect(script).not.toContain('markcut.review.decide');
  expect(script).not.toContain('markcut.review.get');
  expect(script).toContain("request('ui/message'");
  expect(script).not.toContain('pollDecision');
  expect(script).not.toContain('videoBase64');
  expect(script).toContain('fetch(');
  expect(script).toContain('/files/_neoy/markcut/revisions/');
 });
 it('prevents reading unregistered compiled scenes',()=>{
  expect(()=>getPreviewMedia('a'.repeat(64))).toThrow(/Unknown or expired/);
 });
 it('includes a local audio track for Remotion playback',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'markcut-audio-'));
  try {
   await writeFile(join(dir,'.ghost.markcut.md'),'# video\n');
   expect(await readPreviewAudio(join(dir,'.ghost.markcut.md'))).toEqual({});
   await writeFile(join(dir,'clip.md'),'# video\naudio: sample.wav\n');
   await writeFile(join(dir,'sample.wav'),Buffer.from([82,73,70,70]));
   const media=await readPreviewAudio(join(dir,'clip.md'));
   expect(media.audioSrc).toMatch(/^data:audio\/wav;base64,/);
   expect(media.audioSrc).toContain('UklGRg==');
   await writeFile(join(dir,'clip.md'),'# video\naudio: ../secret.wav\n');
   await expect(readPreviewAudio(join(dir,'clip.md'))).rejects.toThrow(/audio must/);
   await writeFile(join(dir,'clip.md'),'# video\n');
   await writeFile(join(dir,'clip.wav'),Buffer.from([82,73,70,70]));
   expect((await readPreviewAudio(join(dir,'clip.md'))).audioSrc).toContain('UklGRg==');
  } finally {await rm(dir,{recursive:true,force:true});}
 });
 it('uses native MarkCut AudioLeaf as a background track without changing original duration',()=>{
  const compiled={root:{id:'root',type:'root',isSeries:true,durationInSeconds:6,children:[{id:'scene',type:'component',durationInSeconds:6}]}};
  const mixed=withPreviewAudio(compiled,'data:audio/wav;base64,QQ==');
  expect(mixed.root.children[1]).toMatchObject({type:'audio',isBackground:true,start:0,end:6,volume:1});
  expect(compiled.root.children).toHaveLength(1);
  expect(mixed.root.durationInSeconds).toBe(6);
 });
});
