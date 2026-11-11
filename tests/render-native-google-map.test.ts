import {describe,it,expect} from 'vitest';
import {nativeMapMissingKey,googleMapErrorLine} from '../src/render/google-map-health.mjs';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

describe('Google Maps native rendering safeguards',()=>{
 it('detects unkeyed native maps at any depth but not schematic maps',()=>{
  const root={type:'root',children:[{type:'scene',children:[{type:'map',view:'streetview',mapType:'roadmap'}]}]};
  expect(nativeMapMissingKey(root,'')).toBe(true);
  expect(nativeMapMissingKey(root,'enabled')).toBe(false);
  expect(nativeMapMissingKey({...root,children:[{type:'scene',children:[{type:'map',view:'route',mapType:'schematic'}]}]},'')).toBe(false);
 });
 it('recognizes fatal Maps JS and Routes errors, not benign warnings',()=>{
  for(const line of [
    '[console.error] Google Maps JavaScript API error: ApiProjectMapError',
    'MapsRequestError: ROUTES_COMPUTE_ROUTES: PERMISSION_DENIED: denied',
    'Google Maps JavaScript API error: BillingNotEnabledMapError',
  ]) expect(googleMapErrorLine(line)).toBeTruthy();
  expect(googleMapErrorLine('Google Maps JavaScript API warning: NoApiKeys')).toBe('');
 });
 it('fails before rendering and producing a false success MP4 without Google key',()=>{
  const dir=mkdtempSync(join(tmpdir(),'markcut-google-key-'));
  try{
   const md=join(dir,'video.md'),mp4=join(dir,'out.mp4');
   writeFileSync(md,'# video\nseed:1\nwidth:320 height:320 fps:10 layout:series\n\n## Map\nlayout:parallel\n- map view:overview mapType:roadmap center:{lat:45,lng:-75} duration:1\n');
   const result=spawnSync(process.execPath,[resolve('bin/markcut'),'render',md,'--output',mp4],{
     encoding:'utf8',cwd:process.cwd(),timeout:30000,env:{...process.env,GOOGLE_MAPS_API_KEY:''}
   });
   expect(result.status).not.toBe(0);
   expect(result.stderr+result.stdout).toMatch(/requires GOOGLE_MAPS_API_KEY/);
  }finally{rmSync(dir,{recursive:true,force:true});}
 });
 it('injects Maps key explicitly on Markdown CLI compile path',()=>{
  const text=readFileSync(resolve('src/render/cli.mjs'),'utf8');
  expect(text).toMatch(/compileDescriptiveRoot\(final,\s*\{googleMapsApiKey:process\.env\.GOOGLE_MAPS_API_KEY\}\)/);
 });
});
