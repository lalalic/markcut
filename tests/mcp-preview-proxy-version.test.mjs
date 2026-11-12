import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {versionPreviewMedia} from '../src/mcp/remote-assets.mjs';

test('immutable cache key tracks mounted preview source and works for past compiled revisions',()=>{
  const dir=mkdtempSync(join(tmpdir(),'markcut-proxy-version-'));
  try {
    mkdirSync(join(dir,'run'),{recursive:true});
    const file=join(dir,'run','film.mp4');
    writeFileSync(file,Buffer.from('first film'));
    const origin='https://preview.example.test';
    const url=origin+'/preview-files/vlog/run/film.mp4';
    const exported=join(dir,'exports','_neoy','markcut');
    const generated=join(exported,'generated','1234567890abcdef');
    mkdirSync(generated,{recursive:true});
    const generatedVideo=join(generated,'clip.mp4');
    writeFileSync(generatedVideo,Buffer.from('generated film'));
    const generatedURL=origin+'/files/_neoy/markcut/generated/1234567890abcdef/clip.mp4';
    const source={root:{children:[{type:'video',src:url}, {src:origin+'/files/vlog/run/film.mp4'},
      {src:'https://elsewhere.example.test/preview-files/vlog/run/film.mp4'},
      {type:'video',src:generatedURL}, {type:'audio',src:origin+'/files/_neoy/markcut/generated/sound.m4a'},
      {markup:`<video src='${origin}/files/vlog/run/film.mp4' autoPlay />`},
      {src:origin+'/files/_neoy/markcut/cache/preserved.mp4'}]}};
    const mounts={vlog:dir};
    const first=versionPreviewMedia(source,origin,mounts,exported);
    const found=first.root.children[0].src;
    assert.match(found,/\?pv=[a-f0-9]{16}$/);
    assert.equal(versionPreviewMedia(source,origin,mounts,exported).root.children[0].src,found);
    assert.equal(first.root.children[1].src,found,'older /files/ videos use the preview route');
    assert.equal(first.root.children[2].src,source.root.children[2].src);
    const exportedPreview=first.root.children[3].src;
    assert.match(exportedPreview,/\/preview-files\/_neoy\/markcut\/generated\/.+\?pv=[a-f0-9]{16}$/);
    assert.equal(first.root.children[4].src,source.root.children[4].src,'audio remains untouched');
    assert.match(first.root.children[5].markup,/\/preview-files\/vlog\/run\/film\.mp4\?pv=/,
      'legacy inline HTML video attributes use the same proxy');
    assert.equal(first.root.children[6].src,source.root.children[6].src,
      'other private export URLs do not get converted');
    assert.equal(source.root.children[0].src,url,'compiled source is not mutated');
    assert.equal(versionPreviewMedia(first,origin,mounts,exported).root.children[0].src,found,'idempotent');
    writeFileSync(file,Buffer.from('updated video longer than before'));
    const second=versionPreviewMedia(source,origin,mounts,exported).root.children[0].src;
    assert.notEqual(second,found,'a replaced video cannot reuse a stale CDN key');
    writeFileSync(generatedVideo,Buffer.from('new snapshot of generated video'));
    const newExported=versionPreviewMedia(source,origin,mounts,exported).root.children[3].src;
    assert.notEqual(newExported,exportedPreview,'generated snapshot changes must version URL too');
  } finally {rmSync(dir,{recursive:true,force:true});}
});


test('immutable compiled revisions publish a new transport variant instead of overwriting an old player cache',()=>{
  const dir=mkdtempSync(join(tmpdir(),'markcut-transport-variant-'));
  try{
    const moduleURL=new URL('../src/mcp/remote-assets.mjs',import.meta.url).href;
    const script=`
      import {publishCompiledCache, prunePublishedCache} from ${JSON.stringify(moduleURL)};
      import {readFileSync,existsSync} from 'node:fs';
      import {join} from 'node:path';
      const hash='a'.repeat(64);
      const old={root:{children:[{src:'https://preview.example.test/files/demo/video.mp4'}]}};
      const next={root:{children:[{src:'https://preview.example.test/preview-files/demo/video.mp4?pv=1234567890abcdef'}]}};
      const original=publishCompiledCache(hash,old,'https://preview.example.test');
      const updated=publishCompiledCache(hash,next,'https://preview.example.test');
      if(original===updated || !updated.includes('-'))throw new Error('no distinct immutable variant');
      if(!updated.match(/-[a-f0-9]{16}\.json$/))throw new Error('variant URL missing suffix');
      if(publishCompiledCache(hash,next,'https://preview.example.test')!==updated)throw new Error('not idempotent');
      if(!readFileSync(join(process.env.MARKCUT_EXPORT_ROOT,'cache',hash+'.json'),'utf8').includes('/files/demo/'))throw new Error('original overwritten');
      await prunePublishedCache(hash);
      if(existsSync(join(process.env.MARKCUT_EXPORT_ROOT,'cache',hash+'.json')))throw new Error('canonical not pruned');
      if(existsSync(join(process.env.MARKCUT_EXPORT_ROOT,'cache',updated.split('/').pop())))throw new Error('variant not pruned');
      console.log('TRANSPORT_VARIANTS_PASS');
    `;
    const result=execFileSync(process.execPath,['--input-type=module','-e',script],
      {encoding:'utf8',env:{...process.env,MARKCUT_EXPORT_ROOT:dir}});
    assert.match(result,/TRANSPORT_VARIANTS_PASS/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
