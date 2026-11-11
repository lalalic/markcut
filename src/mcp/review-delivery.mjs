// Generic event transport. The caller owns the event type, source and business data.
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const KEY = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/;
const RECORD = value => value && typeof value === 'object' && !Array.isArray(value);
const FORBIDDEN = new Set(['__proto__','constructor','prototype']);
const RESULT_FIELDS = ['previewId','requestId','decision','feedback','comments','idempotencyKey'];
function copyData(value) {
  if (!RECORD(value)) throw new Error('eventTemplate.data must be an object');
  const encoded=JSON.stringify(value);
  if (!encoded || encoded.length>12000) throw new Error('Invalid eventTemplate.data');
  const clean=JSON.parse(encoded);
  const walk=node=>{
    if(!node || typeof node!=='object')return;
    for(const [key,val] of Object.entries(node)){
      if(FORBIDDEN.has(key))throw new Error('Unsafe eventTemplate data');
      walk(val);
    }
  };
  walk(clean);return clean;
}
export function normalizeReviewConfig(value){
  if(value===undefined)return {delivery:'text'};
  if(!RECORD(value)||!['text','event'].includes(value.delivery??'text'))throw Error('Unsupported review delivery');
  if(value.delivery!=='event'){
    if(value.eventTemplate!==undefined)throw Error('eventTemplate requires event delivery');
    return {delivery:'text'};
  }
  const template=value.eventTemplate;
  if(!RECORD(template) || typeof template.type!=='string' || !/^[A-Za-z0-9_.:-]{1,128}$/.test(template.type) ||
     typeof template.source!=='string' || !template.source || template.source.length>512 || /[\r\n\x00-\x1f]/.test(template.source) ||
     !RECORD(template.data) || Object.keys(template).some(k=>!['type','source','data','responseKey'].includes(k)))
    throw Error('Invalid event template envelope');
  const responseKey=template.responseKey??'review';
  if(typeof responseKey!=='string'||!KEY.test(responseKey)||FORBIDDEN.has(responseKey))throw Error('Invalid responseKey');
  const data=copyData(template.data);
  if(data[responseKey]!==undefined && (!RECORD(data[responseKey])||RESULT_FIELDS.some(k=>Object.hasOwn(data[responseKey],k))))
    throw Error('Event response payload must be caller-owned metadata only');
  return {delivery:'event',eventTemplate:{type:template.type,source:template.source,data,responseKey}};
}
export function eventForReview(config,review){
  const {eventTemplate:template}=normalizeReviewConfig(config);
  if(!template)throw Error('Event mode required');
  if(!RECORD(review)||!ID.test(review.requestId||'')||!ID.test(review.idempotencyKey||'')||
     !['approved','changes_requested'].includes(review.decision)||!Array.isArray(review.comments))throw Error('Invalid review result');
  const feedback=typeof review.feedback==='string'?review.feedback:
    review.comments.map(c=>c.text).filter(x=>typeof x==='string').join('\n');
  const key=template.responseKey;
  return {type:template.type,source:template.source,data:{...template.data,
    [key]:{...(template.data[key]||{}),previewId:review.previewId,requestId:review.requestId,
      decision:review.decision,feedback,comments:structuredClone(review.comments),idempotencyKey:review.idempotencyKey}}};
}
