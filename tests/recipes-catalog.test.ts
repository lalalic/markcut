import {describe,it,expect} from 'vitest';
import {loadRecipeCatalog,findShotcraftSkillRoot,filterRecipes,getRecipe,readRecipeDetail} from '../src/recipes/catalog.mjs';
import {parseMarkdownDescriptive} from '../src/descriptive/markdown';
import {compileDescriptiveRoot} from '../src/descriptive/compiler';
import {mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const native=()=>loadRecipeCatalog({shotcraftRoot:null});
const cli=fileURLToPath(new URL('../bin/markcut',import.meta.url));

describe('Markcut-owned recipe catalog',()=>{
 it('has four independently addressable native Google map recipes',()=>{
  const recipes=native().recipes;
  expect(recipes.map(r=>r.id)).toEqual([
   'markcut:map-cinematic-follow','markcut:map-location-reveal',
   'markcut:map-route-journey','markcut:map-streetview-explore'
  ]);
  expect(recipes.map(r=>r.view).sort()).toEqual(['cinematic','overview','route','streetview']);
  expect(recipes.every(r=>r.executable&&r.source==='markcut'&&r.implementation==='native-markcut')).toBe(true);
 });
 it('compiles every native recipe snippet into the requested map view',()=>{
  for(const recipe of native().recipes){
   const doc=`# video\nwidth:540 height:960 fps:24\n\n${recipe.snippet}`;
   const root=compileDescriptiveRoot(parseMarkdownDescriptive(doc));
   const node=root.children[0]?.children?.[0] as any;
   expect(node?.type,recipe.id).toBe('map');
   expect(node?.view,recipe.id).toBe(recipe.view);
   expect(node?.durationInSeconds,recipe.id).toBe(recipe.durationSeconds);
  }
 });
 it('supports future non-map Markcut recipes without requiring a map view',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'markcut-other-recipe-'));
  try{
   const card={name:'chapter-title-reveal',title:'Chapter title',category:'typography',description:'A title',parameters:[],durationSeconds:2,snippet:'## Title\nlayout:parallel\n- component jsx:<div>Title</div> duration:2'};
   await writeFile(join(dir,'chapter-title-reveal.json'),JSON.stringify(card));
   const catalog=loadRecipeCatalog({markcutDir:dir,shotcraftRoot:null});
   expect(catalog.recipes[0]).toMatchObject({id:'markcut:chapter-title-reveal',category:'typography',executable:true});
  }finally{await rm(dir,{recursive:true,force:true});}
 });
 it('keeps source namespace even if external Shotcraft card shares a bare name',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'shotcraft-card-collision-'));
  try{
   await mkdir(join(dir,'gallery/api'),{recursive:true});
   await writeFile(join(dir,'gallery/api/library.json'),JSON.stringify({cards:[{name:'map-route-journey',summary:'Other implementation',source:'references/shots/map-route-journey.md',styles:[]}]}));
   const catalog=loadRecipeCatalog({shotcraftRoot:dir});
   expect(catalog.recipes.filter(x=>x.name==='map-route-journey')).toHaveLength(2);
   expect(getRecipe(catalog,'markcut:map-route-journey')?.source).toBe('markcut');
   expect(getRecipe(catalog,'shotcraft:map-route-journey')?.source).toBe('shotcraft');
   expect(()=>getRecipe(catalog,'map-route-journey')).toThrow(/Ambiguous/);
  }finally{await rm(dir,{recursive:true,force:true});}
 });
 it('runs offline with external Shotcraft skill missing',()=>{
  const catalog=loadRecipeCatalog({shotcraftRoot:null});
  expect(catalog.sources.shotcraft).toMatchObject({count:0,status:'not-installed'});
  expect(filterRecipes(catalog,{source:'shotcraft'})).toHaveLength(0);
  expect(filterRecipes(catalog,{category:'map'})).toHaveLength(4);
 });
});

