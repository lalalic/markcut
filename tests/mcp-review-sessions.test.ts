import {describe,it,expect} from 'vitest';
import {mkdir,mkdtemp,readFile,writeFile,rm,stat,utimes} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';

describe('durable Markcut mobile Review Sessions',()=>{
 it('deduplicates an unchanged preview and accepts only one decision for the latest hash',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'markcut-review-'));
  const old=process.env.MARKCUT_REVIEW_STORE, oldExport=process.env.MARKCUT_EXPORT_ROOT;
  process.env.MARKCUT_REVIEW_STORE=join(dir,'private','review-sessions.json'); process.env.MARKCUT_EXPORT_ROOT=join(dir,'exports');
  try {
   const review=await import('../src/mcp/review-sessions.mjs');
   const path=join(dir,'video.md'); await writeFile(path,'# video\n');
   const first=review.createOrReuseReviewSession(path,{jobId:'job-a',taskId:7});
   const duplicate=review.createOrReuseReviewSession(path,{jobId:'job-a',taskId:7});
   expect(duplicate.id).toBe(first.id);
   expect(duplicate.videoGroupKey).toMatch(/^[0-9a-f]{64}$/);
   expect(duplicate.videoGroupKey).toBe(first.videoGroupKey);
   const creativeOne = join(dir,'runs','today-run','creatives','v1','video.md');
   const creativeTwo = join(dir,'runs','today-run','creatives','v2','video.md');
   const unrelated = join(dir,'runs','another-run','creatives','v1','video.md');
   for(const path of [creativeOne,creativeTwo,unrelated]) {
     await mkdir(join(path,'..'),{recursive:true});await writeFile(path,'# video\n');
   }
   const one=review.createOrReuseReviewSession(creativeOne);
   const two=review.createOrReuseReviewSession(creativeTwo);
   const otherRun=review.createOrReuseReviewSession(unrelated);
   expect(one.videoGroupKey).toBe(two.videoGroupKey);
   expect(one.videoGroupKey).not.toBe(otherRun.videoGroupKey);
   expect(one.videoGroupTitle).toBe('today-run');

   expect(JSON.stringify(first)).not.toContain(dir);

   await mkdir(join(dir,'exports','cache'),{recursive:true});
   await writeFile(join(dir,'exports','cache','a'.repeat(64)+'.json'),JSON.stringify({root:{type:'root',children:[]}}));
   const updated=review.publishReviewRevision(first.id,{revisionId:'rev-1',contentHash:'a'.repeat(64),compiledUrl:'https://neo.test/compiled.json'});
   expect(updated.status).toBe('ready');
   expect(review.getReviewMedia(first.id,'a'.repeat(64)).compiled.root.type).toBe('root');
   const input={sessionId:first.id,contentHash:'a'.repeat(64),decision:'changes_requested',comments:[{scope:'overall',text:'Tighten the opening'}],idempotencyKey:'mobile-action-0001'};
   expect(review.decideReviewSession(input).duplicate).toBe(false);
   expect(review.decideReviewSession(input).duplicate).toBe(true);
   expect(()=>review.decideReviewSession({...input,idempotencyKey:'mobile-action-0002'})).toThrow(/already exists/);
   expect(review.getReviewSession(first.id).decision.decision).toBe('changes_requested');
   const recovered=await import('../src/mcp/review-sessions.mjs?durability-check');
   expect(recovered.getReviewSession(first.id).decision.idempotencyKey).toBe('mobile-action-0001');
   const store=join(dir,'private','review-sessions.json');
   const external=JSON.parse(await readFile(store,'utf8'));
   external.sessions.find((row:any)=>row.id===first.id).relayCorrelations.push({jobId:'worker-write',taskId:12});
   await writeFile(store,JSON.stringify(external));
   expect(review.getReviewSession(first.id).relayCorrelations).toContainEqual({jobId:'worker-write',taskId:12});
   const other=join(dir,'other.md'); await writeFile(other,'# video v1\n');
   const oldSession=review.createOrReuseReviewSession(other);
   review.publishReviewRevision(oldSession.id,{revisionId:'r1',contentHash:'1'.repeat(64)});
   await writeFile(other,'# video v2\n');
   const latest=review.createOrReuseReviewSession(other,{jobId:'job-b',taskId:8});
   expect(review.getReviewSession(oldSession.id).status).toBe('superseded');
   expect(review.getReviewSession(oldSession.id).videoGroupKey).toBe(latest.videoGroupKey);
   expect(review.getReviewSession(oldSession.id).videoGroupKey).not.toBe(first.videoGroupKey);
   expect(()=>review.decideReviewSession({sessionId:oldSession.id,contentHash:'1'.repeat(64),decision:'approved',comments:[],idempotencyKey:'mobile-action-0003'})).toThrow(/current compiled revision/);
   review.publishReviewRevision(latest.id,{revisionId:'r2',contentHash:'2'.repeat(64)});
   await writeFile(other,'# edited after preview\n');
   expect(()=>review.decideReviewSession({sessionId:latest.id,contentHash:'2'.repeat(64),decision:'approved',comments:[],idempotencyKey:'mobile-action-0004'})).toThrow(/current compiled revision/);
   const assetVideo=join(dir,'asset-video.md'),asset=join(dir,'shot.png');
   await writeFile(asset,Buffer.from('one'));
   await writeFile(assetVideo,'# video\n- image src:shot.png duration:1\n');
   const assetFirst=review.createOrReuseReviewSession(assetVideo);
   const priorStat=await stat(asset);await writeFile(asset,Buffer.from('two'));await utimes(asset,priorStat.atime,priorStat.mtime);
   const assetNext=review.createOrReuseReviewSession(assetVideo);
   expect(assetNext.id).not.toBe(assetFirst.id);
   expect(review.getReviewSession(assetFirst.id).status).toBe('superseded');
   const concurrentPath=join(dir,'concurrent.md');await writeFile(concurrentPath,'# concurrent\n');
   const concurrent=review.createOrReuseReviewSession(concurrentPath);
   review.publishReviewRevision(concurrent.id,{revisionId:'concurrent-r1',contentHash:'d'.repeat(64)});
   const moduleUrl=new URL('../src/mcp/review-sessions.mjs',import.meta.url).href;
   const runDecision=(key:string)=>new Promise<void>(resolve=>{
    const code=`import(${JSON.stringify(moduleUrl)}).then(m=>{try{m.decideReviewSession({sessionId:${JSON.stringify(concurrent.id)},contentHash:${JSON.stringify('d'.repeat(64))},decision:'approved',comments:[],idempotencyKey:${JSON.stringify(key)}})}catch{}})`;
    const child=spawn(process.execPath,['--input-type=module','-e',code],{env:process.env});child.on('close',()=>resolve());
   });
   await Promise.all([runDecision('worker-decision-0001'),runDecision('server-decision-0002')]);
   const winner=review.getReviewSession(concurrent.id).decision.idempotencyKey;
   expect(['worker-decision-0001','server-decision-0002']).toContain(winner);
   expect(JSON.parse(await readFile(join(dir,'private','review-sessions.json'),'utf8')).sessions.find((row:any)=>row.id===concurrent.id).decision.idempotencyKey).toBe(winner);
  } finally {
   if(old===undefined)delete process.env.MARKCUT_REVIEW_STORE;else process.env.MARKCUT_REVIEW_STORE=old;
   if(oldExport===undefined)delete process.env.MARKCUT_EXPORT_ROOT;else process.env.MARKCUT_EXPORT_ROOT=oldExport;
   await rm(dir,{recursive:true,force:true});
  }
 });
});
