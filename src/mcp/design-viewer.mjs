// NeoY hosts the existing Markcut player as a standalone read-only document
// view. Browser split and session lifecycles belong to WebHelm, not Markcut.
import {readFileSync,writeFileSync,mkdirSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {EXPORT_ROOT,publicOrigin,resolveMountedFile} from './remote-assets.mjs';
import {buildPreviewHtml} from './preview.mjs';

export function designViewerUrl(path,origin=publicOrigin(),mount=resolveMountedFile){
  const mounted=mount(path,origin);
  if(!mounted)return null;
  const url=new URL(mounted);
  if(url.origin!==origin || url.search || url.hash ||
     !/^\/files\/(?!_neoy\/)[a-zA-Z0-9_-]+\/(?:[^/?#]+\/)*[^/?#]+\.md$/i.test(url.pathname) ||
     url.pathname.split('/').some(part=>part==='.'||part==='..'||part.startsWith('.')))
    throw Error('Design source must be a mounted Markdown file');
  return origin+'/files/_neoy/markcut/design.html?path='+encodeURIComponent(url.pathname);
}

// The published HTML and MCP iframe share exactly one React player and bridge.
// Publish once on provider startup; compiling does not own a browser process.
export function publishDesignViewer({root=EXPORT_ROOT,html=buildPreviewHtml()}={}){
  mkdirSync(root,{recursive:true});
  const target=join(root,'design.html');
  try{if(readFileSync(target,'utf8')===html)return target;}catch{}
  const temp=target+'.'+process.pid+'.tmp';
  writeFileSync(temp,html,{mode:0o644});
  renameSync(temp,target);
  return target;
}
