import {afterEach,describe,expect,it} from 'vitest';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {main} from '../src/vision/cli.mjs';

const roots:string[]=[];
const probe=(file:string)=>JSON.parse(execFileSync('ffprobe',[
 '-v','error','-show_entries','stream=codec_name,codec_type,width,height:format=duration:format_tags',
 '-of','json',file],{encoding:'utf8'}));
const hash=(f:string)=>createHash('sha256').update(readFileSync(f)).digest('hex');
afterEach(()=>{for(const p of roots.splice(0))rmSync(p,{recursive:true,force:true});});

describe('Markcut Vision native normalization-only mode',()=>{
 it('normalizes images and video for understanding without touching originals or running AI',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'markcut-vision-tiny-'));roots.push(dir);
  const inputVideo=join(dir,'source.mov'),inputImage=join(dir,'photo.png');
  execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y',
   '-f','lavfi','-i','testsrc2=size=1600x900:duration=2:rate=10',
   '-f','lavfi','-i','sine=frequency=440:duration=2',
   '-metadata','location=+45.5000-075.7500/',
   '-c:v','libx264','-preset','ultrafast','-crf','18','-c:a','aac','-shortest',inputVideo]);
  execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y',
   '-f','lavfi','-i','color=c=blue:s=1600x900:d=1','-frames:v','1',inputImage]);
  const before=[hash(inputVideo),hash(inputImage)];
  let text='';const old=console.log;
  console.log=(value:unknown)=>{text+=String(value)+'\n';};
  try{await main(['node','cli.mjs','vision',dir,'--normalize-only']);}
  finally{console.log=old;}
  const result=JSON.parse(text.trim().split('\n').at(-1)!);
  expect(result).toMatchObject({status:'PASS',profile:'markcut-vision-normalized-v1',usage:'vision-understanding-only'});
  expect(result.files).toHaveLength(2);
  const videos=result.files.filter((x:{kind:string})=>x.kind==='video');
  const images=result.files.filter((x:{kind:string})=>x.kind==='image');
  expect(videos).toHaveLength(1);expect(images).toHaveLength(1);
  expect(videos[0].sampled).toBe(false);
  expect(videos[0].sourceDurationSeconds).toBeGreaterThanOrEqual(1.9);
  for(const item of result.files){
   expect(existsSync(item.path)).toBe(true);
   expect(item.path).toContain('/.normalized/');
   const metadata=probe(item.path),stream=metadata.streams.find((x:{codec_type:string})=>x.codec_type==='video');
   expect(Math.max(stream.width,stream.height)).toBeLessThanOrEqual(item.maxDimension);
   expect(JSON.stringify(metadata.format?.tags||{}).toLowerCase()).not.toContain('location');
   if(item.kind==='video'){
    expect(stream.codec_name).toBe('h264');
    expect(metadata.streams.some((x:{codec_type:string})=>x.codec_type==='audio')).toBe(true);
   }
  }
  expect([hash(inputVideo),hash(inputImage)]).toEqual(before);
  // Native cache is re-usable with the same source filenames.
  const t=JSON.parse(text.trim()); expect(t.files.length).toBe(2);
 });
});
