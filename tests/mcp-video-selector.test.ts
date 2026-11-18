import {describe,it,expect} from 'vitest';
import {mkdtemp,writeFile,mkdir,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

describe('one video selector for original, named variants, and editor decisions',()=>{
 it('compiles and publishes every named variant and the EDL without modifying the authored film',async()=>{
  const root=await mkdtemp(join(tmpdir(),'markcut-video-selector-'));
  const beforeExport=process.env.MARKCUT_EXPORT_ROOT,beforeOrigin=process.env.NEOY_PUBLIC_ORIGIN;
  process.env.MARKCUT_EXPORT_ROOT=join(root,'exports');
  process.env.NEOY_PUBLIC_ORIGIN='https://neoy.example.test';
  try {
   const {ensureVideoPreview,getPreviewMedia}=await import('../src/mcp/preview.mjs');
   await mkdir(join(root,'input','media'),{recursive:true});
   await writeFile(join(root,'input','media','frame.png'),Buffer.from('media'));
   const film=join(root,'video.md');
   const markdown=['---','edl: ./video.edl.json','---','# video',
    'width:320 height:568 fps:24 layout:series','','## Main',
    '- image src:input/media/frame.png duration:1','','# landscape',
    'width:640 height:360 fps:24','','# square',
    'width:480 height:480 fps:24',''].join('\n');
   await writeFile(film,markdown);
   await writeFile(join(root,'video.edl.json'),JSON.stringify({schema_version:1,
    edits:[{shot_id:'intro',source_src:'input/media/frame.png',in_seconds:0,out_seconds:1,editor_reason:'Hold the opening'}]}));
   const preview=await ensureVideoPreview(film);
   const media=getPreviewMedia(preview.contentHash);
   expect([media.compiled.width,media.compiled.height]).toEqual([320,568]);
   expect(Object.keys(media.variants)).toEqual(['landscape','square']);
   expect([media.variants.landscape.width,media.variants.landscape.height]).toEqual([640,360]);
   expect([media.variants.square.width,media.variants.square.height]).toEqual([480,480]);
   expect(media.editorDecisions.children.map((scene:any)=>scene.name)).toEqual(['Shot1']);
   expect(JSON.parse(await readFile(join(root,'exports','cache',preview.contentHash+'.variants.json'),'utf8')))
     .toHaveProperty('landscape');
   expect(await readFile(film,'utf8')).toBe(markdown);
  } finally {
   if(beforeExport===undefined)delete process.env.MARKCUT_EXPORT_ROOT;else process.env.MARKCUT_EXPORT_ROOT=beforeExport;
   if(beforeOrigin===undefined)delete process.env.NEOY_PUBLIC_ORIGIN;else process.env.NEOY_PUBLIC_ORIGIN=beforeOrigin;
   await rm(root,{recursive:true,force:true});
  }
 },25000);
 it('ships a right-hand selector without a separate mode label or EDL tab bar',async()=>{
  const {readFileSync}=await import('node:fs');
  const app=readFileSync(new URL('../src/mcp/remotion-app.tsx',import.meta.url),'utf8');
  const {buildPreviewHtml}=await import('../src/mcp/preview.mjs');
  const html=buildPreviewHtml();
  expect(html).toContain('id="markcut-video-selector-slot"');
  expect(html).not.toContain('id="review-delivery-mode"');
  expect(app).toContain('id="markcut-video-selector"');
  expect(app).toContain('editor-decisions');
  expect(app).not.toContain('role="tablist"');
  expect(app).not.toContain('Editorial view · Switch to Video');
 });
});
