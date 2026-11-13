import { describe,it,expect,afterAll } from 'vitest';
import {execFileSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,rmSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {main} from '../src/vision/cli.mjs';
const folder=mkdtempSync(join(tmpdir(),'markcut-meta-single-'));
afterAll(()=>rmSync(folder,{recursive:true,force:true}));
it('filename keys, same-stem sources, normalized paths and preserved durations',async()=>{
  execFileSync('ffmpeg',['-v','error','-y','-f','lavfi','-i','color=c=blue:s=160x90:d=2','-frames:v','1',join(folder,'same.jpg')]);
  execFileSync('ffmpeg',['-v','error','-y','-f','lavfi','-i','testsrc2=s=160x90:r=2:d=62',
    '-c:v','libx264','-preset','ultrafast',join(folder,'same.mp4')]);
  writeFileSync(join(folder,'metadata.json'),JSON.stringify({'same':{perception:{desc:'Older metadata cache'}}}));
  await main(['node','vision','vision',folder,'--normalize-only']);
  const m=JSON.parse(readFileSync(join(folder,'metadata.json'),'utf8'));
  expect(Object.keys(m).sort()).toEqual(['same.jpg','same.mp4']);
  expect(m['same.jpg'].normalized).toMatch(/^\.normalized\/same.jpg_384\.jpg$/);
  expect(m['same.mp4'].normalized).toMatch(/^\.normalized\/same.mp4_full\.mp4$/);
  const output=join(folder,m['same.mp4'].normalized);
  expect(existsSync(output)).toBe(true);
  const duration=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',output],{encoding:'utf8'}).trim());
  expect(Math.abs(duration-62)).toBeLessThan(.6);
});
