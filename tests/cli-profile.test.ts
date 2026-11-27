import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, realpathSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const bin = resolve(import.meta.dirname, '../bin/markcut');
const dirs: string[] = [];
const env = {...process.env, MARKCUT_PROFILE:'', MARKCUT_QUEUE_ENABLED:'0'};
function fixture() { const d=mkdtempSync(join(realpathSync(tmpdir()),'markcut profile ')); dirs.push(d); return d; }
function run(dir: string, args: string[], overrides={}) {return execFileSync(process.execPath,[bin,...args],{cwd:dir,encoding:'utf8',env:{...env,...overrides},timeout:30000});}
afterEach(()=>{ for(const d of dirs.splice(0))rmSync(d,{recursive:true,force:true}); });

describe('caller-selected CLI profiles',()=>{
 it('selects relative profile paths and preserves omitted defaults; flags win',()=>{
  const d=fixture();
  writeFileSync(join(d,'prototype.json'),JSON.stringify({tts:'prototype-tts',stt:'',itt:'prototype-itt',vtt:'',tti:'prototype-tti',ttv:'prototype-ttv',agent:'prototype-agent',editCli:'prototype-edit'}));
  writeFileSync(join(d,'product.json'),JSON.stringify({tts:'product-tts'}));
  const out=run(d,['--show-clis','--profile','prototype.json','--tts','caller-tts'],{MARKCUT_PROFILE:join(d,'product.json'),MARKCUT_TTS_CLI:'env-tts',MARKCUT_STT_CLI:'env-stt'});
  expect(out).toContain('tts=caller-tts');expect(out).toContain('stt=\n');expect(out).toContain('itt=prototype-itt');expect(out).toContain('tti=prototype-tti');expect(out).toContain('ttv=prototype-ttv');expect(out).toContain('agent=prototype-agent');expect(out).toContain('edit=prototype-edit');
  const product=run(d,['--show-clis'],{MARKCUT_PROFILE:join(d,'product.json'),MARKCUT_STT_CLI:'env-stt'});
  expect(product).toContain('tts=product-tts');expect(product).toContain('stt=env-stt');
  expect(run(d,['--show-clis'],{MARKCUT_TTS_CLI:'legacy-tts'})).toContain('tts=legacy-tts');
 });
 it('loads the shipped default from an arbitrary working directory and supports direct overrides',()=>{
  const d=fixture(),shipped=resolve(import.meta.dirname,'../profiles/default.json');
  const defaults=JSON.parse(readFileSync(shipped,'utf8'));
  const clean=Object.fromEntries(['TTS','STT','ITT','VTT','TTI','TTV','AGENT','EDIT'].map(k=>['MARKCUT_'+k+'_CLI','']));
  const normal=run(d,['--show-clis'],clean);
  expect(run(d,['--show-clis','--profile',shipped],clean).split('\n').slice(1)).toEqual(normal.split('\n').slice(1));
  expect(normal).toContain('tts='+defaults.tts);expect(normal).toContain('default-infer.mjs');expect(normal).toContain('agent=npx pi -p {prompt}');expect(normal).toContain('edit=npx pi --session-id {sessionid} --system-prompt {systemprompt} -p {prompt}');
  expect(run(d,['--show-clis','--tts=direct','--stt=','--profile',shipped],clean)).toContain('tts=direct\n\nstt=\n');
 });
 it('ships a low-resource prototype with valid image and video placeholders',()=>{
  const d=fixture(),profile=resolve(import.meta.dirname,'../profiles/prototype.json');
  const effective=run(d,['--show-clis','--profile',profile]);
  expect(effective).toContain('--model tiny --device cpu --fp16 False --threads 2');
  expect(effective).toContain('MARKCUT_VISION_DISABLE_LOCAL=1');
  expect(effective).toContain('smptebars=size=512x512');
  const input=join(d,'placeholder.md');
  writeFileSync(input,'# video\nseed:1\nwidth:320 height:240 fps:24 layout:series\n## Image\n- image prompt:"Example" duration:1\n## Video\n- video prompt:"Example" duration:3\n');
  run(d,['resolve',input,'--profile',profile,'--output','resolved.json']);
  const root=JSON.parse(readFileSync(join(d,'resolved.json'),'utf8'));
  const nodes=root.children.flatMap((scene:any)=>scene.children);
  const image=nodes.find((node:any)=>node.type==='image'), video=nodes.find((node:any)=>node.type==='video');
  for(const node of [image,video])expect(existsSync(resolve(d,node.src))).toBe(true);
  const duration=execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',resolve(d,video.src)],{encoding:'utf8'});
  expect(Number(duration)).toBeCloseTo(3,1);
 });
 it('rejects missing, malformed, unknown, duplicate and wrongly typed profile configuration',()=>{
  const d=fixture();
  for(const [name,body] of [['invalid.json','{'],['unknown.json','{"typo":"x"}'],['wrong.json','{"tts":42}'],['empty.json','{"tts":""}']])writeFileSync(join(d,name!),body!);
  for(const args of [['--profile'],['--profile','missing.json'],['--profile','invalid.json'],['--profile','unknown.json'],['--profile','wrong.json'],['--profile','empty.json'],['--profile','unknown.json','--profile','wrong.json']]){
   const result=spawnSync(process.execPath,[bin,'--show-clis',...args],{cwd:d,env,encoding:'utf8'});expect(result.status).not.toBe(0);expect(result.stderr).toMatch(/profile/i);
  }
 });
 it('uses the selected TTS/STT commands in actual resolve, reuses matching assets and isolates distinct profiles',()=>{
  const d=fixture();
  const adapter=join(d,'adapter.mjs');
  writeFileSync(adapter,`import {execFileSync} from 'node:child_process';import {appendFileSync,writeFileSync} from 'node:fs';import {join,basename,extname} from 'node:path';const [kind,tag,input,output]=process.argv.slice(2);appendFileSync(${JSON.stringify(join(d,'calls.log'))},kind+':'+tag+'\\n');if(kind==='tts')execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','sine=frequency='+tag+':duration=0.5',output]);else writeFileSync(join(output,basename(input,extname(input))+'.vtt'),'WEBVTT\\n\\n00:00.000 --> 00:00.500\\n'+tag+'\\n');`);
  const makeProfile=(name:string,frequency:string)=>writeFileSync(join(d,name+'.json'),JSON.stringify({tts:`node "${adapter}" tts ${frequency} "{input}" "{output}"`,stt:`node "${adapter}" stt ${name} "{input}" "{output}"`}));
  makeProfile('prototype','440');makeProfile('product','880');
  writeFileSync(join(d,'video.md'),'# video\nseed:1\nwidth:320 height:240 fps:24 layout:series tts:"exit 99" stt:"exit 99"\n\n## Narration\nlayout:parallel\n- script "Hello world"\n');
  const resolveVideo=(profile:string)=>{run(d,['resolve','video.md','--profile',profile+'.json','--output',profile+'.resolved.json']);return JSON.parse(readFileSync(join(d,profile+'.resolved.json'),'utf8'));};
  const prototype=resolveVideo('prototype');const product=resolveVideo('product');
  const paths=(root:any)=>{const audio=root.children[0].children.find((node:any)=>node.type==='audio');return [audio.src,root.subtitle.src];};
  const p=paths(prototype),q=paths(product);expect(p[0]).not.toBe(q[0]);expect(p[1]).not.toBe(q[1]);
  expect(readFileSync(resolve(d,p[1]),'utf8')).toContain('prototype');expect(readFileSync(resolve(d,q[1]),'utf8')).toContain('product');
  expect(paths(resolveVideo('prototype'))).toEqual(p);
  expect(readFileSync(join(d,'calls.log'),'utf8').trim().split('\n')).toEqual(['tts:440','stt:prototype','tts:880','stt:product']);
 });
 it('runs Vision profile adapters and keeps generated transcripts separate from canonical source VTT',()=>{
  const d=fixture(),media=join(d,'media');mkdirSync(media);
  execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=c=blue:s=160x120:r=8:d=2','-f','lavfi','-i','sine=frequency=440:duration=2','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',join(media,'clip.mp4')]);
  execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=c=red:s=80x60','-frames:v','1',join(media,'photo.png')]);
  const adapter=join(d,'vision.mjs');
  writeFileSync(adapter,`import {writeFileSync} from 'node:fs';import {join,basename,extname} from 'node:path';const [kind,tag,a,b]=process.argv.slice(2);if(kind==='stt')writeFileSync(join(b,basename(a,extname(a))+'.vtt'),'WEBVTT\\n\\n00:00.000 --> 00:01.000\\n'+tag+'\\n');else if(kind==='agent')console.log(JSON.stringify({['0to'+Array.from(a.matchAll(/Duration: (\\d+)ms/g)).at(-1)[1]]:{description:tag}}));else console.log(tag);`);
  const make=(name:string)=>writeFileSync(join(d,name+'.json'),JSON.stringify({itt:`node "${adapter}" itt ${name}-image {input}`,vtt:`node "${adapter}" vtt ${name}-video {input}`,agent:`node "${adapter}" agent ${name} {prompt}`,stt:`node "${adapter}" stt ${name} "{input}" "{output}"`}));
  make('prototype');make('product');
  const vision=(name:string)=>{run(d,['vision','media','--profile',name+'.json']);return JSON.parse(readFileSync(join(media,'metadata.json'),'utf8'));};
  const a=vision('prototype'),b=vision('product');
  expect(a['photo.png'].perception.desc).toContain('prototype-image');expect(b['photo.png'].perception.desc).toContain('product-image');
  expect(a['clip.mp4'].perception.desc).toContain('prototype-video');expect(b['clip.mp4'].perception.desc).toContain('product-video');
  const p=a['clip.mp4'].perception.subtitle,q=b['clip.mp4'].perception.subtitle;expect(p).not.toBe(q);expect(readFileSync(join(media,p),'utf8')).toContain('prototype');expect(readFileSync(join(media,q),'utf8')).toContain('product');
  expect(existsSync(join(media,'clip.vtt'))).toBe(false);
 });

 it('forwards profile and direct overrides to the detached preview compiler',()=>{
  const d=fixture(),profile=join(d,'profile.json'),adapter=join(d,'tts.mjs'),wrapper=join(d,'wrapper.mjs');
  writeFileSync(profile,JSON.stringify({tts:'exit 99',stt:''}));
  const before=readFileSync(profile,'utf8');
  writeFileSync(adapter,`import {execFileSync} from 'node:child_process';import {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(join(d,'tts-ran'))},'yes');execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','sine=frequency=440:duration=0.5',process.argv[3]]);`);
  writeFileSync(wrapper,`let data='';for await (const c of process.stdin)data+=c;console.log(JSON.stringify({stored:true,requestId:JSON.parse(data).id,accepted:false}));`);
  writeFileSync(join(d,'video.md'),'# video\nseed:1\nwidth:320 height:240 fps:24 layout:series\n## Narration\nlayout:parallel\n- script "Hello world"\n');
  const output=run(d,['preview','video.md','--delivery','text','--profile','profile.json','--tts',`node "${adapter}" "{input}" "{output}"`],{MARKCUT_EXPORT_ROOT:join(d,'exports'),NEOY_PUBLIC_ORIGIN:'https://neoy.example.test',NEO_REVIEW_WRAPPER:wrapper});
  expect(JSON.parse(output.trim()).status).toBe('review_requested');
  expect(existsSync(join(d,'tts-ran'))).toBe(true);expect(readFileSync(profile,'utf8')).toBe(before);
 });

});
