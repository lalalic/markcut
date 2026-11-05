// Provider-side validation: the UI cannot invent an event destination or a Relay terminal event.
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const SOURCE = /^job\/[A-Za-z0-9_-]+\/task\/[A-Za-z0-9_-]+\/execution\/[A-Za-z0-9_-]+$/;
const RECORD = value => value && typeof value === "object" && !Array.isArray(value);
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
  if (Object.hasOwn(clean,"review")) throw new Error("data.review is reserved for the human result");
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
  if (!RECORD(template) || template.type!=="markcut.review.submitted"
      || typeof template.source!=="string" || !SOURCE.test(template.source)
      || !RECORD(template.data)) throw new Error("Invalid review event template");
  if (Object.keys(template).some(key=>!["type","source","data"].includes(key))) throw new Error("Unexpected eventTemplate fields");
  return {delivery:"event",eventTemplate:{
    type:template.type,source:template.source,data:copyData(template.data),
  }};
}
export function eventForReview(config,review) {
  const {eventTemplate:template}=normalizeReviewConfig(config);
  if (!template) throw new Error("Event mode required");
  if (!RECORD(review) || !ID.test(review.requestId || "") || !ID.test(review.revisionId || "")
      || !/^[a-f0-9]{64}$/.test(review.contentHash || "")
      || !["approved","changes_requested"].includes(review.decision)
      || !ID.test(review.idempotencyKey || "") || !Array.isArray(review.comments))
    throw new Error("Invalid review result");
  return {type:template.type,source:template.source,data:{...template.data,review:structuredClone(review)}};
}
