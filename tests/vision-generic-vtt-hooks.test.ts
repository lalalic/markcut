import { describe,it,expect,afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const base=resolve(import.meta.dirname,'..');
const dir=mkdtempSync(join(tmpdir(),'markcut-generic-hooks-'));
const media=join(dir,'media');
const visual=join(dir,'mock-visual.mjs');
const semantic=join(dir,'mock-segment-agent.mjs');
afterAll(()=>rmSync(dir,{force:true,recursive:true}));
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
  execFileSync(process.execPath,args,{cwd:base,timeout:200000,encoding:'utf8'});
  const meta=JSON.parse(readFileSync(join(media,'metadata.json'),'utf8'));
  expect(meta.photo.perception.desc).toContain('Recognized landscape');
  expect(meta.clip.perception.subtitle).toBe('clip.vtt');
  expect(meta.clip.perception.desc).toContain('Recognized landscape');
  expect(Object.keys(meta.clip.perception.segments)).toEqual(['0to2000','2000to4000']);
  expect(meta.clip.perception.segments['0to2000'].vision).toContain('Recognized landscape');
  expect(meta.clip.perception.segments['2000to4000'].instructions).toEqual([
    {utterance:'嘿 Neo，这里是一个重要镜头',intent:'emphasize later',time_seconds:2.2,confidence:'high'},
  ]);
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
  expect(()=>execFileSync(process.execPath,args,{cwd:base,timeout:90000,stdio:'pipe'}))
    .toThrow();
  const meta=JSON.parse(readFileSync(join(other,'metadata.json'),'utf8'));
  expect(meta.clip?.perception?.segments).toBeUndefined();
});
