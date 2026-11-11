import {it,expect} from 'vitest';
import {parseMarkdownDescriptive} from '../src/descriptive/markdown';
import {compileDescriptiveRoot} from '../src/descriptive/compiler';
it('routes Google visual timing through descriptive schema and native map stream',()=>{
 const input='# video\nwidth:540 height:960 fps:24\n\n## Route\nlayout:parallel\n- map view:route mapType:roadmap duration:8 routeAnimation:{startHold:0.6,endHold:0.8,easing:easeInOut} waypoints:[45,-76,"A";45.1,-75.9,"B"]';
 const root=compileDescriptiveRoot(parseMarkdownDescriptive(input));
 const map=(root.children[0] as any).children[0];
 expect(map.routeAnimation).toEqual({startHold:0.6,endHold:0.8,easing:'easeInOut'});
});
