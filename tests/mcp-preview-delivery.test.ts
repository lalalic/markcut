import {describe,it,expect} from 'vitest';
import {normalizeReviewConfig,eventForReview} from '../src/mcp/review-delivery.mjs';

const template={type:'other.product.feedback',source:'app/custom-destination',responseKey:'response',
  data:{response:{opaque:'from caller'},meta:{source:'ok'}}};
const review={requestId:'r1',previewId:'p1',decision:'changes_requested',
  comments:[{sceneId:'intro',timeSeconds:3.2,text:'Shorter intro'}],idempotencyKey:'key1'};

describe('Generic Preview event transport',()=>{
 it('defaults to text; event delivery requires a caller envelope',()=>{
  expect(normalizeReviewConfig(undefined)).toEqual({delivery:'text'});
  expect(normalizeReviewConfig({delivery:'text'})).toEqual({delivery:'text'});
  expect(()=>normalizeReviewConfig({delivery:'callback'})).toThrow();
  expect(()=>normalizeReviewConfig({delivery:'event'})).toThrow();
 });
 it('accepts arbitrary caller event type, source and response key without reading business identity',()=>{
  const config=normalizeReviewConfig({delivery:'event',eventTemplate:template});
  const ev=eventForReview(config,review);
  expect(ev).toMatchObject({type:'other.product.feedback',source:'app/custom-destination',
    data:{meta:{source:'ok'},response:{opaque:'from caller',decision:'changes_requested',
      feedback:'Shorter intro',comments:review.comments,requestId:'r1',idempotencyKey:'key1'}}});
 });
 it('freezes caller metadata and does not let decisions rewrite it',()=>{
  const input={...template,data:{response:{opaque:'from caller'},meta:{source:'ok'}}};
  const config=normalizeReviewConfig({delivery:'event',eventTemplate:input});
  input.data.meta.source='changed after binding';
  const ev=eventForReview(config,review);
  expect(ev.data.meta.source).toBe('ok');
  expect(ev.data.response.opaque).toBe('from caller');
 });
 it('rejects invalid transport structure and unsafe property overrides',()=>{
  expect(()=>normalizeReviewConfig({delivery:'event',eventTemplate:{...template,source:'a\nb'}})).toThrow();
  expect(()=>normalizeReviewConfig({delivery:'event',eventTemplate:{...template,responseKey:'__proto__'}})).toThrow();
  expect(()=>normalizeReviewConfig({delivery:'event',eventTemplate:{...template,data:{response:{decision:'prefilled'}}}})).toThrow();
  expect(()=>normalizeReviewConfig({delivery:'event',eventTemplate:{...template,data:JSON.parse('{"__proto__":{}}')}})).toThrow();
  expect(()=>eventForReview({delivery:'event',eventTemplate:template},{...review,decision:'invalid'})).toThrow();
 });
 it('default response key is review for any event',()=>{
  const t={type:'work.done',source:'workspace/123',data:{context:{id:123}}};
  expect(eventForReview({delivery:'event',eventTemplate:t},review)).toMatchObject({
    type:t.type,source:t.source,data:{context:{id:123},review:{decision:'changes_requested'}}});
 });
});
