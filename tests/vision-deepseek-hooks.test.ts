import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inferDeepSeekVisual, parseDeepSeekInferArgs } from '../src/vision/deepseek-infer.mjs';
const dir = mkdtempSync(join(tmpdir(), 'markcut-deepseek-hooks-'));
const first = join(dir, 'a.png');
const second = join(dir, 'b.png');
const video = join(dir, 'clip.mp4');
beforeAll(() => {
  execFileSync('ffmpeg', ['-loglevel','error','-y','-f','lavfi','-i','color=c=red:s=80x60','-frames:v','1',first]);
  execFileSync('ffmpeg', ['-loglevel','error','-y','-f','lavfi','-i','color=c=blue:s=80x60','-frames:v','1',second]);
  execFileSync('ffmpeg', ['-loglevel','error','-y','-f','lavfi','-i','testsrc=size=80x60:rate=8:duration=4','-c:v','libx264','-pix_fmt','yuv420p',video]);
});
afterAll(() => rmSync(dir,{recursive:true,force:true}));
function fakeSession() {
  return {
    start: vi.fn(), refreshLease: vi.fn(), close: vi.fn(),
    analyze: vi.fn((_sheet: string,prompt: string) => {
      const ids = [...prompt.matchAll(/^(T\d{3}) — /gm)].map(m => m[1]);
      return JSON.stringify({tiles:ids.map(id=>({id,description:'Observed '+id+' in photo/video'}))});
    })
  };
}
describe('DeepSeek as generic Markcut ITT/VTT hook', () => {
  it('accepts shell template argv without requiring --backend', () => {
    expect(parseDeepSeekInferArgs(['--prompt','嘿 Neo; $(echo bad)',['--input'],first].flat())).toMatchObject({
      inputs:[first],prompt:'嘿 Neo; $(echo bad)'
    });
    expect(() => parseDeepSeekInferArgs(['--batch-size','99',first])).toThrow('Invalid');
  });
  it('returns image descriptions with distinct IDs in one contact sheet', () => {
    const s=fakeSession();
    const result=inferDeepSeekVisual({inputs:[first,second],prompt:'照片上下文',session:s});
    expect(result).toContain('a.png:');
    expect(result).toContain('b.png:');
    expect(result).toContain('T001');
    expect(result).toContain('T002');
    expect(s.analyze).toHaveBeenCalledTimes(1);
    expect(s.start).toHaveBeenCalledTimes(1);
    expect(s.analyze.mock.calls[0][1]).toContain('照片上下文');
  });
  it('uses source video frames and original approximate timestamp; rotates lease between batches', () => {
    const s=fakeSession();
    const result=inferDeepSeekVisual({inputs:[video],prompt:'骑行背景',sampleInterval:1,batchSize:2,session:s});
    expect(result).toContain('clip.mp4');
    expect(result).toMatch(/\d+\.\d{2}s: Observed/);
    expect(s.analyze.mock.calls.length).toBeGreaterThan(1);
    expect(s.refreshLease.mock.calls.length).toBe(s.analyze.mock.calls.length);
  });
  it('rejects missing DeepSeek tiles instead of persisting mismapped text', () => {
    const s=fakeSession();
    s.analyze=vi.fn(()=>'{"tiles":[]}') as any;
    expect(()=>inferDeepSeekVisual({inputs:[first],session:s})).toThrow('mismatch');
  });
});
