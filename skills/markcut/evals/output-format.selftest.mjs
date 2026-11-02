import test from 'node:test';
import assert from 'node:assert/strict';
import {outputSchema, parseOutput} from './output-format.mjs';

const decision = {id:'cli-verify', action:'report', authority:'video_md', completion_gates:[], reason:'Use markcut verify video.md to check paths.'};
test('OpenAI output schema has root object and required decisions', () => {
  const s = outputSchema();
  assert.equal(s.type, 'object');
  assert.deepEqual(s.required, ['decisions']);
  assert.equal(s.properties.decisions.type, 'array');
  assert.equal(s.additionalProperties, false);
  assert.deepEqual(s.properties.decisions.items.required, ['id','action','authority','completion_gates','reason']);
});
test('round-trip strict OpenAI envelope preserves every decision', () => {
  const data = parseOutput(JSON.stringify({decisions:[decision]}), ['cli-verify']);
  assert.equal(data.schemaCompliant,true);
  assert.deepEqual(data.decisions,[decision]);
});
test('legacy array is accepted but flagged as noncompliant', () => {
  const data = parseOutput(JSON.stringify([decision]), ['cli-verify']);
  assert.equal(data.schemaCompliant,false);
  assert.deepEqual(data.decisions,[decision]);
});
test('singleton legacy object is accepted only for one matching ID', () => {
  const data=parseOutput(JSON.stringify(decision),['cli-verify']);
  assert.equal(data.schemaCompliant,false);
  assert.deepEqual(data.decisions,[decision]);
  assert.throws(()=>parseOutput(JSON.stringify(decision),['another-id']),/valid decisions array/);
});
test('single fenced JSON is accepted without silently hiding envelope failure', () => {
  const data=parseOutput('```json\n' + JSON.stringify({decisions:[decision]}) + '\n```',['cli-verify']);
  assert.equal(data.schemaCompliant,false);
});
test('reject incomplete batches, bad identifiers and malformed data',()=>{
  assert.throws(()=>parseOutput(JSON.stringify({decisions:[]}),['cli-verify']),/count or case identifiers/);
  assert.throws(()=>parseOutput(JSON.stringify({decisions:[decision]}),['other-id']),/count or case identifiers/);
  assert.throws(()=>parseOutput('not JSON', ['cli-verify']),/neither JSON nor/);
});
