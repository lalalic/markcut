/** Deterministic offline projection for route visuals; connecting samples is illustrative, not road geometry. */
export interface RoutePoint { lat: number; lng: number; label?: string }
export interface ScreenPoint { x: number; y: number; label?: string }

function mercatorY(lat: number): number {
  const r = Math.max(-85, Math.min(85, lat)) * Math.PI / 180;
  return Math.log(Math.tan(Math.PI / 4 + r / 2));
}

export function projectSchematicRoute(points: RoutePoint[], width: number, height: number): ScreenPoint[] {
  if (!points.length) return [];
  const map = points.map((p, i) => {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng) || Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180)
      throw Error(`Invalid route coordinate at index ${i}`);
    return { x: p.lng, y: -mercatorY(p.lat), label: p.label };
  });
  // Unwrap the antimeridian so nearby points at +179/-179 do not span the world.
  for (let i = 1; i < map.length; i++) {
    const prev = map[i - 1]!.x;
    const original = map[i]!.x;
    map[i]!.x = prev + ((((original - prev + 540) % 360) + 360) % 360) - 180;
  }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of map) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const spreadX = Math.max(1e-6, maxX - minX), spreadY = Math.max(1e-6, maxY - minY);
  const insetX = width * 0.17, insetY = height * 0.23;
  const scale = Math.min((width - 2 * insetX) / spreadX, (height - 2 * insetY) / spreadY);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  return map.map(p => ({x: width / 2 + (p.x - cx) * scale, y: height / 2 + (p.y - cy) * scale, label: p.label}));
}

export function pointAtRouteProgress(points: ScreenPoint[], progress: number): ScreenPoint {
  if (!points.length) throw Error('Route requires at least one waypoint');
  if (points.length === 1) return points[0]!;
  const distances = points.slice(1).map((p, i) => Math.hypot(p.x - points[i]!.x, p.y - points[i]!.y));
  const total = distances.reduce((a, b) => a + b, 0);
  if (total < 1e-6) return points[0]!;
  let remaining = Math.max(0, Math.min(1, progress)) * total;
  for (let i = 0; i < distances.length; i++) {
    const length = distances[i]!;
    if (remaining <= length || i === distances.length - 1) {
      const f = length > 0 ? Math.min(1, remaining / length) : 0;
      return { x: points[i]!.x + (points[i + 1]!.x - points[i]!.x) * f,
        y: points[i]!.y + (points[i + 1]!.y - points[i]!.y) * f };
    }
    remaining -= length;
  }
  return points[points.length - 1]!;
}

export function routeSvgPath(points: ScreenPoint[]): string {
  return points.map((p, i) => `${i ? 'L' : 'M'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
}
