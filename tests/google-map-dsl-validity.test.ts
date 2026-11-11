import {it,expect} from 'vitest';
import {parseMarkdownDescriptive} from '../src/descriptive/markdown';
const base='# video\nwidth:540 height:960 fps:12\n\n## Scene\nlayout:parallel\n';
it('rejects malformed Google Street View literal instead of silently losing its location',()=>{
 const broken=base+'- map view:streetview duration:2 streetView:{location:{lat:45.33,lng:-75.88}}}\n';
 expect(()=>parseMarkdownDescriptive(broken)).toThrow(/invalid structured streetView/);
});
it('preserves valid Google Street View location and camera tween',()=>{
 const good=base+'- map view:streetview duration:2 streetView:{location:{lat:45.33,lng:-75.88},radius:70,pov:{heading:tween(100,190,easeInOut)}}\n';
 const doc=parseMarkdownDescriptive(good), sv=(doc.children[0] as any).children[0].streetView;
 expect(sv.location).toEqual({lat:45.33,lng:-75.88});
 expect(sv.pov.heading.__tween).toEqual([100,190,'easeInOut']);
});
