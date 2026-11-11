import {describe, it, expect} from 'vitest';
import {projectSchematicRoute, pointAtRouteProgress, routeSvgPath} from '../src/utils/schematic-route';

describe('offline Markcut schematic route', () => {
  it('keeps endpoints in bounds and animates marker between them', () => {
    const pts = projectSchematicRoute([{lat:45.4236,lng:-75.7009,label:'Start'},{lat:45.4295,lng:-75.709,label:'End'}],540,960);
    expect(pts).toHaveLength(2);
    expect(pts.every(p=>p.x>0&&p.x<540&&p.y>0&&p.y<960)).toBe(true);
    expect(pointAtRouteProgress(pts,0)).toMatchObject({x:pts[0]!.x,y:pts[0]!.y});
    expect(pointAtRouteProgress(pts,1)).toMatchObject({x:pts[1]!.x,y:pts[1]!.y});
    const mid = pointAtRouteProgress(pts,.5);
    expect(mid.x).toBeCloseTo((pts[0]!.x+pts[1]!.x)/2,3);
    expect(routeSvgPath(pts)).toMatch(/^M .* L /);
  });
  it('unwraps the dateline, rather than sending the route across the world', () => {
    const pts=projectSchematicRoute([{lat:0,lng:179.7},{lat:0,lng:-179.7}],540,960);
    expect(pts[0]!.x).toBeLessThan(pts[1]!.x);
  });
  it('handles stationary route and rejects invalid coordinates', () => {
    const pts=projectSchematicRoute([{lat:45,lng:-75},{lat:45,lng:-75}],540,960);
    expect(pointAtRouteProgress(pts,.75)).toMatchObject({x:pts[0]!.x,y:pts[0]!.y});
    expect(() => projectSchematicRoute([{lat:91,lng:1}],540,960)).toThrow(/Invalid route coordinate/);
  });
});
