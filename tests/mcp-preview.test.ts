import {describe,it,expect} from 'vitest';
import {buildPreviewHtml,buildPreviewResourceResult,RESOURCE_URI,LEGACY_RESOURCE_URIS,validateMarkdownPath,reviewResult,getPreviewMedia,readPreviewAudio} from '../src/mcp/preview.mjs';
import {buildPreviewBridgeScript} from '../src/mcp/bridge.mjs';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
describe('Markcut Remotion MCP App',()=>{
 it('requires absolute Markdown path',()=>{expect(()=>validateMarkdownPath('a.md')).toThrow(/absolute/);expect(()=>validateMarkdownPath('/tmp/a.txt')).toThrow(/Markdown/);});
 it('ships React Remotion Player JS inside registered static HTML',()=>{
  const html=buildPreviewHtml();
  expect(html).toContain('id="remotion-root"');
  // Controls are bundled as base64 to avoid HTML parser script termination.
  const encoded=html.match(/<script id="remotion-bundle" type="application\/octet-stream">([^<]+)<\/script>/)?.[1];
  expect(encoded).toBeTruthy();
  const js=Buffer.from(encoded!, 'base64').toString('utf8');
  expect(js).toContain('remotion-toggle');
  expect(js).toContain('remotion-seek');
  expect(js).toContain('audioSrc');
  expect(html.length).toBeGreaterThan(1000000);
  expect(html).not.toContain('<video id="video-player"');
  expect(html).not.toContain('data:video/mp4');
  expect(html).not.toContain('127.0.0.1');
  expect(html).not.toContain('src="/player.js"');
 });
 it('registers latest resource at startup and aliases previous URIs',()=>{
  for(const uri of [RESOURCE_URI,...LEGACY_RESOURCE_URIS]){
   const result=buildPreviewResourceResult(uri);
   expect(result.contents[0].uri).toBe(uri);
   expect(result.contents[0].text).toContain('remotion-canvas');
   expect(result.contents[0]._meta.ui.csp.connectDomains).toEqual([]);
  }
 });
 it('does not perform secondary tool calls for compiled scenes',()=>{
  const script=buildPreviewBridgeScript();
  expect(script).toContain('ui/notifications/tool-result');
  expect(script).toContain("CustomEvent('markcut:revision'");
  expect(script).toContain('data.compiled');
  expect(script).not.toContain("'tools/call'");
  expect(script).not.toContain('videoBase64');
  expect(script).not.toContain('fetch(');
 });
 it('prevents reading unregistered compiled scenes',()=>{
  expect(()=>getPreviewMedia('a'.repeat(64))).toThrow(/Unknown or expired/);
 });
 it('includes a local audio track for Remotion playback',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'markcut-audio-'));
  try {
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
 it('requires review feedback',()=>{
  expect(reviewResult('approved')).toEqual({decision:'approved'});
  expect(()=>reviewResult('changes_requested','')).toThrow(/feedback/);
 });
});