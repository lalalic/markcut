import {describe,it,expect} from 'vitest';
process.env.NEOY_PUBLIC_ORIGIN = 'https://neoy.example.test';
import {buildPreviewHtml,buildPreviewResourceResult,RESOURCE_URI,STABLE_RESOURCE_URI,PREVIEW_VERSION_NUMBER,LEGACY_RESOURCE_URIS,validateMarkdownPath,getPreviewMedia,readPreviewAudio,withPreviewAudio} from '../src/mcp/preview.mjs';
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
  // On iOS an MCP UI resource URI may remain cached across server upgrades.
  // Bumping the URI forces the WebGL-capable schema/player to be reloaded.
  const bundle=readFileSync(new URL('../src/mcp/remotion-app.bundle.js',import.meta.url),'utf8');
  expect(bundle).toContain('model3d');
  expect(bundle).toContain('model3d requires a .glb');

  expect(html).not.toContain('id="remotion-bundle"');
  // The generic event contract requires client-side identity and reserved-field validation.
  expect(html.length).toBeLessThan(30000);
  expect(html).not.toContain('<video id="video-player"');
  expect(html).not.toContain('data:video/mp4');
  expect(html).not.toContain('127.0.0.1');
  expect(html).not.toContain('src="/player.js"');
 });
 it('fits the phone player by BOTH width and height, with scenes below canvas and actions in normal flow',()=>{
  const html=buildPreviewHtml();
  expect(html).toContain('@media (max-width: 640px), (max-width: 900px) and (max-height: 520px)');
  expect(html).toContain('width: min(100%, calc(760px * var(--markcut-player-ratio, 0.5625)))');
  expect(html).toContain('width: min(100%, calc(min(76dvh, 520px) * var(--markcut-player-ratio, 0.5625)))');
  expect(html).not.toContain('58dvh');
  expect(html).toContain('#scene-thumbnails { order: 0;');
  expect(html).toContain("grid-template-areas: 'changes approve' 'status status'");
  expect(html).not.toMatch(/#remotion-canvas\s*\{[^}]*position\s*:\s*absolute/);
  const app=readFileSync(new URL('../src/mcp/remotion-app.tsx',import.meta.url),'utf8');
  expect(app).toContain('showPlaybackRateControl={!compact}');
  expect(app).not.toContain("maxHeight:'65vh'");
  expect(app).not.toContain("width:'100%',aspectRatio");
  expect(app).toContain('Boolean(data?.subtitle?.src)&&document.getElementById');
 });
 it('omits the developer BGM decode-status row while preserving Web Audio playback',()=>{
  const renderer=readFileSync(new URL('../src/mcp/remotion-app.tsx',import.meta.url),'utf8');
  const audio=readFileSync(new URL('../src/mcp/web-audio-preview.ts',import.meta.url),'utf8');
  expect(renderer).not.toContain('id="preview-audio-status"');
  expect(audio).toContain('ctx.decodeAudioData(bytes)');
  expect(audio).toContain("p.addEventListener('play',play)");
 });
 it('maps every historical preview version and the stable URI to the latest',()=>{
  expect(PREVIEW_VERSION_NUMBER).toBe(50);
  expect(RESOURCE_URI).toBe('ui://markcut/video-preview-v50.html');
  expect(STABLE_RESOURCE_URI).toBe('ui://markcut/video-preview.html');
  expect(LEGACY_RESOURCE_URIS).toHaveLength(PREVIEW_VERSION_NUMBER);
  expect(new Set([RESOURCE_URI,...LEGACY_RESOURCE_URIS]).size).toBe(PREVIEW_VERSION_NUMBER+1);
  expect(LEGACY_RESOURCE_URIS).toContain(STABLE_RESOURCE_URI);
  const latestHtml=buildPreviewResourceResult(RESOURCE_URI).contents[0].text;
  expect(buildPreviewResourceResult(STABLE_RESOURCE_URI).contents[0].text).toBe(latestHtml);
  for (let version=1;version<PREVIEW_VERSION_NUMBER;version++) {
   const uri=`ui://markcut/video-preview-v${version}.html`;
   expect(LEGACY_RESOURCE_URIS).toContain(uri);
   const resource=buildPreviewResourceResult(uri);
   expect(resource.contents[0].uri).toBe(uri);
   expect(resource.contents[0].text).toBe(latestHtml);
   expect(resource.contents[0].text).toContain(`>${'v'+PREVIEW_VERSION_NUMBER}</span>`);
   expect(resource.contents[0].text).toContain('https://neoy.example.test/files/_neoy/markcut/player/');
  }
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
