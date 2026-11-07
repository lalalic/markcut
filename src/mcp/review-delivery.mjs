// Provider-side validation: the UI cannot invent an event destination or a Relay terminal event.
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const SOURCE = /^job\/[A-Za-z0-9_-]+\/task\/[A-Za-z0-9_-]+\/execution\/[A-Za-z0-9_-]+$/;
const RECORD = value => value && typeof value === "object" && !Array.isArray(value);
const INTERACTIVE_TYPE = "task.interactive_decision";
const REVIEW_FIELDS = ["decision","feedback","comments","revision","revisionId","contentHash","commitSha","previewId","requestId","idempotencyKey"];
function copyData(value) {
  if (!RECORD(value)) throw new Error("eventTemplate.data must be an object");
  // No executable values or reserved overrides can be shipped in a template.
  const encoded=JSON.stringify(value);
  if (!encoded || encoded.length > 12000) throw new Error("Invalid eventTemplate.data");
  const clean=JSON.parse(encoded);
  const walk=(node)=>{
    if (!node || typeof node !== "object") return;
    for (const [key, val] of Object.entries(node)) {
      if (["__proto__", "constructor", "prototype"].includes(key)) throw new Error("Unsafe eventTemplate data");
      walk(val);
    }
  };
  walk(clean);
  return clean;
}
export function normalizeReviewConfig(value) {
  if (value === undefined) return {delivery:"text"};
  if (!RECORD(value) || !["text","event"].includes(value.delivery ?? "text")) throw new Error("Unsupported review delivery");
  if (value.delivery !== "event") {
    if (value.eventTemplate !== undefined) throw new Error("eventTemplate requires event delivery");
    return {delivery:"text"};
  }
  const template=value.eventTemplate;
  if (!RECORD(template) || template.type!==INTERACTIVE_TYPE
      || typeof template.source!=="string" || !SOURCE.test(template.source)
      || !RECORD(template.data)) throw new Error("Invalid review event template");
  if (Object.keys(template).some(key=>!["type","source","data"].includes(key))) throw new Error("Unexpected eventTemplate fields");
  const data=copyData(template.data);
  const match=template.source.match(/^job\/([^/]+)\/task\/([^/]+)\/execution\/([^/]+)$/);
  const interactive=data.interactive;
  if (!match || !RECORD(interactive) || interactive.jobId!==match[1] ||
      interactive.taskId!==match[2] || interactive.executionId!==match[3] ||
      !ID.test(interactive.invocationId||"") ||
      REVIEW_FIELDS.some(field=>Object.hasOwn(interactive,field)))
    throw new Error("Invalid task.interactive_decision event template");
  if (!/^[a-f0-9]{40}$/.test(value.commitSha||"")) throw new Error("Event review requires full Git Commit SHA");
  return {delivery:"event",commitSha:value.commitSha,eventTemplate:{
    type:template.type,source:template.source,data,
  }};
}
export function eventForReview(config,review) {
  const {eventTemplate:template}=normalizeReviewConfig(config);
  if (!template) throw new Error("Event mode required");
  if (!RECORD(review) || !ID.test(review.requestId || "") || !/^[a-f0-9]{40}$/.test(review.commitSha || "")
      || !["approved","changes_requested"].includes(review.decision)
      || !ID.test(review.idempotencyKey || "") || !Array.isArray(review.comments))
    throw new Error("Invalid review result");
  if (review.commitSha !== config.commitSha)throw new Error("Review Commit SHA differs from immutable preview request");
  const details=template.data.interactive;
  const feedback=typeof review.feedback==="string" ? review.feedback :
    review.comments.map(comment=>comment.text).filter(value=>typeof value==="string").join("\n");
  return {type:INTERACTIVE_TYPE,source:template.source,data:{
    ...template.data,
    interactive:{...details,
      revision:review.commitSha,commitSha:review.commitSha,
      previewId:review.previewId,requestId:review.requestId,
      decision:review.decision,feedback,comments:structuredClone(review.comments),
      idempotencyKey:review.idempotencyKey},
  }};
}
