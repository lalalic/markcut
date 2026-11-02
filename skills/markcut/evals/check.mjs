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
  approval: new Set(['none', 'human_only']),
  kind: new Set(['capability', 'edge', 'command'])
};
let failures = 0;
function check(ok, label) { if (!ok) { console.error(`FAIL ${label}`); failures++; } }
const ids = new Set();
for (const item of cases) {
  check(typeof item.id === 'string' && !ids.has(item.id), `unique id ${item.id}`);
  ids.add(item.id);
  check(typeof item.request === 'string' && item.request.length > 8, `${item.id} has user request`);
  check(allowed.kind.has(item.kind), `${item.id} kind`);
  for (const key of ['action', 'authority', 'approval']) check(allowed[key].has(item[key]), `${item.id} ${key}`);
  check(typeof item.playback === 'boolean', `${item.id} playback`);
  if (item.accepted_actions) {
    check(Array.isArray(item.accepted_actions) && item.accepted_actions.length > 0 && item.accepted_actions.includes(item.action) && item.accepted_actions.every(a => allowed.action.has(a)), `${item.id} allowed alternatives`);
  }
}
const skill = readFileSync(resolve(root, 'SKILL.md'), 'utf8');
check(skill.startsWith('---\nname: markcut\n'), 'skill metadata');
check(/\ndescription: \S/.test(skill), 'skill description');
check(!/deepseek/i.test(skill), 'provider-specific vision implementation does not belong in public skill');
check(cases.length >= 12, 'minimum behavioral decision cases');
const markdown = ['SKILL.md', 'review.md', 'references/preview-troubleshooting.md', 'references/mcp-preview-lifecycle.md'];
for (const relative of markdown) {
  const file = resolve(root, relative);
  const content = readFileSync(file, 'utf8');
  const re = /\]\(([^)]+\.md)\)/g;
  for (const match of content.matchAll(re)) {
    const target = resolve(dirname(file), match[1]);
    check(existsSync(target), `reference ${basename(file)} -> ${match[1]}`);
  }
}
if (process.argv[2] === '--validate') {
  console.log(`Validated ${cases.length} behavioral eval definitions and Markdown references; ${failures} failure(s).`);
} else {
  const file = process.argv[2];
  if (!file) { console.error('Usage: node check.mjs --validate | responses.json'); process.exit(2); }
  const responses = JSON.parse(readFileSync(resolve(file), 'utf8'));
  check(Array.isArray(responses), 'responses array');
  const byId = new Map(responses.map(r => [r.id, r]));
  check(byId.size === responses.length, 'duplicate response ids');
  for (const item of cases) {
    const output = byId.get(item.id);
    check(Boolean(output), `${item.id} has response`);
    if (!output) continue;
    for (const key of ['action', 'authority', 'playback', 'approval']) {
      const options = key === 'action' && item.accepted_actions ? item.accepted_actions : [item[key]];
      check(options.includes(output[key]), `${item.id}.${key}: expected one of ${options.join(', ')}, got ${output[key]}`);
    }
    check(typeof output.reason === 'string' && output.reason.trim().length > 12, `${item.id} has explanation`);
  }
  check(responses.length === cases.length, 'response count');
  console.log(`Scored ${cases.length} cases; ${failures} failed assertions. Review free-text reasoning manually for factual correctness.`);
}
process.exit(failures ? 1 : 0);
