import { describe,it,expect,afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const base=resolve(import.meta.dirname,'..');
const dir=mkdtempSync(join(tmpdir(),'markcut-generic-hooks-'));
const media=join(dir,'media');
const visual=join(dir,'mock-visual.mjs');
const semantic=join(dir,'mock-segment-agent.mjs');
const queueHome=join(dir,'queue');
const queueEnv={...process.env,MARKCUT_QUEUE_HOME:queueHome};
function stopQueue() {
  const pidPath=join(queueHome,'worker.lock','pid');
  if(existsSync(pidPath)) {
    const pid=Number(readFileSync(pidPath,'utf8'));
    if(pid>1)try{process.kill(pid,'SIGTERM');}catch{}
  }
}
afterAll(async()=>{stopQueue();await new Promise(r=>setTimeout(r,300));rmSync(dir,{force:true,recursive:true});});
function queueJobs() {
  const code='const {DatabaseSync}=require("node:sqlite");const db=new DatabaseSync(process.argv[1],{readOnly:true});console.log(JSON.stringify(db.prepare("SELECT command,timeout,status FROM jobs").all()));db.close()';
  return JSON.parse(execFileSync(process.execPath,['-e',code,join(queueHome,'queue.sqlite')],{encoding:'utf8'}));
}
it('generic --vtt/--itt plus --agent uses the existing STT→semantic segment workflow, no backend flag',()=>{
  mkdirSync(media,{recursive:true});
  execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi',
    '-i','testsrc=size=320x240:rate=8:duration=4','-f','lavfi','-i',
    'sine=frequency=440:sample_rate=44100:duration=4','-c:v','libx264','-pix_fmt',
    'yuv420p','-c:a','aac','-shortest',join(media,'clip.mp4')]);
  execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi',
    '-i','color=c=blue:s=80x60','-frames:v','1',join(media,'photo.png')]);
  writeFileSync(join(media,'clip.vtt'),'WEBVTT\n\n00:00.000 --> 00:01.500\n骑行刚开始。\n\n00:02.000 --> 00:03.700\n嘿 Neo，这里是一个重要镜头。\n');
  writeFileSync(visual,[
    'const args=process.argv.slice(2);',
    'const prompt=args[args.indexOf("--prompt")+1];',
    'const sample=args.includes("--sample-interval")?args[args.indexOf("--sample-interval")+1]:null;',
    'if(sample && sample!=="2")process.exit(14);',
    'console.log("Recognized landscape from WebHelm-style ITT/VTT hook. " + prompt.slice(0,60));',
  ].join('\n'));
  writeFileSync(semantic,[
    'const args=process.argv.slice(2);',
    'const prompt=args[args.indexOf("--prompt")+1];',
    'if(!prompt.includes("嘿 Neo"))process.exit(12);',
    'console.log(JSON.stringify({"0to2000":{description:"intro"},',
    '"2000to4000":{description:"important source moment",instructions:[{utterance:"嘿 Neo，这里是一个重要镜头",intent:"emphasize later",time_seconds:2.2,confidence:"high"}]}}));',
  ].join('\n'));
  const escaped=(path:string)=>JSON.stringify(path);
  const itm='node '+escaped(visual)+' --input {input} --prompt {prompt_quoted}';
  const vtt=itm+' --sample-interval {sample_interval}';
  const agent='node '+escaped(semantic)+' --prompt {prompt}';
  const args=[join(base,'src/render/cli.mjs'),'vision',media,
    '--vtt',vtt,'--itt',itm,'--agent',agent,
    '--instruct','请按嘿 Neo 规则理解语义，并保留原视频时点。',
    '--vtt-sample-interval','2'];
  execFileSync(process.execPath,args,{cwd:base,timeout:200000,encoding:'utf8',env:queueEnv});
  const inference=queueJobs().filter((job:any)=>job.command.includes('mock-visual.mjs')||job.command.includes('mock-segment-agent.mjs'));
  expect(inference.length).toBeGreaterThanOrEqual(3);
  expect(inference.every((job:any)=>job.timeout===0&&job.status==='completed')).toBe(true);
  expect(queueJobs().some((job:any)=>job.timeout>0)).toBe(true);
  const meta=JSON.parse(readFileSync(join(media,'metadata.json'),'utf8'));
  expect(meta['photo.png'].perception.desc).toContain('Recognized landscape');
  expect(meta['clip.mp4'].perception.subtitle).toBe('clip.vtt');
  expect(meta['clip.mp4'].perception.desc).toContain('Recognized landscape');
  expect(Object.keys(meta['clip.mp4'].perception.segments)).toEqual(['0to2000','2000to4000']);
  expect(meta['clip.mp4'].perception.segments['0to2000'].vision).toContain('Recognized landscape');
  expect(meta['clip.mp4'].perception.segments['2000to4000'].instructions).toEqual([
    {utterance:'嘿 Neo，这里是一个重要镜头',intent:'emphasize later',time_seconds:2.2,confidence:'high'},
  ]);
});

