import {describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseEventPreviewOptions} from '../src/mcp/mobile-review-cli.mjs';
import {buildPhoneReviewRequest,sendMasterReviewRequest} from '../src/mcp/phone-notification.mjs';
const hash='a'.repeat(64);
const operationId=randomUUID();
const template={type:'task.interactive_decision',source:'job/j1/task/producer/execution/e1',
 data:{interactive:{jobId:'j1',taskId:'producer',executionId:'e1',invocationId:'review1'}}};
const result={id:hash,contentHash:hash,revisionId:hash,requestedPath:'/tmp/preview.md'};

describe('Unified Master review notification from both MCP and CLI',()=>{
 it('enforces event CLI template without phone URL dependency',()=>{
  expect(parseEventPreviewOptions(['preview','video.md','--delivery','event','--event-template','template.json']).delivery).toBe('event');
  expect(()=>parseEventPreviewOptions(['preview','video.md','--delivery','event'])).toThrow();
  expect(()=>parseEventPreviewOptions(['preview','video.md','--delivery','event','--event-template','a','--phone-url','http://phone'])).toThrow();
  expect(parseEventPreviewOptions(['preview','video.md','--delivery','text']).delivery).toBe('text');
  expect(()=>parseEventPreviewOptions(['preview','video.md','--delivery','text','--event-template','a'])).toThrow();
 });
 it('event request freezes caller template and immutable revision identity',()=>{
  const request=buildPhoneReviewRequest(operationId,result,{delivery:'event',eventTemplate:template});
  expect(request).toMatchObject({id:operationId,contentHash:hash,revisionId:hash,previewId:hash,
    title:'preview',delivery:'event',jobId:'j1',groupId:'job/j1/task/producer',eventTemplate:template});
  expect(request.eventTemplate.data.interactive).not.toHaveProperty('decision');
  expect(()=>buildPhoneReviewRequest(operationId,result,{delivery:'event',eventTemplate:{...template,type:'markcut.review.submitted'}})).toThrow();
  expect(()=>buildPhoneReviewRequest(operationId,{...result,contentHash:'bad'},{delivery:'event',eventTemplate:template})).toThrow();
 });
 it('default ChatGPT text Preview is still mirrored to phone as view-only',()=>{
  const request=buildPhoneReviewRequest(operationId,result,{delivery:'text'});
  expect(request).toMatchObject({id:operationId,delivery:'text',contentHash:hash,groupId:'/tmp/preview.md'});
  expect(request).not.toHaveProperty('eventTemplate');
  expect(request).not.toHaveProperty('ownerCallbackTool');
 });
 it('uses the local Master APNs bridge, requires durable storage acknowledgment',async()=>{
  const tmp=mkdtempSync(join(tmpdir(),'markcut-master-bridge-'));
  const script=join(tmp,'bridge.mjs');
  const request=buildPhoneReviewRequest(operationId,result,{delivery:'event',eventTemplate:template});
  try{
    writeFileSync(script,`import fs from 'node:fs';const data=JSON.parse(fs.readFileSync(0,'utf8'));process.stdout.write(JSON.stringify({stored:true,accepted:false,requestId:data.id}));`);
    expect(await sendMasterReviewRequest(request,{bridge:script})).toMatchObject({stored:true,accepted:false,requestId:operationId});
    writeFileSync(script,`process.stdout.write(JSON.stringify({stored:false,requestId:'${operationId}'}));`);
    await expect(sendMasterReviewRequest(request,{bridge:script})).rejects.toThrow(/persist/);
  }finally{rmSync(tmp,{recursive:true,force:true});}
 });
});
