import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {versionPreviewMedia} from '../src/mcp/remote-assets.mjs';

test('immutable cache key tracks mounted preview source and works for past compiled revisions',()=>{
  const dir=mkdtempSync(join(tmpdir(),'markcut-proxy-version-'));
  try {
    mkdirSync(join(dir,'run'),{recursive:true});
    const file=join(dir,'run','film.mp4');
    writeFileSync(file,Buffer.from('first film'));
    const origin='https://preview.example.test';
    const url=origin+'/preview-files/vlog/run/film.mp4';
    const source={root:{children:[{type:'video',src:url}, {src:origin+'/files/vlog/run/film.mp4'},
      {src:'https://elsewhere.example.test/preview-files/vlog/run/film.mp4'}]}};
    const mounts={vlog:dir};
    const first=versionPreviewMedia(source,origin,mounts);
    const found=first.root.children[0].src;
    assert.match(found,/\?pv=[a-f0-9]{16}$/);
    assert.equal(versionPreviewMedia(source,origin,mounts).root.children[0].src,found);
    assert.equal(first.root.children[1].src,source.root.children[1].src);
    assert.equal(first.root.children[2].src,source.root.children[2].src);
    assert.equal(source.root.children[0].src,url,'compiled source is not mutated');
    assert.equal(versionPreviewMedia(first,origin,mounts).root.children[0].src,found,'idempotent');
    writeFileSync(file,Buffer.from('updated video longer than before'));
    const second=versionPreviewMedia(source,origin,mounts).root.children[0].src;
    assert.notEqual(second,found,'a replaced video cannot reuse a stale CDN key');
  } finally {rmSync(dir,{recursive:true,force:true});}
});
