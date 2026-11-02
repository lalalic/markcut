import {describe,it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';

describe('stateless Markcut review',()=>{
 it('does not register review session tools or reference a session store',async()=>{
  const server=await readFile(new URL('../src/mcp/server.mjs',import.meta.url),'utf8');
  const operation=await readFile(new URL('../src/mcp/compile-operation.mjs',import.meta.url),'utf8');
  const worker=await readFile(new URL('../src/mcp/compile-worker.mjs',import.meta.url),'utf8');
  const source=server+operation+worker;
  for(const tool of ['markcut.review.list','markcut.review.get','markcut.review.media','markcut.review.decide'])expect(source).not.toContain(tool);
  expect(source).toContain('markcut.preview.media');
  expect(source).not.toContain('review-sessions.json');
  expect(source).not.toContain('createOrReuseReviewSession');
  expect(source).not.toContain('publishReviewRevision');
 });
});
