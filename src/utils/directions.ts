/**
 * Server-side Google Directions REST helper.
 *
 * Used at resolve time (Node) to compute per-leg travel durations so map
 * overlay children (`at:"Label"`) can be auto-timed (arrival + dwell). This
 * is the same Directions REST pattern the spots CLI uses — one request per
 * consecutive waypoint pair so mixed travel modes (FLIGHT/BOAT synthetic)
 * can be interspersed with road legs.
 *
 * Requires GOOGLE_MAPS_API_KEY (Directions API enabled).
 */
import { makeSyntheticLeg, haversineKm } from "./route-legs";

export interface RouteLegTiming {
  mode: string;
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  /** Estimated travel time for this leg, in seconds. */
  durationSec: number;
}

function apiKey(): string {
  return (
    (typeof process !== "undefined" && process.env.GOOGLE_MAPS_API_KEY) || ""
  );
}

/** Directions travel modes (non-synthetic). */
const ROAD_MODES = new Set(["DRIVING", "WALKING", "BICYCLING", "TRANSIT"]);

/**
 * Compute the travel time (seconds) for one leg. Road modes hit the
 * Directions REST API; synthetic modes (FLIGHT/BOAT) are estimated from
 * haversine distance at cruise speed — no API call, deterministic.
 *
 * Returns null when the Directions call fails (caller falls back to a
 * straight-line estimate so timing still works offline).
 */
export async function legDurationSec(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  mode: string,
  key = apiKey(),
): Promise<number | null> {
  const m = (mode || "").toUpperCase();
  if (!ROAD_MODES.has(m)) {
    // Synthetic: distance at cruise speed (same math as the renderer).
    return makeSyntheticLeg(from, to, m).durationSec;
  }
  if (!key) {
    // No key → straight-line estimate (consistent, deterministic).
    return straightLineSec(from, to);
  }

  const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
  url.searchParams.set("origin", `${from.lat},${from.lng}`);
  url.searchParams.set("destination", `${to.lat},${to.lng}`);
  url.searchParams.set("mode", m.toLowerCase());
  url.searchParams.set("key", key);

  try {
    const res = await fetch(url);
    const data = await res.json();
    const dur = data?.routes?.[0]?.legs?.[0]?.duration?.value;
    if (typeof dur === "number" && dur > 0) return dur;
    return straightLineSec(from, to);
  } catch {
    return straightLineSec(from, to);
  }
}

/** Fallback straight-line estimate (~50 km/h), so timing works without the API. */
function straightLineSec(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): number {
  return (haversineKm(from, to) / 50) * 3600;
}

/**
 * Compute per-leg timing for a full route.
 *
 * `modes[i]` is the travel mode of the leg leaving waypoints[i]
 * (defaults to `defaultMode`). Returns one timing per consecutive pair.
 */
export async function routeLegTimings(
  waypoints: { lat: number; lng: number; mode?: string }[],
  defaultMode = "DRIVING",
  key = apiKey(),
): Promise<RouteLegTiming[]> {
  if (waypoints.length < 2) return [];
  const out: RouteLegTiming[] = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const from = waypoints[i]!;
    const to = waypoints[i + 1]!;
    const mode = (from.mode ?? defaultMode).toUpperCase();
    const durationSec = (await legDurationSec(from, to, mode, key)) ?? 0;
    out.push({ mode, from, to, durationSec });
  }
  return out;
}
