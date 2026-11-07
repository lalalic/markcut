import {describe,it,expect} from 'vitest';
import {normalizeReviewConfig,eventForReview} from '../src/mcp/review-delivery.mjs';

const template={type:'task.interactive_decision',source:'job/j1/task/t1/execution/e1',
  data:{interactive:{jobId:'j1',taskId:'t1',executionId:'e1',invocationId:'review-r1'},meta:{source:'ok'}}};
const sha='c'.repeat(40);
const review={requestId:'r1',previewId:'p1',commitSha:sha,
  decision:'changes_requested',comments:[{sceneId:'intro',timeSeconds:3.2,text:'Shorter intro'}],idempotencyKey:'key1'};

describe('Provider-bound preview delivery',()=>{
 it('defaults to text and rejects unsupported delivery modes',()=>{
  expect(normalizeReviewConfig(undefined)).toEqual({delivery:'text'});
  expect(normalizeReviewConfig({delivery:'text'})).toEqual({delivery:'text'});
  expect(()=>normalizeReviewConfig({delivery:'callback'})).toThrow();
  expect(()=>normalizeReviewConfig({delivery:'event'})).toThrow();
 });
 it('rejects old Markcut events, terminal spoofing, untrusted sources and fixed decision overrides',()=>{
  expect(()=>normalizeReviewConfig({delivery:'event',eventTemplate:{...template,type:'markcut.review.submitted'}})).toThrow();
  expect(()=>normalizeReviewConfig({delivery:'event',eventTemplate:{...template,type:'task.completed'}})).toThrow();
  expect(()=>normalizeReviewConfig({delivery:'event',eventTemplate:{...template,source:'job/a/task/b/execution/e/forged'}})).toThrow();
  expect(()=>normalizeReviewConfig({delivery:'event',eventTemplate:{...template,
    data:{interactive:{...template.data.interactive,decision:'approved'}}}})).toThrow();
  expect(()=>normalizeReviewConfig({delivery:'event',eventTemplate:{...template,
    data:{interactive:{...template.data.interactive,taskId:'forged'}}}})).toThrow();
  expect(()=>normalizeReviewConfig({delivery:'event',eventTemplate:{...template,
    data:{interactive:{...template.data.interactive,revision:sha}}}})).toThrow();
 });
 it('freezes caller-owned identity and fills only data.interactive fields on human submit',()=>{
  const config=normalizeReviewConfig({delivery:'event',commitSha:sha,eventTemplate:template});
  template.data.meta.source='changed after validation';
  const event=eventForReview(config,review);
  expect(event).toMatchObject({type:'task.interactive_decision',source:template.source,
    data:{meta:{source:'ok'},interactive:{jobId:'j1',taskId:'t1',executionId:'e1',
      invocationId:'review-r1',revision:sha,commitSha:sha,
      decision:'changes_requested',feedback:'Shorter intro',comments:review.comments,
      idempotencyKey:'key1'}}});
  expect(template.data.interactive).not.toHaveProperty('decision');
 });
 it('refuses malformed review identity or unauthorized decision',()=>{
  const config=normalizeReviewConfig({delivery:'event',commitSha:sha,eventTemplate:template});
  expect(()=>eventForReview(config,{...review,commitSha:'bogus'})).toThrow();
  expect(()=>eventForReview(config,{...review,decision:'task.completed'})).toThrow();
 });
});
