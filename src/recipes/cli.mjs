#!/usr/bin/env node
import {filterRecipes,getRecipe,loadRecipeCatalog,readRecipeDetail} from './catalog.mjs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const HELP=`Usage: markcut recipes [list|show <recipe-id>] [options]

List Markcut-owned native recipes together with dynamically discovered video-shotcraft
Skill cards. Shotcraft cards are reference motions, not automatically executable
Markcut nodes. No Shotcraft source files are copied into Markcut.

Options:
  --json                 Machine-readable JSON (includes provenance)
  --source markcut|shotcraft
  --category <category>  e.g. map, camera, transition, typography
  --search <query>       Search recipe name, description and style variants
  --help                 Show usage

Examples:
  markcut recipes list --source markcut
  markcut recipes list --category map --json
  markcut recipes list --source shotcraft --category camera
  markcut recipes show markcut:map-route-journey
  markcut recipes show shotcraft:cursor-flyover

External skill override: MARKCUT_SHOTCRAFT_SKILL_DIR=/absolute/path/to/video-shotcraft
`;

function parse(argv) {
  const out={operation:'list',id:null,json:false,source:null,category:null,query:null};
  const args=[...argv];
  if(args[0]&&!args[0].startsWith('-'))out.operation=args.shift();
  if(out.operation!=='list'&&out.operation!=='show'&&out.operation!=='help')throw new Error(`Unknown recipe action: ${out.operation}`);
  if(out.operation==='show'){
    out.id=args.shift();
    if(!out.id||out.id.startsWith('-'))throw new Error('recipes show needs a recipe name');
  }
  while(args.length){
    const flag=args.shift();
    if(flag==='--json'){out.json=true;continue;}
    if(flag==='--help'||flag==='-h'){out.operation='help';continue;}
    if(['--source','--category','--search'].includes(flag)){
      const value=args.shift();
      if(!value||value.startsWith('--'))throw new Error(`${flag} needs a value`);
      out[{'--source':'source','--category':'category','--search':'query'}[flag]]=value;
      continue;
    }
    throw new Error(`Unknown recipes option: ${flag}`);
  }
  if(out.source&&!['markcut','shotcraft'].includes(out.source))throw new Error('--source must be markcut or shotcraft');
  return out;
}

export function main(argv=process.argv.slice(2),{write=console.log,error=console.error}={}) {
  let options;
  try{options=parse(argv);}catch(e){error(e.message);error(HELP);return 2;}
  if(options.operation==='help'){write(HELP);return 0;}
  let catalog;
  try{catalog=loadRecipeCatalog();}catch(e){error('Could not read recipes: '+e.message);return 1;}
  if(options.operation==='show'){
    let recipe;
    try{recipe=getRecipe(catalog,options.id);}catch(e){error(e.message);return 2;}
    if(!recipe){error(`Unknown recipe: ${options.id}`);return 2;}
    const result=readRecipeDetail(recipe);
    if(options.json){write(JSON.stringify(result,null,2));return 0;}
    write(`${result.id} · ${result.title}\nSource: ${result.source} · ${result.category} · ${result.implementation}\nDuration: ${result.duration}\n${result.description}\nUse: ${result.use}`);
    if(result.snippet)write(`\nMarkcut Markdown scene (replace example coordinates):\n${result.snippet}`);
    if(result.parameters)write(`\nEditable parameters: ${result.parameters.join(', ')}`);
    if(result.notes?.length)write(`\nNotes:\n${result.notes.map(x=>'- '+x).join('\n')}`);
    if(result.styles?.length)write(`\nShotcraft styles: ${result.styles.map(s=>s.key).join(', ')}`);
    if(result.guide)write(`\nSource card (read-only reference):\n${result.guide}`);
    else if(result.source==='shotcraft')write('\nSource card unavailable at the installed Skill path.');
    return 0;
  }
  const selected=filterRecipes(catalog,options);
  if(options.json){write(JSON.stringify({recipes:selected, count:selected.length, sources:catalog.sources},null,2));return 0;}
  write(`Recipes (${selected.length}) — Markcut native: ${catalog.sources.markcut.count}; video-shotcraft reference: ${catalog.sources.shotcraft.count}`);
  if(catalog.sources.shotcraft.status==='not-installed')write('video-shotcraft Skill not installed (optional); set MARKCUT_SHOTCRAFT_SKILL_DIR to its root.');
  if(catalog.sources.shotcraft.status==='unavailable')write(`video-shotcraft catalog unavailable (${catalog.sources.shotcraft.error}); Markcut recipes remain usable.`);
  for(const recipe of selected){
    const kind=recipe.executable?'native':'reference';
    write(`${recipe.id.padEnd(43)} ${recipe.category.padEnd(13)} ${kind.padEnd(9)} ${recipe.duration}`);
  }
  return 0;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))process.exitCode=main();
