/**
 * Multi-leg route math for the `map` stream (view:"route").
 *
 * A route is a sequence of legs — one per consecutive waypoint pair. Each
 * waypoint may tag the leg that LEAVES it with its own travel mode
 * (`waypoint.mode ?? map.travelMode`). Supported modes:
 *
 *   DRIVING | WALKING | BICYCLING | TRANSIT   → Google Directions API
 *   FLIGHT | BOAT                             → synthetic great-circle arc
 *     (Directions has no air/water routes; we draw a curved arc and time it
 *      from haversine distance at a cruise speed)
 *
 * Pure functions only (deterministic per second) so the animated marker and
 * any future camera can share the same route-time math.
 */
export interface RouteLegStep {
  path: { lat: number; lng: number }[];
  durationSec: number;
}

export interface RouteLeg {
  mode: string;
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  durationSec: number;
  steps: RouteLegStep[];
}

/** Cruise speeds used to estimate synthetic leg durations (km/h). */
export const FLIGHT_SPEED_KMH = 850;
export const BOAT_SPEED_KMH = 40;

/** Modes with no Directions route — rendered as synthetic great-circle arcs. */
export function isSyntheticMode(mode?: string): boolean {
  const m = (mode ?? "").toUpperCase();
  return m === "FLIGHT" || m === "BOAT";
}

const EARTH_RADIUS_KM = 6371;
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (d: number) => (d * 180) / Math.PI;

/** Great-circle (haversine) distance between two lat/lng points, in km. */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * Interpolate the great-circle arc between two lat/lng points (the "as the
 * crow flies" flight path), returning `points + 1` points including both ends.
 */
export function greatCirclePath(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
  points = 64,
): { lat: number; lng: number }[] {
  const φ1 = toRad(a.lat);
  const λ1 = toRad(a.lng);
  const φ2 = toRad(b.lat);
  const λ2 = toRad(b.lng);
  const d = haversineKm(a, b) / EARTH_RADIUS_KM; // angular distance (radians)
  const out: { lat: number; lng: number }[] = [];
  for (let i = 0; i <= points; i++) {
    if (d === 0) {
      out.push({ lat: a.lat, lng: a.lng });
      continue;
    }
    const f = i / points;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
    const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
    const z = A * Math.sin(φ1) + B * Math.sin(φ2);
    out.push({ lat: toDeg(Math.atan2(z, Math.sqrt(x * x + y * y))), lng: toDeg(Math.atan2(y, x)) });
  }
  return out;
}

/** Build a synthetic leg (FLIGHT ✈️ / BOAT 🚢) between two waypoints. */
export function makeSyntheticLeg(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  mode: string,
): RouteLeg {
  const speedKmh = (mode || "").toUpperCase() === "BOAT" ? BOAT_SPEED_KMH : FLIGHT_SPEED_KMH;
  const durationSec = (haversineKm(from, to) / speedKmh) * 3600;
  return {
    mode: mode.toUpperCase(),
    from,
    to,
    durationSec,
    steps: [{ path: greatCirclePath(from, to), durationSec }],
  };
}

/** Emoji glyph for a leg's travel mode (used for the traveling marker). */
export function modeEmoji(mode?: string): string {
  switch ((mode ?? "").toUpperCase()) {
    case "FLIGHT": return "✈️";
    case "BOAT": return "🚢";
    case "WALKING": return "🚶";
    case "BICYCLING": return "🚲";
    case "TRANSIT": return "🚌";
    case "DRIVING": return "🚗";
    default: return "📍";
  }
}

/** Position within one leg at normalized progress t ∈ [0,1] (step-timed). */
export function positionAlongLeg(
  leg: RouteLeg,
  t: number,
): { lat: number; lng: number } | null {
  if (leg.steps.length === 0) return null;
  const currentInSecond = t * leg.durationSec;
  let acc = 0;
  for (const step of leg.steps) {
    if (currentInSecond <= acc + step.durationSec) {
      const stepElapsed = currentInSecond - acc;
      const stepProgress = step.durationSec > 0 ? stepElapsed / step.durationSec : 0;
      const idx = Math.min(
        Math.max(0, Math.floor(stepProgress * step.path.length)),
        step.path.length - 1,
      );
      return step.path[idx] ?? null;
    }
    acc += step.durationSec;
  }
  const last = leg.steps[leg.steps.length - 1]!;
  return last.path[last.path.length - 1] ?? null;
}

/**
 * Position of the traveling marker at a given timeline second, plus the mode
 * of the leg it is currently on. Time is split across legs proportionally to
 * each leg's duration. Returns null when there is no route.
 */
export function routePositionAtLegs(
  legs: RouteLeg[],
  actionDuration: number,
  seconds: number,
): { lat: number; lng: number; mode: string } | null {
  if (legs.length === 0) return null;
  const total = legs.reduce((s, l) => s + l.durationSec, 0);
  const currentInSecond = seconds * (total / Math.max(actionDuration, 0.1));
  let acc = 0;
  for (const leg of legs) {
    if (currentInSecond <= acc + leg.durationSec) {
      const t = leg.durationSec > 0 ? Math.min(Math.max((currentInSecond - acc) / leg.durationSec, 0), 1) : 0;
      const pos = positionAlongLeg(leg, t);
      return pos ? { ...pos, mode: leg.mode } : null;
    }
    acc += leg.durationSec;
  }
  const last = legs[legs.length - 1]!;
  const pos = positionAlongLeg(last, 1);
  return pos ? { ...pos, mode: last.mode } : null;
}
