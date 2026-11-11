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
/** An explicitly authored marker must not be replaced by a guessed travel-mode glyph. */
export function routeMarkerGlyph(markerEmoji: string, activeMode?: string): string {
  return markerEmoji && markerEmoji !== "🚗" ? markerEmoji : activeMode ? modeEmoji(activeMode) : markerEmoji || "📍";
}

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

/** Interpolate by actual polyline length, not array index: Routes samples are not evenly spaced. */
export function pointAlongPath(
  path: readonly {lat: number; lng: number}[],
  progress: number,
): {lat: number; lng: number} | null {
  if (!path.length) return null;
  if (path.length === 1) return path[0]!;
  const lengths = path.slice(1).map((p, i) => haversineKm(path[i]!, p));
  const total = lengths.reduce((a, b) => a + b, 0);
  if (total < 1e-9) return path[0]!;
  let target = Math.max(0, Math.min(1, progress)) * total;
  for (let i = 0; i < lengths.length; i++) {
    const length = lengths[i]!;
    if (target <= length || i === lengths.length - 1) {
      const a = path[i]!, b = path[i + 1]!;
      const ratio = length ? Math.min(1, Math.max(0, target / length)) : 0;
      const deltaLng = ((b.lng - a.lng + 540) % 360) - 180;
      const lng = ((a.lng + deltaLng * ratio + 540) % 360) - 180;
      return {lat: a.lat + (b.lat - a.lat) * ratio, lng};
    }
    target -= length;
  }
  return path[path.length - 1]!;
}

/** The whole Google road path must fit, including detours outside recorded GPS bounds. */
export function locationsForRouteFit(
  waypoints: readonly {lat: number; lng: number}[],
  legs: readonly RouteLeg[],
): {lat: number; lng: number}[] {
  return [
    ...waypoints,
    ...legs.flatMap(leg => leg.steps.flatMap(step => step.path)),
  ];
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
      return pointAlongPath(step.path, stepProgress);
    }
    acc += step.durationSec;
  }
  const last = leg.steps[leg.steps.length - 1]!;
  return last.path[last.path.length - 1] ?? null;
}

/**
 * A dwell window where the pin holds still at a waypoint (a map overlay
 * child is showing). `fromSec`/`toSec` are in the same timeline as
 * `routePositionAtLegs`'s `seconds`.
 */
export interface RouteStopWindow {
  label: string;
  at: { lat: number; lng: number };
  mode: string;
  fromSec: number;
  toSec: number;
}

/**
 * Position of the traveling marker at a given timeline second, plus the mode
 * of the leg it is currently on. Time is split across legs proportionally to
 * each leg's duration. When `stops` is provided, the marker holds still at a
 * waypoint during its dwell window (drive time is compressed around the
 * dwells, matching the resolver's arrival math). Returns null when there is
 * no route.
 */
export function routePositionAtLegs(
  legs: RouteLeg[],
  actionDuration: number,
  seconds: number,
  stops: RouteStopWindow[] = [],
  timing: {startHold?: number; endHold?: number; easing?: "linear" | "easeInOut"} = {},
): { lat: number; lng: number; mode: string } | null {
  if (legs.length === 0) return null;

  // Inside a dwell window → hold at that waypoint.
  const inStop = stops.find((s) => seconds >= s.fromSec && seconds < s.toSec);
  if (inStop) {
    return { lat: inStop.at.lat, lng: inStop.at.lng, mode: inStop.mode };
  }

  // Drive time = timeline seconds with completed/overlapping dwells removed.
  let dwellBefore = 0;
  for (const s of stops) {
    if (seconds >= s.toSec) dwellBefore += s.toSec - s.fromSec;
    else if (seconds > s.fromSec) dwellBefore += seconds - s.fromSec;
  }
  const startHold = Math.max(0, Math.min(actionDuration * 0.4, timing.startHold ?? 0));
  const endHold = Math.max(0, Math.min(actionDuration * 0.4, timing.endHold ?? 0));
  const driveTime = Math.max(0, seconds - dwellBefore - startHold);
  const totalDwell = stops.reduce((s, st) => s + (st.toSec - st.fromSec), 0);
  const driveBudget = Math.max(0.1, actionDuration - totalDwell - startHold - endHold);
  const total = legs.reduce((s, l) => s + l.durationSec, 0);
  const progress = Math.max(0, Math.min(1, driveTime / driveBudget));
  // Ease the full motion only when no authored intermediate dwell windows need exact arrival times.
  const eased = timing.easing === "easeInOut" && stops.length === 0
    ? progress * progress * (3 - 2 * progress) : progress;
  const currentInSecond = eased * total;
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
