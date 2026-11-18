import {test} from 'vitest';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {frontmatterEdl,loadEditorDecision,resolveEditorDecisionPath,validateEditorDecision,editorDecisionToMarkdown} from './index.mjs';

const BASE='# video\nwidth:320 height:568 fps:24 layout:series\n## Main\n- video src:input/media/001.mp4 startFrom:0 endAt:1 duration:1\n';
const EDL={schema_version:1,editorial_intent:'An honest visual observation',edits:[
 {shot_id:'wide',source_src:'input/media/001.mp4',in_seconds:0,out_seconds:1,shot_purpose:'Set geography',editor_reason:'Hold the wide frame long enough to orient viewers.'},
 {shot_id:'reaction',source_id:'001',in_seconds:1,out_seconds:2,editor_reason:'Cut on the response, not on an arbitrary transition.',visual_relationship:'wide to close',sound_decision:'retain source sound'}
]};
function setup(){
 const folder=mkdtempSync(join(tmpdir(),'markcut-editor-decision-'));
 mkdirSync(join(folder,'input','media'),{recursive:true});
 writeFileSync(join(folder,'input','media','001.mp4'),'fixture');
 const video=join(folder,'video.md');
 writeFileSync(video,'---\nedl: ./video.edl.json\n---\n'+BASE);
 writeFileSync(join(folder,'video.edl.json'),JSON.stringify(EDL));
 return {folder,video,cleanup:()=>rmSync(folder,{recursive:true,force:true})};
}

test('frontmatter declares sidecar, same-basename sidecar is automatically discovered',()=>{
 const f=setup();
 try {
  assert.equal(frontmatterEdl(readFileSync(f.video,'utf8')),'./video.edl.json');
  assert.equal(loadEditorDecision(f.video)?.edl.edits.length,2);
  writeFileSync(f.video,BASE);
  assert.equal(resolveEditorDecisionPath(f.video),join(f.folder,'video.edl.json'));
  rmSync(join(f.folder,'video.edl.json'));
  assert.equal(loadEditorDecision(f.video),null);
 } finally {f.cleanup();}
});

test('converts decisions into playable Markcut Markdown with original source and visible shot reasoning',()=>{
 const f=setup();
 try{
  const md=editorDecisionToMarkdown(f.video,EDL);
  assert.match(md,/# video\nwidth:320 height:568 fps:24 layout:series/);
  assert.match(md,/## EditorialIntent/);
  assert.match(md,/## Shot1/);
  assert.match(md,/## Shot2/);
  assert.match(md,/startFrom:1 endAt:2 duration:1.0000/);
  assert.match(md,/Set geography/);
  assert.match(md,/retain source sound/);
  assert.match(md,/- component duration:1.0000 jsx:/);
  assert.equal((md.match(/- video src:/g)||[]).length,2);
  assert.doesNotMatch(md,/src:https?:/);
 }finally{f.cleanup();}
});

test('refuses malformed timing, duplicate shots and path traversal rather than rendering invented footage',()=>{
 const f=setup();
 try{
  assert.throws(()=>validateEditorDecision({...EDL,edits:[{...EDL.edits[0],out_seconds:0}]}),/invalid in\/out/);
  assert.throws(()=>validateEditorDecision({...EDL,edits:[EDL.edits[0],{...EDL.edits[0]}]}),/unique shot_id/);
  assert.throws(()=>editorDecisionToMarkdown(f.video,{...EDL,edits:[{...EDL.edits[0],source_src:'../../outside.mp4'}]}),/missing or outside/);
  writeFileSync(f.video,'---\nedl: ../outside.json\n---\n'+BASE);
  assert.throws(()=>loadEditorDecision(f.video),/escapes the video directory/);
  writeFileSync(f.video,'---\nedl: ./missing.json\n---\n'+BASE);
  assert.throws(()=>loadEditorDecision(f.video),/Declared EDL not found/);
 }finally{f.cleanup();}
});
