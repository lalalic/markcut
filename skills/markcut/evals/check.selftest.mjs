import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const cases = JSON.parse(readFileSync(join(root, 'cases.json'), 'utf8'));
const dir = mkdtempSync(join(tmpdir(), 'markcut-eval-check-'));
function score(responses) {
  const file = join(dir, 'responses.json');
  writeFileSync(file, JSON.stringify(responses));
  return spawnSync(process.execPath, [join(root, 'check.mjs'), file], {encoding: 'utf8'});
}
const good = cases.map(c => ({id: c.id, action: c.action, authority:c.authority,
  completion_gates: [...c.required_gates], reason: c.id === 'cli-verify' ? 'Use npx @lalalic/markcut verify video.md to check Markdown paths.' : 'Correct next action and required completion checks are recorded.'}));
test('checker scores valid capability decisions', () => {
  const outcome = score(good);
  assert.equal(outcome.status, 0, outcome.stderr);
  assert.match(outcome.stdout, new RegExp(`${cases.length}/${cases.length} passed`));
});
test('checker catches wrong immediate action and missing human approval boundary', () => {
  const wrong = structuredClone(good);
  const edit = wrong.find(c => c.id === 'edit-review');
  edit.action = 'verify';
  edit.completion_gates = [];
  const outcome = score(wrong);
  assert.notEqual(outcome.status, 0);
  assert.match(outcome.stderr, /edit-review\.action/);
  assert.match(outcome.stderr, /edit-review missing completion gate: human_review/);
});
test('checker rejects a fabricated human-review requirement for a render-only request', () => {
  const wrong = structuredClone(good);
  wrong.find(c => c.id === 'render-final').completion_gates.push('human_review');
  const outcome = score(wrong);
  assert.notEqual(outcome.status, 0);
  assert.match(outcome.stderr, /render-final incorrect completion gate: human_review/);
});
test('CLI answer needs the correct command but no executed verify gate', () => {
  const answers = structuredClone(good);
  const cli = answers.find(c => c.id === 'cli-verify');
  assert.deepEqual(cli.completion_gates, []);
  assert.equal(score(answers).status, 0);
  cli.reason = 'Use a generic video validator command, no specific command was identified.';
  const outcome = score(answers);
  assert.notEqual(outcome.status, 0);
  assert.match(outcome.stderr, /cli-verify explanation names markcut verify/);
});
test('checker rejects invalid JSON rather than repairing it silently', () => {
  const file = join(dir, 'invalid.json');
  writeFileSync(file, '[{"id":"media-folder"}}}');
  const outcome = spawnSync(process.execPath, [join(root, 'check.mjs'), file], {encoding:'utf8'});
  assert.notEqual(outcome.status, 0);
  assert.match(outcome.stderr, /not valid JSON/);
});
process.on('exit', () => rmSync(dir, {force:true, recursive:true}));
