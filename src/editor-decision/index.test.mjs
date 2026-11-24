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

test('Editor Decisions shot overlay begins at top with larger type and never truncates EDL text',()=>{
 const f=setup();
 try{
  const marker='FULL_REASON_END_987654321';
  const reason='Narrative continuity, source-grounded editorial intention. '.repeat(8)+marker;
  const decision={...EDL,edits:[{
   ...EDL.edits[0],shot_purpose:'Purpose should not replace story beat',
   editor_reason:reason,
   visual_relationship:'wide shot to detailed close-up',
   sound_decision:'preserve natural source audio',audioIntent:'do not duck the recording',
   revision_note:'keep the original observation',story_beat_id:'story-beat-abc',
   transition:'match cut from {shot} to <scene>',cut_reason:'Independent cut reason {not_an_expression}'
  }]};
  const md=editorDecisionToMarkdown(f.video,decision,'# video\nwidth:1080 height:1920 fps:30 layout:series');
  const component=md.split('- component duration:1.0000 jsx:')[1];
  const jsx=JSON.parse(component.trim());
  assert.match(jsx,/justifyContent:'flex-start'/);
  assert.doesNotMatch(jsx,/justifyContent:'flex-end'/);
  const title=Number(jsx.match(/fontSize:([\d.]+)/)[1]);
  const body=Number(jsx.match(/<div style=\{\{fontSize:([\d.]+),lineHeight:1\.28/)[1]);
  assert.ok(title>33&&title<=68,`shot title must remain larger than prior 33px, got ${title}`);
  assert.ok(body>24&&body<=46,`shot body must remain larger than prior 24px, got ${body}`);
  assert.match(jsx,/overflowY:'hidden'/);
  assert.match(jsx,/FULL_REASON_END_987654321/);
  assert.match(jsx,/Independent cut reason/);
  assert.match(jsx,/Purpose should not replace story beat/);
  assert.match(jsx,/story-beat-abc/);
  assert.match(jsx,/wide shot to detailed close-up/);
  assert.match(jsx,/preserve natural source audio/);
  assert.match(jsx,/do not duck the recording/);
  assert.match(jsx,/keep the original observation/);
  assert.match(jsx,/TRANSITION:/);
  assert.match(jsx,/match cut from &#123;shot&#125; to &lt;scene&gt;/);
  assert.match(jsx,/Independent cut reason &#123;not_an_expression&#125;/);
  assert.doesNotMatch(jsx,/\{not_an_expression\}/);
  assert.doesNotMatch(jsx,/…/);
  assert.ok(jsx.indexOf('SHOT 1')<jsx.indexOf('SOURCE:')&&jsx.indexOf('SOURCE:')<jsx.indexOf('EDITOR REASON:'));
 }finally{f.cleanup();}
});

test('shot typography scales down if necessary and rejects impossible single-frame content',()=>{
 const f=setup();
 try{
  const run=reason=>editorDecisionToMarkdown(f.video,{...EDL,edits:[{...EDL.edits[0],editor_reason:reason}]},'# video\nwidth:1080 height:1920 fps:30 layout:series');
  const moderate='Long source-grounded explanation about the observed moments. '.repeat(22);
  const md=run(moderate),jsx=JSON.parse(md.split('- component duration:1.0000 jsx:')[1].trim());
  const size=Number(jsx.match(/fontSize:([\d.]+)/)[1]);
  assert.ok(size<68&&size>=30,`expected fitted title, got ${size}`);
  assert.ok(jsx.includes(moderate));
  assert.match(jsx,/overflowY:'hidden'/);
  assert.throws(()=>run('Very long reason. '.repeat(1500)),/too much decision text to fit on one frame/);
 }finally{f.cleanup();}
});

test('editorial intent text is safely escaped as inert JSX content',()=>{
 const f=setup();
 try{
  const md=editorDecisionToMarkdown(f.video,{...EDL,editorial_intent:'Observe {globalThis.alert(1)} <picture> & keep it real'});
  const first=md.match(/- component duration:3 jsx:([^\n]+)/);
  assert.ok(first);
  const jsx=JSON.parse(first[1]);
  assert.match(jsx,/&#123;globalThis\.alert\(1\)&#125;/);
  assert.match(jsx,/&lt;picture&gt; &amp; keep it real/);
  assert.doesNotMatch(jsx,/\{globalThis\.alert\(1\)\}/);
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
