import {describe,it,expect} from 'vitest';
import {normalizeReviewConfig,eventForReview} from '../src/mcp/review-delivery.mjs';

const template={type:'markcut.review.submitted',source:'job/j1/task/t1/execution/e1',data:{job:'j1',meta:{source:'ok'}}};
const review={requestId:'r1',previewId:'p1',revisionId:'rev1',contentHash:'a'.repeat(64),
  decision:'changes_requested',comments:[{sceneId:'intro',timeSeconds:3.2,text:'Shorter intro'}],idempotencyKey:'key1'};

describe('Provider-bound preview delivery',()=>{
 it('defaults to text and disallows a third delivery mode',()=>{
  expect(normalizeReviewConfig(undefined)).toEqual({delivery:'text'});
  expect(normalizeReviewConfig({delivery:'text'})).toEqual({delivery:'text'});
  expect(()=>normalizeReviewConfig({delivery:'callback'})).toThrow();
  expect(()=>normalizeReviewConfig({delivery:'event'})).toThrow();
 });
 it('rejects terminal event spoofing, arbitrary source and reserved data overrides',()=>{
  expect(()=>normalizeReviewConfig({delivery:'event',eventTemplate:{...template,type:'task.completed'}})).toThrow();
  expect(()=>normalizeReviewConfig({delivery:'event',eventTemplate:{...template,source:'job/a/task/b/execution/e/forged'}})).toThrow();
  expect(()=>normalizeReviewConfig({delivery:'event',eventTemplate:{...template,data:{review:{decision:'approved'}}}})).toThrow();
 });
 it('retains caller-owned envelope and only fills data.review',()=>{
  const config=normalizeReviewConfig({delivery:'event',eventTemplate:template});
  template.data.meta.source='changed after validation';
  const event=eventForReview(config,review);
  expect(event).toMatchObject({type:'markcut.review.submitted',source:template.source,
    data:{job:'j1',meta:{source:'ok'},review}});
  expect(event.data.review.idempotencyKey).toBe('key1');
 });
 it('refuses malformed review identity or decision',()=>{
  const config=normalizeReviewConfig({delivery:'event',eventTemplate:template});
  expect(()=>eventForReview(config,{...review,contentHash:'bogus'})).toThrow();
  expect(()=>eventForReview(config,{...review,decision:'task.completed'})).toThrow();
 });
});
