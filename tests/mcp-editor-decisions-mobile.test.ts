import {describe,it,expect} from 'vitest';
import {mkdtemp,writeFile,mkdir,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

describe('mobile compiled video + editorial decision preview',()=>{
 it('serves a distinct compiled EDL tree through existing markcut.preview.media data contract',async()=>{
  const root=await mkdtemp(join(tmpdir(),'markcut-mobile-edl-'));
  const prevExport=process.env.MARKCUT_EXPORT_ROOT,prevOrigin=process.env.NEOY_PUBLIC_ORIGIN;
  process.env.MARKCUT_EXPORT_ROOT=join(root,'exports');
  process.env.NEOY_PUBLIC_ORIGIN='https://neoy.example.test';
  try{
   const {ensureVideoPreview,getPreviewMedia}=await import('../src/mcp/preview.mjs');
   const file=join(root,'video.md');
   await mkdir(join(root,'input','media'),{recursive:true});
   await writeFile(join(root,'input','media','001.png'),Buffer.from('small-image-payload'));
   await writeFile(file,'---\nedl: ./video.edl.json\n---\n# video\nwidth:320 height:568 fps:24 layout:series\n## Main\n- image src:input/media/001.png duration:1\n');
   await writeFile(join(root,'video.edl.json'),JSON.stringify({schema_version:1,editorial_intent:'Show the quiet moment',edits:[
    {shot_id:'detail',source_src:'input/media/001.png',in_seconds:0,out_seconds:1,editor_reason:'Hold for quiet'}
   ]}));
   const preview=await ensureVideoPreview(file);
   const mobile=getPreviewMedia(preview.contentHash);
   expect(preview.edlCompiledUrl).toContain('/files/_neoy/markcut/cache/');
   expect(mobile.compiled.children.map((s:any)=>s.name)).toEqual(['Main']);
   expect(mobile.editorDecisions.children.map((s:any)=>s.name)).toEqual(['EditorialIntent','Shot1']);
   expect(JSON.stringify(mobile.editorDecisions)).toContain('Hold for quiet');
   expect(JSON.stringify(mobile.editorDecisions)).toContain('/preview-files/_neoy/markcut/generated/');
   expect((await readFile(join(root,'video.md'),'utf8'))).toContain('edl: ./video.edl.json');
  }finally{
   if(prevExport===undefined)delete process.env.MARKCUT_EXPORT_ROOT; else process.env.MARKCUT_EXPORT_ROOT=prevExport;
   if(prevOrigin===undefined)delete process.env.NEOY_PUBLIC_ORIGIN; else process.env.NEOY_PUBLIC_ORIGIN=prevOrigin;
   await rm(root,{recursive:true,force:true});
  }
 },20000);
});
