#!/usr/bin/env node
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname,basename,join} from 'node:path';
import {loadEditorDecision,editorDecisionToMarkdown} from './index.mjs';
const [command,videoArg,...rest]=process.argv.slice(2);
if(command!=='edl'||!videoArg||!videoArg.endsWith('.md')){
 console.error('Usage: markcut edl <video.md> [--output <video.edl.md>]');
 process.exit(2);
}
const pos=rest.indexOf('--output');
if(pos>=0&&(!rest[pos+1]||rest.length!==2))throw Error('--output requires a file');
if(pos<0&&rest.length)throw Error('Unknown editor decision options: '+rest.join(' '));
const video=resolve(videoArg);
const source=readFileSync(video,'utf8');
const sidecar=loadEditorDecision(video,source);
if(!sidecar)throw Error('No Editor Decision sidecar found for '+videoArg);
const rendered=editorDecisionToMarkdown(video,sidecar.edl,source);
const output=pos>=0?resolve(rest[pos+1]):join(dirname(video),basename(video,'.md')+'.edl.md');
if(output===video||output===sidecar.path)throw Error('Editor Decision output must not overwrite source files');
writeFileSync(output,rendered,'utf8');
console.log(output);
