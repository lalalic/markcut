import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createContactSheet, DeepSeekSession, parseReceipt, parseTileAnswer, perceptionForUnit, runWebhelmDeepseekVision } from '../src/vision/webhelm-deepseek.mjs';

const dir = mkdtempSync(join(tmpdir(), 'markcut-vision-batch-test-'));
const imgDir = join(dir, 'media');
const image1 = join(imgDir, 'image-a.png');
const image2 = join(imgDir, 'image-b.png');
const video = join(imgDir, 'clip.mp4');
const metadataPath = join(imgDir, 'metadata.json');
const initial = () => ({ 'image-a': { width: 64, height: 64 }, 'image-b': { width: 64, height: 64 }, clip: { width: 64, height: 64, duration: 3 } });
function mockSession() {
  return { start: vi.fn(), analyze: vi.fn((_file, prompt: string) => {
    const ids = [...prompt.matchAll(/^(T\d{3}) — /gm)].map(match => match[1]);
    return JSON.stringify({ tiles: ids.map(id => ({ id, description: `${id} observed detail` })) });
  }), close: vi.fn() };
}

beforeAll(() => {
  mkdirSync(imgDir);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=red:s=64x64', '-frames:v', '1', image1]);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=64x64', '-frames:v', '1', image2]);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=64x64:rate=10:duration=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', video]);
  writeFileSync(metadataPath, JSON.stringify(initial()));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('WebHelm DeepSeek batched vision', () => {
  it('renders a real labeled contact sheet from multiple inputs', () => {
    const file = join(dir, 'contact.jpg');
    createContactSheet([{ id: 'T001', path: image1 }, { id: 'T002', path: image2 }], file);
    expect(existsSync(file)).toBe(true);
    const dimensions = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim();
    expect(dimensions).toBe('840,280');
  });
  it('rejects missing and duplicate tile IDs rather than hallucinating assignments', () => {
    expect(() => parseTileAnswer('{"tiles":[{"id":"T001","description":"red"}]}', [{ id: 'T001' }, { id: 'T002' }])).toThrow('mismatch');
    expect(() => parseTileAnswer('{"tiles":[{"id":"T001","description":"red"},{"id":"T001","description":"blue"}]}', [{ id: 'T001' }])).toThrow('duplicate');
  });
  it('refuses incomplete browser receipts and never accepts pending as completed', () => {
    expect(() => parseReceipt(JSON.stringify({ result: { ok: true, stdout: '{"status":"pending"}' } }))).toThrow('not completed');
  });
  it('reuses one browser session, batches two images + three timed video frames, and saves metadata', async () => {
    const session = mockSession();
    const events: any[] = [];
    const stats = await runWebhelmDeepseekVision({ folder: imgDir, metadataPath, batchSize: 6, sampleInterval: 1, skipSTT: true, session, onMedia: event => events.push(event) });
    expect(events).toHaveLength(3);
    expect(new Set(events.map(event => event.mediaId)).size).toBe(3);
    for (const event of events) {
      expect(event.event).toBe('media');
      expect(event.status).toBe('completed');
      expect(event.perception.observations.every((obs: any) => obs.mediaId === event.mediaId)).toBe(true);
    }
    const videoEvent = events.find(event => event.mediaId === 'clip.mp4');
    expect(videoEvent.perception.observations).toHaveLength(3);
    expect(videoEvent.perception.observations[0].startSeconds).toBe(0);
    expect(videoEvent.perception.observations.at(-1).endSeconds).toBe(3);
    expect(stats).toEqual({ processed: 3, cached: 0, batches: 1 });
    expect(session.start).toHaveBeenCalledTimes(1);
    expect(session.analyze).toHaveBeenCalledTimes(1);
    const meta = JSON.parse(readFileSync(metadataPath, 'utf8'));
    expect(meta['image-a'].perception.desc).toContain('observed');
    expect(meta['image-b'].perception.desc).toContain('observed');
    expect(Object.keys(meta.clip.perception.segments)).toHaveLength(3);
    expect(meta.clip.perception.desc).toContain('s:');
    expect(meta.clip.mediaId).toBe('clip.mp4');
    expect(meta.clip.mediaType).toBe('video');
    expect(meta.clip.perception.observations.every((obs: any) => obs.mediaId === 'clip.mp4')).toBe(true);
    const again = await runWebhelmDeepseekVision({ folder: imgDir, metadataPath, batchSize: 6, sampleInterval: 1, skipSTT: true, session, onMedia: event => events.push(event) });
    expect(events.slice(3).map(event => event.status)).toEqual(['cached', 'cached', 'cached']);
    expect(again).toEqual({ processed: 0, cached: 3, batches: 0 });
    expect(session.analyze).toHaveBeenCalledTimes(1);
  });
  it('does not corrupt successful metadata when browser response is incomplete', async () => {
    const before = readFileSync(metadataPath, 'utf8');
    const broken = { start: vi.fn(), analyze: () => '{"tiles":[]}', close: vi.fn() };
    await expect(runWebhelmDeepseekVision({ folder: imgDir, metadataPath, batchSize: 8, sampleInterval: 2, skipSTT: true, session: broken })).rejects.toThrow('mismatch');
    expect(readFileSync(metadataPath, 'utf8')).toEqual(before);
  });
  it('persists each successful media synchronously even if a later batch fails', async () => {
    writeFileSync(metadataPath, JSON.stringify(initial()));
    let attempts = 0;
    const received: any[] = [];
    const session = { start: vi.fn(), analyze: (_sheet: string, prompt: string) => {
      attempts++;
      if (attempts > 1) return '{"tiles":[]}';
      const ids = [...prompt.matchAll(/^(T\d{3}) — /gm)].map(match => match[1]);
      return JSON.stringify({ tiles: ids.map(id => ({ id, description: `${id} confirmed` })) });
    } };
    await expect(runWebhelmDeepseekVision({ folder: imgDir, metadataPath, batchSize: 2, sampleInterval: 2, skipSTT: true, session, onMedia: event => received.push(event) })).rejects.toThrow('mismatch');
    expect(attempts).toBe(2);
    expect(received.map(item => item.mediaId)).toEqual(['clip.mp4']);
    const saved = JSON.parse(readFileSync(metadataPath, 'utf8'));
    expect(saved.clip.perception.observations).toHaveLength(2);
    expect(saved['image-a'].perception).toBeUndefined();
    expect(saved['image-b'].perception).toBeUndefined();
  });
  it('collects every video frame across multiple contact-sheet submissions before saving complete video', async () => {
    writeFileSync(metadataPath, JSON.stringify(initial()));
    const session = mockSession();
    const events: any[] = [];
    const stats = await runWebhelmDeepseekVision({
      folder: imgDir, metadataPath, batchSize: 2, sampleInterval: 0.5,
      skipSTT: true, session, onMedia: event => events.push(event),
    });
    const actual = JSON.parse(readFileSync(metadataPath, 'utf8'));
    expect(stats.processed).toBe(3);
    expect(stats.batches).toBe(4); // six video frames + two independent photos
    expect(session.analyze).toHaveBeenCalledTimes(4);
    expect(actual.clip.perception.observations).toHaveLength(6);
    expect(Object.keys(actual.clip.perception.segments)).toHaveLength(6);
    expect(events.filter(e => e.mediaId === 'clip.mp4')).toHaveLength(1);
  });
  it('resumes a pending browser answer without uploading the image twice', () => {
    const requests: any[] = [];
    const session = new DeepSeekSession({ sessionId: 'existing-session', runner: (_command, args: string[]) => {
      const cfg = JSON.parse(readFileSync(args[args.indexOf('--config') + 1], 'utf8'));
      requests.push(cfg);
      const reply = requests.length === 1
        ? { status: 'pending', thread_id: 'known-thread-id' }
        : { status: 'completed', thread_id: 'known-thread-id', answer: '{"tiles":[{"id":"T001","description":"visible trees"}]}' };
      return JSON.stringify({ result: { ok: true, stdout: JSON.stringify(reply) } });
    } });
    expect(session.analyze(image1, 'describe this image', dir, 10)).toContain('visible trees');
    expect(requests).toHaveLength(2);
    expect(requests[0].image).toBe(image1);
    expect(requests[1]).toEqual({ resume: true, thread_id: 'known-thread-id', timeout_seconds: 10 });
  });
  it('keeps an uncertain upload from triggering another browser submission' , () => {
    let sends = 0;
    const session = new DeepSeekSession({ sessionId: 'existing-session', runner: (_cmd, args: string[]) => {
      if (args.includes('understand-image')) sends++;
      return JSON.stringify({ result: { ok: false, error: 'Submission may have succeeded but its receipt was not verified' } });
    } });
    expect(() => session.analyze(image1, 'describe', dir, 10)).toThrow('uncertain');
    expect(sends).toBe(1);
  });
});