it('accepts sparse and overlapping semantic intervals without requiring full coverage',()=>{
  const other=join(dir,'sparse-semantic');
  mkdirSync(other,{recursive:true});
  execFileSync('cp',[join(media,'clip.mp4'),join(other,'clip.mp4')]);
  execFileSync('cp',[join(media,'clip.vtt'),join(other,'clip.vtt')]);
  const sparse=join(dir,'sparse-agent.mjs');
  writeFileSync(sparse,'console.log(JSON.stringify({"500to1500":{description:"first"},"2000to3000":{description:"second"},"2500to3500":{description:"overlapping moment"}}))');
  const itm='node '+JSON.stringify(visual)+' --input {input} --prompt {prompt_quoted}';
  const args=[join(base,'src/render/cli.mjs'),'vision',other,
    '--vtt',itm,'--itt',itm,'--agent','node '+JSON.stringify(sparse)+' --prompt {prompt}'];
  execFileSync(process.execPath,args,{cwd:base,timeout:90000,encoding:'utf8',env:queueEnv});
  const meta=JSON.parse(readFileSync(join(other,'metadata.json'),'utf8'));
  expect(Object.keys(meta['clip.mp4'].perception.segments)).toEqual(['500to1500','2000to3000','2500to3500']);
});

it.each(['1000to1000','2000to1000','3000to5000','-100to1000'])('rejects invalid source interval %s',(range)=>{
  const other=join(dir,'invalid-range-'+range);
  mkdirSync(other,{recursive:true});
  execFileSync('cp',[join(media,'clip.mp4'),join(other,'clip.mp4')]);
  execFileSync('cp',[join(media,'clip.vtt'),join(other,'clip.vtt')]);
  const invalid=join(other,'invalid-agent.mjs');
  writeFileSync(invalid,'console.log('+JSON.stringify(JSON.stringify({[range]:{description:'invalid'}}))+')');
  const itm='node '+JSON.stringify(visual)+' --input {input} --prompt {prompt_quoted}';
  const args=[join(base,'src/render/cli.mjs'),'vision',other,
    '--vtt',itm,'--itt',itm,'--agent','node '+JSON.stringify(invalid)+' --prompt {prompt}'];
  expect(()=>execFileSync(process.execPath,args,{cwd:base,timeout:90000,encoding:'utf8',stdio:'pipe',env:queueEnv}))
    .toThrow(/Invalid Agent segment entry|Agent segment range must be within the original source/);
});

it('invalid semantic Agent response does not silently fall back to code-selected boundaries',()=>{
  const other=join(dir,'bad-semantic');
  mkdirSync(other,{recursive:true});
  execFileSync('cp',[join(media,'clip.mp4'),join(other,'clip.mp4')]);
  writeFileSync(join(other,'clip.vtt'),['WEBVTT','','00:00.000 --> 00:02.000','骑行。','','00:02.000 --> 00:04.000','嘿 Neo 保留这段。'].join(String.fromCharCode(10)));
  const bad=join(dir,'bad-agent.mjs');
  writeFileSync(bad,'console.log("not JSON")');
  const itm='node '+JSON.stringify(visual)+' --input {input} --prompt {prompt_quoted}';
  const args=[join(base,'src/render/cli.mjs'),'vision',other,
    '--vtt',itm,'--itt',itm,'--agent','node '+JSON.stringify(bad)+' --prompt {prompt}',
    '--instruct','嘿 Neo'];
  expect(()=>execFileSync(process.execPath,args,{cwd:base,timeout:90000,stdio:'pipe',env:queueEnv}))
    .toThrow();
  const meta=JSON.parse(readFileSync(join(other,'metadata.json'),'utf8'));
  expect(meta['clip.mp4']?.perception?.segments).toBeUndefined();
});

it('obsolete provider switch is rejected instead of silently becoming a prompt override',()=>{
  const folder=join(dir,'invalid-option');
  mkdirSync(folder,{recursive:true});
  expect(()=>execFileSync(process.execPath,[join(base,'src/render/cli.mjs'),'vision',folder,'--backend','deepseek'],{cwd:base,encoding:'utf8',stdio:'pipe'}))
    .toThrow(/Unknown vision option: --backend/);
});
