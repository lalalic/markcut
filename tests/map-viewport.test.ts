import {describe,expect,it} from 'vitest';
import {fitRouteViewport} from '../src/utils/map-viewport';
import {parseMarkdownDescriptive} from '../src/descriptive/markdown';
import {compileDescriptiveRoot} from '../src/descriptive/compiler';
import {mapStream} from '../src/schema/index';

const points=[{lat:45.347,lng:-75.911},{lat:45.320,lng:-75.928}];
describe('fitRouteViewport',()=>{
  it('fills a tall 9:16 frame for the genuine September GPS pair',()=>{
    const fit=fitRouteViewport(points,720,1280)!;
    expect(fit.center.lat).toBeCloseTo(45.3335,2);
    expect(fit.center.lng).toBeCloseTo(-75.9195,3);
    expect(fit.zoom).toBeGreaterThan(13);
    expect(fit.zoom).toBeLessThan(17);
  });
  it('fits both points inside the requested viewport with padding',()=>{
    const r=fitRouteViewport(points,720,1280,{padding:0.14})!;
    const y=(lat:number)=>256*(0.5-Math.log((1+Math.sin(lat*Math.PI/180))/(1-Math.sin(lat*Math.PI/180)))/(4*Math.PI));
    const spanX=Math.abs(points[0].lng-points[1].lng)/360*256*Math.pow(2,r.zoom);
    const spanY=Math.abs(y(points[0].lat)-y(points[1].lat))*Math.pow(2,r.zoom);
    expect(spanX).toBeLessThanOrEqual(720*0.72+0.01);
    expect(spanY).toBeLessThanOrEqual(1280*0.72+0.01);
  });
  it('is different for square and landscape compositions',()=>{
    const portrait=fitRouteViewport(points,720,1280)!;
    const landscape=fitRouteViewport(points,1280,720)!;
    expect(portrait.zoom).toBeGreaterThan(landscape.zoom);
  });
  it('picks the short antimeridian interval',()=>{
    const v=fitRouteViewport([{lat:10,lng:179.8},{lat:10,lng:-179.8}],720,1280)!;
    expect(Math.abs(v.center.lng)).toBeCloseTo(180,2);
    expect(v.zoom).toBeGreaterThan(9);
  });
  it('limits zoom for identical points and filters invalid input',()=>{
    expect(fitRouteViewport([points[0],points[0]],720,1280)?.zoom).toBe(17);
    expect(fitRouteViewport([{lat:NaN,lng:0}],720,1280)).toBeNull();
    expect(fitRouteViewport(points,0,1280)).toBeNull();
  });
});

describe('route map compilation',()=>{
  function compiled(zoom=''){
    const text=`# video\nwidth:720 height:1280 fps:30\n\n## locations\n- map view:route duration:16 ${zoom} waypoints:[45.347,-75.911,"Afternoon"; 45.320,-75.928,"Evening"]`;
    const root=compileDescriptiveRoot(parseMarkdownDescriptive(text));
    return root.children[0].children[0] as any;
  }
  it('does not inject fixed zoom for automatic fit',()=>{
    const map=compiled();
    expect(map.zoom).toBeUndefined();
    expect(mapStream.parse(map).zoom).toBeUndefined();
  });
  it('preserves explicit fixed zoom overrides',()=>{
    const map=compiled('zoom:12');
    expect(map.zoom).toBe(12);
    expect(mapStream.parse(map).zoom).toBe(12);
  });
});
