import {describe,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {
  parseEventPreviewOptions,phoneUrlFromDnsSdText,validatePhoneUrl,
  buildMobileReviewRequest,sendMobileReviewRequest,
} from '../src/mcp/mobile-review-cli.mjs';
const hash='a'.repeat(64);
const eventTemplate={type:'task.interactive_decision',source:'job/j1/task/producer/execution/e1',data:{
  interactive:{jobId:'j1',taskId:'producer',executionId:'e1',invocationId:'review-req-1'},
}};
const id=randomUUID();
const operation={id,state:'ready',result:{id:hash,contentHash:hash,revisionId:hash,requestedPath:'/tmp/preview.md'}};

describe('Codex CLI event preview to Neo Mobile',()=>{
  it('requires an explicit event template and rejects incomplete or unexpected flags',()=>{
    expect(parseEventPreviewOptions(['preview','video.md','--delivery','event','--event-template','template.json']).delivery).toBe('event');
    expect(()=>parseEventPreviewOptions(['preview','video.md','--delivery','event'])).toThrow(/event-template/);
    expect(()=>parseEventPreviewOptions(['preview','video.md','--delivery','callback','--event-template','template.json'])).toThrow();
    expect(()=>parseEventPreviewOptions(['preview','video.md','--delivery','event','--event-template','t.json','--other','x'])).toThrow();
    expect(()=>parseEventPreviewOptions(['preview','video.md','--delivery','event','--event-template','t.json','--request-id','bad'])).toThrow();
  });
  it('finds Neo Mobile from Bonjour but only permits trusted local HTTP or HTTPS MCP addresses',()=>{
    const dns='18:45:31 neox._mcp._tcp.local. can be reached at 17.local.:9223 (interface 11)';
    expect(phoneUrlFromDnsSdText(dns)).toBe('http://17.local:9223/mcp');
    expect(phoneUrlFromDnsSdText('unrelated service')).toBeNull();
    expect(validatePhoneUrl('http://10.0.0.241:9223/mcp')).toBe('http://10.0.0.241:9223/mcp');
    expect(()=>validatePhoneUrl('http://example.org:9223/mcp')).toThrow();
    expect(()=>validatePhoneUrl('http://17.local:9223/mcp?target=evil')).toThrow();
  });
  it('constructs the immutable revision request with the caller-owned template',()=>{
    const request=buildMobileReviewRequest(operation,eventTemplate,{requestId:id,file:'/tmp/preview.md'});
    expect(request).toMatchObject({id,contentHash:hash,revisionId:hash,previewId:hash,
      delivery:'event',groupId:'job/j1/task/producer',jobId:'j1',title:'preview',
      eventTemplate:{type:'task.interactive_decision',source:eventTemplate.source,data:{interactive:{invocationId:'review-req-1'}}}});
    expect(request.eventTemplate.data.interactive).not.toHaveProperty('decision');
    expect(()=>buildMobileReviewRequest(operation,{...eventTemplate,type:'markcut.review.submitted'},{})).toThrow();
    expect(()=>buildMobileReviewRequest({...operation,result:{...operation.result,contentHash:'old'}},eventTemplate,{})).toThrow();
  });
  it('sends review.request to the phone and requires its accepted matching receipt',async()=>{
    const request=buildMobileReviewRequest(operation,eventTemplate,{requestId:id});
    const fakeFetch=vi.fn(async (_url,opts)=>{
      const sent=JSON.parse(opts.body);
      expect(sent).toMatchObject({method:'tools/call',params:{name:'review.request',arguments:request}});
      return {ok:true,json:async()=>({result:{content:[{type:'text',text:JSON.stringify({accepted:true,duplicate:false,id})}]}})};
    });
    expect(await sendMobileReviewRequest('http://17.local:9223/mcp',request,{fetchImpl:fakeFetch})).toEqual({accepted:true,duplicate:false,id});
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });
  it('reuses the same request identity on uncertain transport retries and refuses false success',async()=>{
    const request=buildMobileReviewRequest(operation,eventTemplate,{requestId:id});
    const stable=[];
    const fakeFetch=vi.fn(async(_url,opts)=>{
      stable.push(JSON.parse(opts.body).params.arguments.id);
      if(stable.length===1)throw new Error('lost ACK');
      return {ok:true,json:async()=>({result:{content:[{type:'text',text:JSON.stringify({accepted:true,duplicate:true,id})}]}})};
    });
    expect((await sendMobileReviewRequest('http://17.local:9223/mcp',request,{fetchImpl:fakeFetch})).duplicate).toBe(true);
    expect(stable).toEqual([id,id]);
    const reject=vi.fn(async()=>({ok:true,json:async()=>({result:{content:[{type:'text',text:'Error: invalid review request'}]}})}));
    await expect(sendMobileReviewRequest('http://17.local:9223/mcp',request,{fetchImpl:reject})).rejects.toThrow(/no structured review receipt/);
  });
});
