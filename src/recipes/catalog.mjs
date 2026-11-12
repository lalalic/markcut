/**
 * Read-only recipe catalog. Markcut owns executable recipes under recipes/markcut.
 * Video Shotcraft owns its gallery and shot card documents; we read the installed
 * Skill in place without copying it into Markcut or treating its demos as native DSL.
 */
import {existsSync, readFileSync, readdirSync, realpathSync} from 'node:fs';
import {homedir} from 'node:os';
import {isAbsolute, join, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const MARKCUT_RECIPE_DIR = fileURLToPath(new URL('../../recipes/markcut/',import.meta.url));
const SHOTCRAFT_LIBRARY = join('gallery','api','library.json');
const RECIPE_NAME = /^[a-z0-9][a-z0-9-]{1,90}$/;

function within(root, path) {
  const rel=relative(root,path);
  return rel === '' || (rel !== '..' && !rel.startsWith('..'+sep) && !isAbsolute(rel));
}

/** Find the external Skill without requiring Neo or silently installing anything. */
export function findShotcraftSkillRoot({env=process.env,home=homedir()}={}) {
  const explicit=env.MARKCUT_SHOTCRAFT_SKILL_DIR || env.VIDEO_SHOTCRAFT_ROOT;
  const candidates=explicit?[explicit]:[
    join(home,'.agents','skills','video-shotcraft'),
    join(home,'.codex','skills','video-shotcraft'),
    join(home,'.claude','skills','video-shotcraft'),
  ];
  return candidates.map(path=>resolve(path)).find(path=>existsSync(join(path,SHOTCRAFT_LIBRARY)))||null;
}

function markcutRecipes(dir) {
  if(!existsSync(dir))throw new Error(`Markcut recipes directory missing: ${dir}`);
  return readdirSync(dir).filter(x=>x.endsWith('.json')).sort().map(filename=>{
    const file=resolve(dir,filename);
    const item=JSON.parse(readFileSync(file,'utf8'));
    if(!RECIPE_NAME.test(item.name)||filename!==item.name+'.json' || !item.title ||
      !item.description || !item.category || !item.snippet || !Array.isArray(item.parameters) ||
      (item.category==='map' && !item.view)) {
      throw new Error(`Invalid Markcut recipe: ${file}`);
    }
    return {
      id:`markcut:${item.name}`, name:item.name, title:item.title,source:'markcut',
      category:item.category,description:item.description,use:item.use,
      duration:item.duration, durationSeconds:item.durationSeconds,
      implementation:'native-markcut', executable:true,
      view:item.view,parameters:item.parameters,snippet:item.snippet,notes:item.notes||[],
      sourceFile:file,
    };
  });
}

function shotcraftRecipes(root) {
  if(!root)return [];
  const library=JSON.parse(readFileSync(join(root,SHOTCRAFT_LIBRARY),'utf8'));
  const trustedRoot=realpathSync(root);
  if(!Array.isArray(library.cards))throw new Error(`Invalid Shotcraft card library at ${root}`);
  return library.cards.filter(card=>card && RECIPE_NAME.test(card.name)).map(card=>{
    const sourceFile=typeof card.source==='string'?resolve(root,card.source):null;
    // Never follow user-supplied gallery source references outside the Skill.
    const safeFile=sourceFile&&within(root,sourceFile)&&existsSync(sourceFile)&&
      within(trustedRoot,realpathSync(sourceFile))?sourceFile:null;
    return {
      id:`shotcraft:${card.name}`,name:card.name,title:card.name,source:'shotcraft',
      category:card.category||'uncategorized',description:card.summary||'',use:card.use||'',
      duration:card.duration||'',implementation:'reference-shot-card',executable:false,
      styles:(card.styles||[]).filter(s=>s&&typeof s.key==='string').map(s=>({key:s.key,label:s.label||s.key})),
      sourceFile:safeFile,
    };
  });
}

export function loadRecipeCatalog({markcutDir=MARKCUT_RECIPE_DIR,shotcraftRoot=undefined}={}) {
  const own=markcutRecipes(resolve(markcutDir));
  const skillRoot=shotcraftRoot===undefined?findShotcraftSkillRoot():shotcraftRoot;
  // A broken optional third-party Skill must not hide Markcut's own recipes.
  let shotcraft=[], shotcraftStatus=skillRoot?'ready':'not-installed', shotcraftError=null;
  if(skillRoot){
    try{shotcraft=shotcraftRecipes(skillRoot);}
    catch(e){shotcraftStatus='unavailable';shotcraftError=String(e.message||e);}
  }
  const recipes=[...own,...shotcraft].sort((a,b)=>a.id.localeCompare(b.id,'en'));
  const seen=new Set();
  for(const item of recipes){if(seen.has(item.id))throw new Error(`Duplicate recipe: ${item.id}`);seen.add(item.id);}
  return {
    recipes,
    sources:{
      markcut:{count:own.length,location:resolve(markcutDir),status:'ready'},
      shotcraft:{count:shotcraft.length,location:skillRoot||null,status:shotcraftStatus,...(shotcraftError?{error:shotcraftError}:{})},
    },
  };
}

export function filterRecipes(catalog,{source,category,query}={}) {
  const lower=(query||'').trim().toLocaleLowerCase();
  return catalog.recipes.filter(r=>
    (!source||r.source===source)&&(!category||r.category===category)&&
    (!lower||[r.id,r.title,r.description,r.use,r.category,r.view,...(r.styles||[]).map(s=>s.key)]
      .filter(Boolean).some(v=>String(v).toLocaleLowerCase().includes(lower)))
  );
}

/** Explicit source prefix avoids name collisions between independent libraries. */
export function getRecipe(catalog,id) {
  const found=catalog.recipes.filter(r=>r.id===id || r.name===id);
  if(found.length>1)throw new Error(`Ambiguous recipe '${id}'; use markcut: or shotcraft: prefix.`);
  return found[0]||null;
}

export function readRecipeDetail(recipe) {
  if(!recipe)throw new Error('Recipe not found');
  const guide=recipe.source==='shotcraft'&&recipe.sourceFile
    ?readFileSync(recipe.sourceFile,'utf8')
    :null;
  return {...recipe,...(guide?{guide}:{})};
}
