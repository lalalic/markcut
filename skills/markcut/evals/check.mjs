#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const cases = JSON.parse(readFileSync(resolve(here, 'cases.json'), 'utf8'));
const allowed = {
  action: new Set(['vision', 'author', 'storyboard', 'native_preview', 'mcp_review', 'render', 'verify', 'repair', 'report']),
  authority: new Set(['source_media', 'selected_video_template', 'video_md']),
  gate: new Set(['verify', 'real_playback', 'human_review']),
  kind: new Set(['capability', 'edge', 'command']),
};
let failures = 0;
let passedCases = 0;
function check(ok, label) {
  if (!ok) { console.error(`FAIL ${label}`); failures++; }
  return ok;
}
const ids = new Set();
for (const item of cases) {
  check(typeof item.id === 'string' && !ids.has(item.id), `unique id ${item.id}`);
  ids.add(item.id);
  check(typeof item.request === 'string' && item.request.length > 8, `${item.id} user request`);
  check(allowed.kind.has(item.kind), `${item.id} kind`);
  for (const key of ['action', 'authority']) check(allowed[key].has(item[key]), `${item.id} ${key}`);
  for (const key of ['accepted_actions', 'accepted_authorities']) {
    if (!item[key]) continue;
    const pool = key === 'accepted_actions' ? allowed.action : allowed.authority;
    const baseline = key === 'accepted_actions' ? item.action : item.authority;
    check(Array.isArray(item[key]) && item[key].includes(baseline) && item[key].every(v => pool.has(v)), `${item.id} ${key}`);
  }
  const required = item.required_gates, forbidden = item.forbidden_gates;
  check(Array.isArray(required) && required.every(v => allowed.gate.has(v)) && new Set(required).size === required.length, `${item.id} required_gates`);
  check(Array.isArray(forbidden) && forbidden.every(v => allowed.gate.has(v)) && new Set(forbidden).size === forbidden.length, `${item.id} forbidden_gates`);
  check(required.every(v => !forbidden.includes(v)), `${item.id} gates do not contradict`);
  if (item.reason_includes !== undefined) check(typeof item.reason_includes === 'string' && item.reason_includes.length > 2, `${item.id} required rationale text`);
}
const skill = readFileSync(resolve(root, 'SKILL.md'), 'utf8');
check(skill.startsWith('---\nname: markcut\n'), 'skill metadata');
check(/\ndescription: \S/.test(skill), 'skill description');
check(!/deepseek/i.test(skill), 'provider-specific vision does not belong in public Skill');
check(cases.length >= 12, 'minimum capability scenarios');
for (const relative of ['SKILL.md', 'review.md', 'references/preview-troubleshooting.md', 'references/mcp-preview-lifecycle.md']) {
  const file = resolve(root, relative);
  const content = readFileSync(file, 'utf8');
  for (const match of content.matchAll(/\]\(([^)]+\.md)\)/g)) {
    check(existsSync(resolve(dirname(file), match[1])), `reference ${basename(file)} -> ${match[1]}`);
  }
}
if (process.argv[2] === '--validate') {
  console.log(`Validated ${cases.length} eval definitions and Markdown references; ${failures} failure(s).`);
} else {
  if (!process.argv[2]) { console.error('Usage: node check.mjs --validate | responses.json'); process.exit(2); }
  let responses;
  try { responses = JSON.parse(readFileSync(resolve(process.argv[2]), 'utf8')); }
  catch (e) { console.error(`FAIL model response is not valid JSON: ${e.message}`); process.exit(1); }
  if (!check(Array.isArray(responses), 'responses is an array')) process.exit(1);
  const byId = new Map(responses.map(r => [r?.id, r]));
  check(byId.size === responses.length, 'no duplicate response ids');
  check(responses.length === cases.length, 'expected response count');
  for (const item of cases) {
    const output = byId.get(item.id);
    if (!check(Boolean(output), `${item.id} response exists`)) continue;
    const before = failures;
    for (const key of ['action', 'authority']) {
      const options = (key === 'action' ? item.accepted_actions : item.accepted_authorities) ?? [item[key]];
      check(options.includes(output[key]), `${item.id}.${key}: expected ${options.join(' / ')}, got ${output[key]}`);
    }
    const gates = output.completion_gates;
    if (check(Array.isArray(gates) && gates.every(v => allowed.gate.has(v)) && new Set(gates).size === gates.length, `${item.id}.completion_gates valid`)) {
      for (const required of item.required_gates) check(gates.includes(required), `${item.id} missing completion gate: ${required}`);
      for (const forbidden of item.forbidden_gates) check(!gates.includes(forbidden), `${item.id} incorrect completion gate: ${forbidden}`);
    }
    check(typeof output.reason === 'string' && output.reason.trim().length > 12, `${item.id} explanation`);
    if (item.reason_includes) check(typeof output.reason === 'string' && output.reason.toLowerCase().includes(item.reason_includes.toLowerCase()), `${item.id} explanation names ${item.reason_includes}`);
    if (failures === before) passedCases++;
  }
  console.log(`Scored ${cases.length} cases: ${passedCases}/${cases.length} passed; ${failures} failed assertions. Manually inspect reason text for misleading claims.`);
}
process.exit(failures ? 1 : 0);
