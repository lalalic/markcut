/** Deterministic Web Mercator framing for route waypoints in a video frame. */
export type MapLocation = {lat: number; lng: number};
export type RouteViewport = {center: MapLocation; zoom: number};

const TILE = 256;
const MAX_MERCATOR_LAT = 85.05112878;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const wrap = (n: number, mod: number) => ((n % mod) + mod) % mod;

/** Fit observed points, not an inferred road, inside the given composition. */
export function fitRouteViewport(
  locations: readonly MapLocation[],
  width: number,
  height: number,
  {padding = 0.14, minZoom = 2, maxZoom = 17}: {padding?: number; minZoom?: number; maxZoom?: number} = {},
): RouteViewport | null {
  if (!(width > 0 && height > 0) || !Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (!(padding >= 0 && padding < 0.5) || minZoom > maxZoom) return null;
  const points = locations.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng) &&
    Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180);
  if (!points.length) return null;

  const xs = points.map(p => wrap((p.lng + 180) / 360 * TILE, TILE)).sort((a,b)=>a-b);
  // Minimum circular longitude interval also works across the date line.
  let gap = -1, largestGapIndex = 0;
  for (let i=0; i<xs.length; i++) {
    const next = i+1 < xs.length ? xs[i+1] : xs[0] + TILE;
    if (next-xs[i] > gap) {gap = next-xs[i]; largestGapIndex=i;}
  }
  const left = xs[(largestGapIndex+1)%xs.length];
  const spanX = TILE-gap;
  const midX = wrap(left+spanX/2,TILE);
  const lng = wrap(midX/TILE*360,360)-180;

  const ys = points.map(p=>{
    const sine = Math.sin(clamp(p.lat,-MAX_MERCATOR_LAT,MAX_MERCATOR_LAT)*Math.PI/180);
    return TILE * (0.5-Math.log((1+sine)/(1-sine))/(4*Math.PI));
  });
  const top = Math.min(...ys), bottom = Math.max(...ys);
  const midY = (top+bottom)/2;
  const lat = (180/Math.PI)*(2*Math.atan(Math.exp(Math.PI-2*Math.PI*midY/TILE))-Math.PI/2);
  const spanY = bottom-top;
  const usableWidth=width*(1-2*padding),usableHeight=height*(1-2*padding);
  const xZoom=spanX>0 ? Math.log2(usableWidth/spanX) : maxZoom;
  const yZoom=spanY>0 ? Math.log2(usableHeight/spanY) : maxZoom;
  return {center:{lat,lng},zoom:clamp(Math.min(xZoom,yZoom),minZoom,maxZoom)};
}
