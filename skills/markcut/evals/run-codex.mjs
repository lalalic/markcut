#!/usr/bin/env node
/** Behavioral eval runner for Codex with an existing locally authenticated provider. */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { outputSchema, parseOutput } from './output-format.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const cases = JSON.parse(readFileSync(join(here, 'cases.json'), 'utf8'));
const args = process.argv.slice(2);
let model = 'openrouter/free', provider = 'openrouter', batchSize = 1;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--model' && args[i + 1]) model = args[++i];
  else if (args[i] === '--provider' && args[i + 1]) provider = args[++i];
  else if (args[i] === '--batch-size' && args[i + 1]) batchSize = Number(args[++i]);
  else { console.error(`Unsupported option ${args[i]}. Usage: node run-codex.mjs [--provider openrouter] [--model openrouter/free] [--batch-size 1]`); process.exit(2); }
}
if (!/^[a-z][a-z0-9_-]*$/.test(provider) || !/^[\w./:-]+$/.test(model) || !Number.isInteger(batchSize) || batchSize < 1 || batchSize > cases.length) {
  console.error('Invalid provider, model, or batch size'); process.exit(2);
}
const output = mkdtempSync(join(tmpdir(), 'markcut-skill-codex-eval-'));
const skill = readFileSync(join(root, 'SKILL.md'), 'utf8');
const decisions = [];
const run = {model, provider, batchSize, evidenceDir: output, batches: [], strictJsonFormat: true};
const promptIntro = `You are an agent using a Markcut Skill for a capability-decision test. This is a dry run. DO NOT execute tools, edit files, create videos or assert that tasks were completed. Use ONLY the Skill below as the behavioral contract.\n\nFor EACH independent user request, return one decision.\n\nFields:\n- id: exact request ID.\n- action: the IMMEDIATE next action, one of vision, author, storyboard, native_preview, mcp_review, render, verify, repair, report. After changes_requested, edit video.md BEFORE verifying; do not infer the edit happened. If asked a yes/no question, answer via report without executing anything.\n- authority: source_media (observations and physical assets), selected_video_template (creative/style defaults for new video), or video_md (current video source/edit/review revision/render).\n- completion_gates: zero or more checks needed BEFORE CLAIMING the user's entire requested goal complete: verify, real_playback, human_review. Gates are NOT the immediate next action. For a playable or moving-map result, real_playback matters; for explicit human review/approval, a real human must review the CURRENT revision. Do not require human_review for an ordinary MP4 render. For a factual answer about a setting, no playback is required.\n- reason: a short explanation of the action and important boundary.\n\nReturn ONLY a JSON object with one decisions array containing the decisions above (no Markdown fences or text outside JSON), matching the provided output schema.\n\nMARKCUT SKILL:\n${skill}\n\nUSER REQUESTS:\n`;

console.log(`Target: codex/${provider}/${model}; artifacts: ${output}; cases=${cases.length}; batch-size=${batchSize}`);
for (let offset = 0; offset < cases.length; offset += batchSize) {
  const selected = cases.slice(offset, offset+batchSize);
  const batchDir = join(output, `batch-${String(1+offset/batchSize).padStart(2,'0')}`);
  mkdirSync(batchDir);
  const prompt = promptIntro + JSON.stringify(selected.map(({id,request})=>({id,request})), null, 2) + '\n';
  const schemaFile = join(batchDir,'schema.json');
  const responseFile = join(batchDir,'raw-response.txt');
  writeFileSync(join(batchDir,'prompt.txt'),prompt);
  writeFileSync(schemaFile,JSON.stringify(outputSchema(),null,2));
  const cmd=['exec','--ephemeral','--skip-git-repo-check','--ignore-rules','-s','read-only','-C',batchDir,
    '-c',`model_provider="${provider}"`,'-m',model,'-c','model_reasoning_effort="low"',
    '--json','--output-schema',schemaFile,'--output-last-message',responseFile,'-'];
  const result=spawnSync('codex',cmd,{cwd:batchDir,input:prompt,encoding:'utf8',timeout:150_000,maxBuffer:12_000_000});
  writeFileSync(join(batchDir,'codex-events.jsonl'),result.stdout??'');
  writeFileSync(join(batchDir,'codex-stderr.txt'),result.stderr??'');
  const meta={index:1+offset/batchSize,cases:selected.map(c=>c.id),exitCode:result.status,error:result.error?.message??null,
    modelMetadataWarning:(result.stdout??'').includes('Model metadata for'),strictJsonFormat:true};
  run.batches.push(meta);
  writeFileSync(join(output,'run.json'),JSON.stringify(run,null,2));
  if (result.status!==0) {console.error(`FAIL Codex batch ${meta.index} exit=${result.status} ${result.error?.message??(result.stderr??'').slice(-450)}`);process.exit(1);}
  const raw = readFileSync(responseFile, 'utf8');
  let response;
  try {
    const parsed = parseOutput(raw, selected.map(c => c.id));
    response = parsed.decisions;
    meta.schemaCompliant = parsed.schemaCompliant;
    if (!parsed.schemaCompliant) {meta.strictJsonFormat = false; run.strictJsonFormat = false;}
  } catch (error) {
    meta.schemaCompliant = false;
    writeFileSync(join(output,'run.json'),JSON.stringify(run,null,2));
    console.error(`FAIL batch ${meta.index}: ${error.message}`);
    process.exit(1);
  }
  writeFileSync(join(batchDir,'normalized-responses.json'),JSON.stringify(response,null,2)+'\n');
  writeFileSync(join(output,'run.json'),JSON.stringify(run,null,2));
  decisions.push(...response);
  console.log(`Batch ${meta.index}: ${response.length} decisions; strict JSON: ${meta.strictJsonFormat?'yes':'NO (legacy envelope)'}`);
}
const combined=join(output,'responses.json');
writeFileSync(combined,JSON.stringify(decisions,null,2)+'\n');
const scoring=spawnSync(process.execPath,[join(here,'check.mjs'),combined],{encoding:'utf8',maxBuffer:4_000_000});
writeFileSync(join(output,'score.txt'),(scoring.stdout??'')+(scoring.stderr??''));
process.stdout.write(scoring.stdout??'');
process.stderr.write(scoring.stderr??'');
if (!run.strictJsonFormat) console.log('FORMAT WARNING: at least one batch did not follow the output schema; original response preserved.');
if (run.batches.some(b=>b.modelMetadataWarning)) console.log('Codex warning: missing model metadata; fallback metadata was used.');
process.exit(scoring.status??1);
