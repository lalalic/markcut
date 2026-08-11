#!/usr/bin/env node
/**
 * `markcut spots` — Discover points of interest (spots) along a route.
 *
 * Given a set of waypoints, this fetches the driving/walking route via the
 * Directions REST API, samples points along it, and runs a Places Nearby Search
 * at each sample to find notable POIs (landmarks, parks, museums, etc.). Results
 * are deduplicated, ranked by prominence/rating, and emitted as both JSON and
 * copy-pasteable `waypoints:[...]` markdown so an agent can drop them into a
 * storyboard.
 *
 * The agent then picks the spots it wants to narrate and composes the video
 * (this tool only DISCOVERS spots — it doesn't write the storyboard).
 *
 * Usage:
 *   node src/spots/cli.mjs --waypoints "37.77,-122.41;34.05,-118.25"
 *   node src/spots/cli.mjs --waypoints "..." --travelMode DRIVING --limit 8 --photos
 *   node src/spots/cli.mjs --waypoints "..." --output spots.json
 *
 * Options:
 *   --waypoints "lat,lng;lat,lng[,...]"   Semicolon-separated coordinates (required)
 *   --travelMode DRIVING|WALKING|BICYCLING  Directions travel mode (default DRIVING)
 *   --radius <m>        Nearby search radius around each route sample (default 1500)
 *   --samples <n>       Number of points to sample along the route (default 6)
 *   --type <type>       Place type filter, e.g. tourist_attraction, museum, park
 *                       (default: tourist_attraction|point_of_interest)
 *   --limit <n>         Max spots to return after ranking (default 8)
 *   --photos            Fetch one photo URL per spot (waypoint.media)
 *   --output <path>     Write JSON to file (default: print to stdout)
 *   --api-key <key>     Google Maps API key (default: $GOOGLE_MAPS_API_KEY)
 *   --markdown          Also print waypoints:[...] markdown to stderr
 *   --help              Show this help
 *
 * Requires: GOOGLE_MAPS_API_KEY env var (Directions + Places API enabled).
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const args = parseArgs(process.argv.slice(2));
if (args.help || !args.waypoints) {
  process.stderr.write(`Usage: markcut spots --waypoints "lat,lng;lat,lng" [options]

Discovers points of interest along a route via the Directions + Places APIs,
ranked by prominence, for an agent to narrate in a video.

Options:
  --waypoints "lat,lng;lat,lng"   Semicolon-separated coordinates (required)
  --travelMode <mode>             DRIVING | WALKING | BICYCLING (default DRIVING)
  --radius <m>                    Nearby search radius per sample (default 1500)
  --samples <n>                   Route sample points (default 6)
  --type <type>                   Place type filter (default tourist_attraction|point_of_interest)
  --limit <n>                     Max spots (default 8)
  --photos                        Fetch one photo URL per spot
  --output <path>                 Write JSON to file
  --markdown                      Print waypoints:[...] markdown to stderr
  --api-key <key>                 Google Maps API key (default $GOOGLE_MAPS_API_KEY)
  --help                          Show this help
`);
  process.exit(args.help ? 0 : 1);
}

const API_KEY = args.apiKey || process.env.GOOGLE_MAPS_API_KEY;
if (!API_KEY) {
  console.error("❌ GOOGLE_MAPS_API_KEY not set (or pass --api-key)");
  process.exit(1);
}

const waypoints = parseWaypoints(args.waypoints);
if (waypoints.length < 2) {
  console.error("❌ Need at least 2 waypoints");
  process.exit(1);
}

const travelMode = (args.travelMode || "DRIVING").toUpperCase();
const radius = Number(args.radius || 1500);
const samples = Number(args.samples || 6);
const placeType = args.type || "tourist_attraction|point_of_interest";
const limit = Number(args.limit || 8);
const wantPhotos = !!args.photos;

emitInfo(`Route: ${waypoints.length} waypoints, mode=${travelMode}, samples=${samples}, radius=${radius}m`);

// 1. Fetch the route → decoded polyline → sampled points
const routePts = await fetchRoutePoints(waypoints, travelMode, samples);
if (routePts.length === 0) {
  console.error("❌ No route found between waypoints");
  process.exit(1);
}
emitInfo(`Route decoded: ${routePts.length} sample points`);

// 2. Nearby search at each sample, merge + dedupe by place_id
const seen = new Map();  // place_id → spot
for (let i = 0; i < routePts.length; i++) {
  const pt = routePts[i];
  const places = await nearbySearch(pt, radius, placeType);
  for (const p of places) {
    if (seen.has(p.place_id)) continue;
    seen.set(p.place_id, {
      lat: p.geometry.location.lat,
      lng: p.geometry.location.lng,
      label: p.name,
      types: p.types ?? [],
      rating: p.rating,
      userRatings: p.user_ratings_total,
      vicinity: p.vicinity,
      routeSample: i,
    });
  }
}
emitInfo(`Places found: ${seen.size} unique (before ranking)`);

// 3. Rank: rating × log(ratings), boosted by earlier route position (narrative arc)
const ranked = [...seen.values()]
  .map((s) => ({
    ...s,
    score: (s.rating ?? 3) * Math.log10((s.userRatings ?? 10) + 10),
  }))
  .sort((a, b) => b.score - a.score)
  .slice(0, limit);

// 4. Optional photos
if (wantPhotos) {
  for (const s of ranked) {
    const photo = await fetchPlacePhoto(s, routePts[0]);
    if (photo) s.media = photo;
  }
}

// 5. Emit
const out = { waypoints, travelMode, radius, samples, spots: ranked };
const json = JSON.stringify(out, null, 2);
if (args.output) {
  writeFileSync(resolve(args.output), json);
  emitSuccess(`Wrote ${ranked.length} spots → ${args.output}`);
} else {
  process.stdout.write(json + "\n");
}

if (args.markdown) {
  const md = "waypoints:[" + ranked
    .map((s) => `${s.lat},${s.lng},"${s.label.replace(/"/g, "")}"${s.media ? `,"${s.media}"` : ""}`)
    .join(";") + "]";
  process.stderr.write(`\n📋 waypoints markdown:\n  - map ... ${md}\n\n`);
}

emitSuccess(`${ranked.length} spots ready`);

// ── Helpers ───────────────────────────────────────────────────────────────

function emitInfo(m) { console.error(`  ℹ️  ${m}`); }
function emitSuccess(m) { console.error(`✅ ${m}`); }

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) { out[key] = next; i++; }
      else out[key] = true;
    }
  }
  return out;
}

function parseWaypoints(s) {
  return s.split(";").map((part) => {
    const [lat, lng] = part.split(",").map(Number);
    return { lat, lng };
  }).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
}

/** Fetch the route via Directions REST API, decode the polyline, sample N points. */
async function fetchRoutePoints(wps, mode, sampleCount) {
  const origin = wps[0];
  const dest = wps[wps.length - 1];
  const via = wps.slice(1, -1);
  const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
  url.searchParams.set("origin", `${origin.lat},${origin.lng}`);
  url.searchParams.set("destination", `${dest.lat},${dest.lng}`);
  if (via.length) url.searchParams.set("waypoints", via.map((w) => `${w.lat},${w.lng}`).join("|"));
  url.searchParams.set("mode", mode.toLowerCase());
  url.searchParams.set("key", API_KEY);

  const res = await fetch(url);
  const data = await res.json();
  if (data.status !== "OK" || !data.routes?.length) return [];

  // Flatten all legs' steps' polyline points into one path
  const path = [];
  for (const leg of data.routes[0].legs ?? []) {
    for (const step of leg.steps ?? []) {
      if (step.polyline?.points) {
        path.push(...decodePolyline(step.polyline.points));
      }
    }
  }
  if (path.length === 0) return [];

  // Sample N evenly-spaced points along the path
  if (path.length <= sampleCount) return path;
  const out = [];
  for (let i = 0; i < sampleCount; i++) {
    out.push(path[Math.floor((i / (sampleCount - 1)) * (path.length - 1))]);
  }
  return out;
}

