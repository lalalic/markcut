import {describe,it,expect} from 'vitest';
import {parseEventPreviewOptions,neoReviewEndpoint,buildReviewRequest,submitNeoReview} from '../src/mcp/mobile-review-cli.mjs';

describe('Standalone Markcut CLI preview (notification belongs to Neo)',()=>{
 it('accepts externally supplied event templates without a phone or APNs URL',()=>{
  expect(parseEventPreviewOptions(['preview','video.md','--delivery','event','--event-template','template.json']).delivery).toBe('event');
  expect(()=>parseEventPreviewOptions(['preview','video.md','--delivery','event'])).toThrow();
  expect(()=>parseEventPreviewOptions(['preview','video.md','--delivery','event','--event-template','a','--phone-url','http://phone'])).toThrow();
  expect(parseEventPreviewOptions(['preview','video.md','--delivery','text']).delivery).toBe('text');
  expect(()=>parseEventPreviewOptions(['preview','video.md','--delivery','text','--event-template','a'])).toThrow();
 });
});

describe('Neo-owned REST notification from standalone CLI',()=>{
 const id='82ba2e6c-6432-4ecd-83ee-cb78ba87c668';
 const hash='f'.repeat(64);
 const options={file:'/tmp/preview.md'};
 const state={result:{id:'preview-123',contentHash:hash,revisionId:'revision-123'}};
 it('builds a durable, immutable text request for phone view-only sync',()=>{
  const request=buildReviewRequest(options,{delivery:'text'},state,id);
  expect(request).toMatchObject({id,contentHash:hash,revisionId:'revision-123',
    previewId:'preview-123',title:'preview',delivery:'text',groupId:'/tmp/preview.md'});
 });
 it('uses exact caller-bound template for Relay event review',()=>{
  const template={type:'task.interactive_decision',source:'job/12/task/prod/execution/ex1',
    data:{interactive:{jobId:'12',taskId:'prod',executionId:'ex1',invocationId:'i1'}}};
  const request=buildReviewRequest(options,{delivery:'event',eventTemplate:template},state,id);
  expect(request).toMatchObject({id,eventTemplate:template,jobId:'12',groupId:'job/12/task/prod'});
 });
 it('POSTs to local Neo Core REST and requires persisted matching ACK',async()=>{
  const request=buildReviewRequest(options,{delivery:'text'},state,id);
  const seen:any[]=[];
  const fetchImpl=async (url:string,init:any)=>{
    seen.push({url,init});return {ok:true,json:async()=>({stored:true,requestId:id,accepted:false})};
  };
  const receipt=await submitNeoReview(request,{url:'http://127.0.0.1:6767/mobile/review/notify',fetchImpl} as any);
  expect(receipt.stored).toBe(true);
  expect(seen[0].init.method).toBe('POST');
  expect(JSON.parse(seen[0].init.body)).toEqual(request);
  expect(seen[0].init.headers['Content-Type']).toBe('application/json');
  await expect(submitNeoReview(request,{url:'http://127.0.0.1:6767/mobile/review/notify',fetchImpl:async()=>({ok:true,json:async()=>({stored:false,requestId:id})})} as any)).rejects.toThrow('acknowledge');
  await expect(submitNeoReview(request,{url:'http://127.0.0.1:6767/mobile/review/notify',fetchImpl:async()=>({ok:false,status:403})} as any)).rejects.toThrow('403');
 });
 it('rejects delivery to remote origins and non-review routes',async()=>{
  expect(()=>neoReviewEndpoint('https://evil.example/mobile/review/notify')).toThrow('local REST');
  await expect(submitNeoReview({id} as any,{url:'http://127.0.0.1:6767/mcp'})).rejects.toThrow('nonlocal');
 });
});
