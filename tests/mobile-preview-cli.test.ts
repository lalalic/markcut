import {describe,it,expect} from 'vitest';
import {parseEventPreviewOptions,neoReviewWrapper,buildReviewRequest,submitNeoReview} from '../src/mcp/mobile-review-cli.mjs';

describe('Standalone Markcut CLI preview (notification belongs to Neo)',()=>{
 it('accepts externally supplied event templates without a phone or APNs URL',()=>{
  expect(parseEventPreviewOptions(['preview','video.md','--delivery','event','--event-template','template.json']).delivery).toBe('event');
  expect(()=>parseEventPreviewOptions(['preview','video.md','--delivery','event'])).toThrow();
  expect(()=>parseEventPreviewOptions(['preview','video.md','--delivery','event','--event-template','a','--phone-url','http://phone'])).toThrow();
  expect(parseEventPreviewOptions(['preview','video.md','--delivery','text']).delivery).toBe('text');
  expect(()=>parseEventPreviewOptions(['preview','video.md','--delivery','text','--event-template','a'])).toThrow();
 });
});

describe('Neo-owned wrapper delivery from standalone CLI',()=>{
 const id='82ba2e6c-6432-4ecd-83ee-cb78ba87c668';
 const hash='f'.repeat(64);
 const options={file:'/tmp/preview.md'};
 const eventOptions={...options};
 const state={result:{id:'preview-123',contentHash:hash,revisionId:'revision-123'}};
 it('builds a durable, immutable text request for phone view-only sync',()=>{
  const request=buildReviewRequest(options,{delivery:'text'},state,id);
  expect(request).toMatchObject({id,contentHash:hash,revisionId:'revision-123',
    previewId:'preview-123',title:'preview',delivery:'text',groupId:'/tmp/preview.md'});
 });
 it('passes an opaque event template without interpreting the caller identity',()=>{
  const template={type:'task.interactive_decision',source:'job/12/task/prod/execution/ex1',
    data:{interactive:{jobId:'12',taskId:'prod',executionId:'ex1'}}};
  const request=buildReviewRequest(eventOptions,{delivery:'event',eventTemplate:template},state,id);
  expect(request).toMatchObject({id,mediaHash:hash,eventTemplate:template,groupId:'/tmp/preview.md'});
  expect(request).not.toHaveProperty('jobId');
  expect(request).not.toHaveProperty('revisionId');expect(request).not.toHaveProperty('contentHash');
 });
 it('delegates the complete immutable request to the Neo-owned wrapper',async()=>{
  const request=buildReviewRequest(options,{delivery:'text'},state,id);
  const seen:any[]=[];
  const receipt=await submitNeoReview(request,{deliver:async (value:any)=>{
   seen.push(value);return {stored:true,requestId:id,accepted:false};
  }} as any);
  expect(receipt.stored).toBe(true);
  expect(seen).toEqual([request]);
  await expect(submitNeoReview(request,{deliver:async()=>({stored:false,requestId:id})} as any)).rejects.toThrow('acknowledge');
 });
 it('requires a real Neo wrapper, never a direct review notification URL',()=>{
  expect(()=>neoReviewWrapper('/does/not/exist')).toThrow('unavailable');
 });
});