describe('installed Shotcraft skill integration',()=>{
 it('discovers the Skill based on home or an explicit environment override',async()=>{
  const home=await mkdtemp(join(tmpdir(),'shotcraft-home-'));
  const skill=join(home,'.agents/skills/video-shotcraft');
  try {
   await mkdir(join(skill,'gallery/api'),{recursive:true});
   await writeFile(join(skill,'gallery/api/library.json'),'{"cards":[]}');
   expect(findShotcraftSkillRoot({home,env:{}})).toBe(skill);
   expect(findShotcraftSkillRoot({home,env:{MARKCUT_SHOTCRAFT_SKILL_DIR:join(home,'missing')}})).toBeNull();
  }finally{await rm(home,{recursive:true,force:true});}
 });
 it('reads external source cards and variants live, does not copy source or execute them',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'shotcraft-live-'));
  try{
   await mkdir(join(dir,'gallery/api'),{recursive:true});
   await mkdir(join(dir,'references/shots/camera'),{recursive:true});
   const card='---\nname: a-camera\n---\n\nTest live guidance';
   await writeFile(join(dir,'references/shots/camera/a-camera.md'),card);
   await writeFile(join(dir,'gallery/api/library.json'),JSON.stringify({cards:[
    {name:'a-camera',summary:'Travel across the view',use:'Show motion',category:'camera',duration:'3s',source:'references/shots/camera/a-camera.md',styles:[{key:'fly',label:'Fly'}]},
    {name:'bad-file',summary:'Unsafe',source:'../escape.md',styles:[]}
   ]}));
   const catalog=loadRecipeCatalog({shotcraftRoot:dir});
   const selected=filterRecipes(catalog,{source:'shotcraft',category:'camera',query:'fly'});
   expect(selected).toHaveLength(1);
   expect(selected[0]).toMatchObject({id:'shotcraft:a-camera',executable:false,implementation:'reference-shot-card',styles:[{key:'fly',label:'Fly'}]});
   expect(readRecipeDetail(selected[0]).guide).toBe(card);
   expect(getRecipe(catalog,'shotcraft:bad-file')?.sourceFile).toBeNull();
   await writeFile(join(dir,'references/shots/camera/a-camera.md'),'Updated on disk');
   expect(readRecipeDetail(selected[0]).guide).toBe('Updated on disk');
  }finally{await rm(dir,{recursive:true,force:true});}
 });
 it('keeps Markcut native recipes available when the installed Shotcraft JSON is invalid',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'shotcraft-corrupt-'));
  try{
   await mkdir(join(dir,'gallery/api'),{recursive:true});
   await writeFile(join(dir,'gallery/api/library.json'),'not-json');
   const catalog=loadRecipeCatalog({shotcraftRoot:dir});
   expect(catalog.sources.shotcraft.status).toBe('unavailable');
   expect(catalog.sources.markcut.count).toBe(4);
   expect(catalog.recipes).toHaveLength(4);
  }finally{await rm(dir,{recursive:true,force:true});}
 });
 it('rejects Shotcraft reference files that are symlinks outside the installed Skill',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'shotcraft-symlink-'));
  const outside=await mkdtemp(join(tmpdir(),'shotcraft-outside-'));
  try{
   await mkdir(join(dir,'gallery/api'),{recursive:true});
   await mkdir(join(dir,'references/shots/camera'),{recursive:true});
   await writeFile(join(outside,'sensitive.md'),'do not read');
   await symlink(join(outside,'sensitive.md'),join(dir,'references/shots/camera/escape.md'));
   await writeFile(join(dir,'gallery/api/library.json'),JSON.stringify({cards:[{name:'escape',source:'references/shots/camera/escape.md'}]}));
   const catalog=loadRecipeCatalog({shotcraftRoot:dir});
   expect(catalog.recipes.at(-1)?.sourceFile).toBeNull();
  }finally{await rm(dir,{recursive:true,force:true});await rm(outside,{recursive:true,force:true});}
 });
});

describe('user-facing recipes CLI',()=>{
 it('provides machine-readable unified catalog with provenance',()=>{
  const result=spawnSync(process.execPath,[cli,'recipes','list','--json'],{encoding:'utf8'});
  expect(result.status,result.stderr).toBe(0);
  const json=JSON.parse(result.stdout);
  expect(json.count).toBe(json.recipes.length);
  expect(json.sources.markcut.count).toBe(4);
  expect(json.recipes.some((r:any)=>r.id==='markcut:map-route-journey')).toBe(true);
 });
 it('provides a real native copyable scene and a readable external reference',()=>{
  const own=spawnSync(process.execPath,[cli,'recipes','show','markcut:map-route-journey'],{encoding:'utf8'});
  expect(own.status).toBe(0);
  expect(own.stdout).toContain('- map view:route');
  expect(own.stdout).toContain('routeAnimation:');
 });
 it('fails clearly for invalid options rather than silently ignoring them',()=>{
  const result=spawnSync(process.execPath,[cli,'recipes','list','--nonsense'],{encoding:'utf8'});
  expect(result.status).toBe(2);
  expect(result.stderr).toContain('Unknown recipes option');
 });
});