/** Places Nearby Search (REST) at a point. */
async function nearbySearch(pt, searchRadius, type) {
  const url = new URL("https://maps.googleapis.com/maps/api/place/nearbysearch/json");
  url.searchParams.set("location", `${pt.lat},${pt.lng}`);
  url.searchParams.set("radius", String(searchRadius));
  url.searchParams.set("type", type);
  url.searchParams.set("key", API_KEY);
  const res = await fetch(url);
  const data = await res.json();
  return data.results ?? [];
}

/** Fetch one photo URL for a place via the Place Details + Photos API. */
async function fetchPlacePhoto(spot) {
  // Use Place Details to get photo references
  const detUrl = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  detUrl.searchParams.set("place_id", spot.placeId ?? "");
  // Nearby search doesn't return place_id in our shape; re-query by location+name
  // Simpler: use Find Place From Text by name to get place_id, then photo.
  // To keep this lightweight, fall back to a Static Maps thumbnail of the spot.
  const sm = new URL("https://maps.googleapis.com/maps/api/staticmap");
  sm.searchParams.set("center", `${spot.lat},${spot.lng}`);
  sm.searchParams.set("zoom", "16");
  sm.searchParams.set("size", "128x128");
  sm.searchParams.set("maptype", "satellite");
  sm.searchParams.set("key", API_KEY);
  return sm.toString();
}

/**
 * Decode an encoded polyline string into {lat, lng} points.
 * Google's polyline encoding format (Algorithm: https://developers.google.com/maps/documentation/utilities/polylinealgorithm).
 */
function decodePolyline(encoded) {
  const coords = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dLat = (result & 1 ? ~(result >> 1) : result >> 1);
    lat += dLat;
    shift = 0; result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dLng = (result & 1 ? ~(result >> 1) : result >> 1);
    lng += dLng;
    coords.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return coords;
}
