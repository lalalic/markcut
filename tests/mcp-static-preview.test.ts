import {describe,it,expect} from 'vitest';
import {mkdtemp,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

describe('stateless Markcut MCP cache',()=>{
 it('reuses identical sources, preserves latest and retains ten previews without player processes',async()=>{
  const run=await mkdtemp(join(tmpdir(),'markcut-static-'));
  const prior=process.env.MARKCUT_EXPORT_ROOT;
  const priorOrigin=process.env.NEOY_PUBLIC_ORIGIN;
  process.env.NEOY_PUBLIC_ORIGIN='https://neoy.example.test';
  process.env.MARKCUT_EXPORT_ROOT=join(run,'exports');
  try{
   const {ensureVideoPreview}=await import('../src/mcp/preview.mjs');
   const input=join(run,'video.md');
   await writeFile(join(run,'photo.png'),Buffer.from('initial-media-bytes'));
   const versions=[];
   for(let i=0;i<11;i++){
    await writeFile(input,'# video\\nwidth:640 height:480 fps:30 layout:series\\n## Intro\\n- image src:photo.png duration:1 name:"Version '+i+'"\\n');
    const result=await ensureVideoPreview(input);
    versions.push(result);
    expect(result.compiledUrl).toContain('/files/_neoy/markcut/cache/'+result.contentHash+'.json');
    expect(JSON.parse(await readFile(join(run,'.markcut/video/default/compiled.json'),'utf8'))).toBeTruthy();
   }
   expect((await readFile(input,'utf8'))).not.toContain('seed:');
   const again=await ensureVideoPreview(input);
   expect(again.contentHash).toBe(versions[10].contentHash);
   const cache=await readdir(join(run,'.markcut/cache'));
   expect(cache.filter(x=>x.endsWith('.json'))).toHaveLength(10);
   expect(cache).not.toContain(versions[0].contentHash+'.json');
   expect(cache).toContain(versions[1].contentHash+'.json');
   const published=await readdir(join(run,'exports','cache'));
   expect(published).toHaveLength(10);
   expect(JSON.parse(await readFile(join(run,'.markcut/video/default/cache-index.json'),'utf8')).latest).toBe(versions[10].contentHash);
   expect(JSON.parse(await readFile(join(run,'exports','cache',versions[1].contentHash+'.json'),'utf8'))).toBeTruthy();
   const other=join(run,'other.md');
   await writeFile(other,'# video\nwidth:640 height:480 fps:30 layout:series\n## Other\n- image src:photo.png duration:1\n');
   const second=await ensureVideoPreview(other);
   expect(second.contentHash).not.toBe(again.contentHash);
   expect(await readdir(join(run,'.markcut/cache'))).toHaveLength(11);
   expect(JSON.parse(await readFile(join(run,'.markcut/other/default/cache-index.json'),'utf8')).latest).toBe(second.contentHash);
   const previousLatest=await readFile(join(run,'.markcut/video/default/compiled.json'),'utf8');
   await writeFile(input,'# video\naudio: ../outside.wav\n');
   await expect(ensureVideoPreview(input)).rejects.toThrow(/audio must/);
   expect(await readFile(join(run,'.markcut/video/default/compiled.json'),'utf8')).toBe(previousLatest);
   // Local source assets are published as immutable files, not live paths.
   const media=join(run,'media.md'), photo=join(run,'photo2.png');
   await writeFile(photo,Buffer.from('small-image-payload'));
   await writeFile(media,'# video\nwidth:640 height:480 fps:30 layout:series\n## Photo\n- image src:photo2.png duration:1\n');
   const mediaPreview=await ensureVideoPreview(media);
   const mediaJson=await readFile(join(run,'exports','cache',mediaPreview.contentHash+'.json'),'utf8');
   expect(mediaJson).toContain('/files/_neoy/markcut/generated/'+mediaPreview.contentHash+'/file-0.png');
   expect(await readFile(join(run,'exports','generated',mediaPreview.contentHash,'file-0.png'))).toEqual(await readFile(photo));
   await writeFile(photo,Buffer.from('different-image-payload'));
   const modified=await ensureVideoPreview(media);
   expect(modified.contentHash).not.toBe(mediaPreview.contentHash);
   expect(await readFile(join(run,'exports','generated',mediaPreview.contentHash,'file-0.png'))).toEqual(Buffer.from('small-image-payload'));
  }finally{
   if(prior===undefined)delete process.env.MARKCUT_EXPORT_ROOT;else process.env.MARKCUT_EXPORT_ROOT=prior;
   if(priorOrigin===undefined)delete process.env.NEOY_PUBLIC_ORIGIN;else process.env.NEOY_PUBLIC_ORIGIN=priorOrigin;
   await rm(run,{recursive:true,force:true});
  }
 },20000);
});
