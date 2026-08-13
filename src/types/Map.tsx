/// <reference types="google.maps" />
/**
 * Map stream type — Google Maps visualizations with dynamic, movie-like cameras.
 *
 * Four views, selected by `view`:
 *   - overview:   static or dolly camera over the map (mapType: satellite for a city shot)
 *   - route:      animated marker traveling the Directions route (default)
 *   - cinematic:  chase/flyover camera — 2D tilt+heading follow (default), or
 *                 experimental Map3D flyTo/orbit when `cinematic.fallback:"none"`
 *   - streetview: immersive StreetViewPanorama with animated POV/position
 *
 * Camera values are written with `tween(from, to, easing?)` in the descriptive
 * layer and resolved per frame via `resolveTween` (utils/tween.ts) — every
 * frame renders deterministically from `useCurrentFrame()`.
 *
 * Uses @vis.gl/react-google-maps (Google Maps JS API wrapper) — no separate
 * API key management needed beyond what's embedded in the engine build.
 *
 * Usage in stream tree:
 *   {
 *     type: "map",
 *     view: "route",                    // overview | route | cinematic | streetview
 *     waypoints: [{ lat, lng, label?, media? }],
 *     travelMode: "DRIVING",            // DRIVING | WALKING | BICYCLING
 *     mapType: "roadmap",               // roadmap | satellite | hybrid | terrain
 *     camera: { zoom: { __tween: [6, 12, "easeInOut"] } },  // tween(6,12,easeInOut)
 *     routeMarker: "🚗",                // emoji/char for animated pin
 *     start: 0, end: 5
 *   }
 */
import React from "react";
import { Sequence, AbsoluteFill, useCurrentFrame, useVideoConfig, delayRender, continueRender } from "remotion";
import { useFrameEvents } from "../context/index";
import {
  APIProvider, Map as GoogleMap, useMap, useMapsLibrary, useMap3D,
  AdvancedMarker, Pin, Map3D, Marker3D,
} from "@vis.gl/react-google-maps";
import type { Map3DRef } from "@vis.gl/react-google-maps";
import { resolveTween } from "../utils/tween";
import {
  makeSyntheticLeg,
  isSyntheticMode,
  routePositionAtLegs,
  modeEmoji,
  type RouteLeg,
  type RouteStopWindow,
} from "../utils/route-legs";
import type { MapStream, Stream } from "../schema/index";

// API key is injected by the compiler onto the stream node (see compileLeaf in compiler.ts).
// This fallback handles the case where Map.tsx is used directly without the compiler.
function resolveApiKey(stream: MapStream): string {
  if (stream.googleMapsApiKey) return stream.googleMapsApiKey;
  // Safe fallback for Node.js contexts (e.g. remotion render without compiler).
  // In the browser player the key is always pre-stamped by the server-side compiler.
  if (typeof process !== "undefined" && typeof process.env !== "undefined" && process.env.GOOGLE_MAPS_API_KEY) {
    return process.env.GOOGLE_MAPS_API_KEY;
  }
  return "";
}

function resolveMapLocale(language?: string, region?: string): { language?: string; region?: string } {
  if (!language) return { language: undefined, region };
  const lang = language.trim().toLowerCase();
  if (lang === "zh") return { language: "zh-CN", region: region ?? "CN" };
  if (lang === "en") return { language: "en", region: region ?? "US" };
  if (lang.startsWith("zh-")) return { language, region: region ?? "CN" };
  return { language, region };
}

// ============================================================
// MapRefContext — shares the live google.maps.Map instance
// between the view renderer and the overlay layer so anchored
// children can project lat/lng → screen pixel each frame.
// ============================================================
const MapRefContext = React.createContext<{
  map: google.maps.Map | null;
  setMap: (m: google.maps.Map | null) => void;
}>({ map: null, setMap: () => {} });

/** Invisible bridge rendered inside <GoogleMap> to capture the map instance. */
function MapBridge() {
  const map = useMap();
  const { setMap } = React.useContext(MapRefContext);
  React.useEffect(() => {
    setMap(map);
    return () => setMap(null);
  }, [map, setMap]);
  return null;
}

// ============================================================
// Pure Mercator projection — converts a lat/lng to the map
// container's screen pixel, given the live center/zoom/size.
//
// `map.getProjection()` returns null until the map finishes
// initializing, which never happens reliably during Remotion's
// per-frame renders. This replicates `fromLatLngToPoint` with
// the same 256px-at-zoom-0 world coordinates, so anchored
// overlays align with the map deterministically every frame.
// ============================================================
const PROJECTION_TILE = 256;
function worldPoint(lat: number, lng: number): { x: number; y: number } {
  const sin = Math.sin((lat * Math.PI) / 180);
  return {
    x: PROJECTION_TILE * (0.5 + lng / 360),
    y: PROJECTION_TILE * (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)),
  };
}

/** Screen pixel of a lat/lng inside the map container (Mercator, no projection API). */
function latLngToScreen(
  map: google.maps.Map,
  lat: number,
  lng: number,
): { x: number; y: number } | null {
  const center = map.getCenter();
  if (!center) return null;
  const zoom = map.getZoom() ?? 10;
  const container = map.getDiv();
  const w = container.offsetWidth;
  const h = container.offsetHeight;
  if (!w || !h) return null;
  const scale = Math.pow(2, zoom);
  const wp = worldPoint(lat, lng);
  const cp = worldPoint(center.lat(), center.lng());
  return {
    x: w / 2 + (wp.x - cp.x) * scale,
    y: h / 2 + (wp.y - cp.y) * scale,
  };
}

/**
 * Default size of an anchored overlay box — a fraction of the map's smaller
 * dimension. Children render at 100%×100% of this box (`objectFit` keeps the
 * media proportional), so without explicit dimensions the wrapper would
 * collapse to 0×0 and nothing would draw.
 */
function anchoredOverlaySize(map: google.maps.Map): number {
  const d = map.getDiv();
  const w = d.offsetWidth || 640;
  const h = d.offsetHeight || 480;
  return Math.round(Math.min(w, h) * 0.5);
}

// ============================================================
// MapOverlays — renders the map's children as overlay layers.
// Children with `at:"Label"` are positioned at that waypoint's
// screen pixel (projected from the live map each frame).
// ============================================================
const LeafRenderers: Record<string, React.ComponentType<any>> = {};
async function ensureLeafRenderers() {
  if (Object.keys(LeafRenderers).length) return;
  const [v, a, i, c, e, f] = await Promise.all([
    import("./Video"), import("./Audio"), import("./Image"), import("./Component"),
    import("./Effect"), import("./Folder"),
  ]);
  LeafRenderers.video = v.VideoLeaf;
  LeafRenderers.audio = a.AudioLeaf;
  LeafRenderers.image = i.ImageLeaf;
  LeafRenderers.component = c.ComponentLeaf;
  LeafRenderers.effect = e.EffectWrapper;
  LeafRenderers.folder = f.FolderLeaf;
}

function MapOverlays({
  children, waypoints,
}: {
  children: Stream[];
  waypoints: { lat: number; lng: number; label?: string }[];
}) {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const { map } = React.useContext(MapRefContext);
  const [renderersReady, setRenderersReady] = React.useState(Object.keys(LeafRenderers).length > 0);

  React.useEffect(() => {
    ensureLeafRenderers().then(() => setRenderersReady(true));
  }, []);

  if (!renderersReady || !children || children.length === 0) return null;

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {children.map((child, i) => {
        const childStart = child.start ?? 0;
        const childEnd = child.end ?? childStart + (child.duration ?? 1);
        const durFrames = Math.max(1, Math.floor(fps * (childEnd - childStart)));
        const fromFrame = Math.floor(fps * childStart);

        // Look up waypoint lat/lng for anchored children.
        const anchorLabel = (child as any).at as string | undefined;
        const wp = anchorLabel
          ? waypoints.find((w) => w.label === anchorLabel)
          : undefined;

        return (
          <Sequence key={i} durationInFrames={durFrames} from={fromFrame} layout="none">
            <MapChildPositioner map={map} anchorLatLng={wp ? { lat: wp.lat, lng: wp.lng } : undefined} frame={frame} fps={fps}>
              <MapChildRender child={child} />
            </MapChildPositioner>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}

/** Positions a child overlay: full-screen or anchored to a lat/lng on the map. */
function MapChildPositioner({
  map, anchorLatLng, frame, fps, children,
}: {
  map: google.maps.Map | null;
  anchorLatLng?: { lat: number; lng: number };
  frame: number;
  fps: number;
  children: React.ReactNode;
}) {
  // Unanchored: full-screen overlay
  if (!anchorLatLng) {
    return <AbsoluteFill>{children}</AbsoluteFill>;
  }

  // Anchored: project lat/lng → container pixel each frame. Uses pure
  // Mercator math (not map.getProjection(), which is null until the map
  // initializes and never reliably during Remotion frame renders).
  const overlay = React.useMemo(() => {
    if (!map) return null;
    return latLngToScreen(map, anchorLatLng.lat, anchorLatLng.lng);
  }, [map, anchorLatLng?.lat, anchorLatLng?.lng, frame]);

  if (!overlay) {
    return <AbsoluteFill style={{ display: "none" }}>{children}</AbsoluteFill>;
  }

  const box = map ? anchoredOverlaySize(map) : 0;

  return (
    <div style={{
      position: "absolute",
      left: overlay.x,
      top: overlay.y,
      width: box,
      height: box,
      transform: "translate(-50%, -50%)",
    }}>
      {children}
    </div>
  );
}

/** Renders a single compiled child stream inside a map overlay. */
function MapChildRender({ child }: { child: Stream }): React.ReactElement | null {
  const type = child.type;

  // Effect: render its children with the animation applied. Uses `contained`
  // so the animated box fills the anchored overlay box (not the whole canvas),
  // and preloaded renderers (no React.lazy — lazy chunks never resolve before
  // Remotion captures the frame).
  if (type === "effect") {
    const EW = LeafRenderers.effect as React.ComponentType<{ stream: any; contained?: boolean; children?: React.ReactNode }>;
    if (!EW) return null;
    const effectChildren = ((child as any).children ?? []) as Stream[];
    return React.createElement(
      EW,
      { stream: child, contained: true },
      ...effectChildren.map((c, i) =>
        React.createElement(MapChildRender, { key: i, child: c }),
      ),
    );
  }

  if (type === "folder") {
    const FolderLeaf = LeafRenderers.folder;
    if (!FolderLeaf) return null;
    return React.createElement(FolderLeaf, { stream: child });
  }

  const Renderer = LeafRenderers[type];
  if (!Renderer) return null;
  return React.createElement(Renderer, { stream: child });
}

// ============================================================
// MapLeaf — entry point, dispatches to the view renderer
// ============================================================
export function MapLeaf({ stream }: { stream: MapStream }) {
  const [mapInstance, setMapInstance] = React.useState<google.maps.Map | null>(null);
  const { fps } = useVideoConfig();
  const waypoints = stream.waypoints ?? [];
  const start = stream.start ?? 0;
  const end = stream.end ?? start + (stream.duration ?? 1);
  const totalDur = stream.durationInSeconds ?? end;
  const apiKey = resolveApiKey(stream);
  const view = stream.view ?? "route";
  useFrameEvents(stream.on, Math.max(1, Math.floor(totalDur * fps)));
  // route/cinematic animate along waypoints; overview/streetview are standalone views.
  if ((view === "route" || view === "cinematic") && waypoints.length === 0) return null;

  const durFrames = Math.max(1, Math.floor(fps * (end - start)));
  const mapLocale = React.useMemo(
    () => resolveMapLocale(stream.language, stream.region),
    [stream.language, stream.region],
  );
  const mapLoadHandleRef = React.useRef<number | null>(null);
  const mapLoadContinuedRef = React.useRef(false);

  React.useEffect(() => {
    mapLoadHandleRef.current = delayRender("Waiting for map to load...");
    mapLoadContinuedRef.current = false;

    // Avoid hanging indefinitely when tiles/pano/3D fail to load.
    const fallbackTimer = window.setTimeout(() => {
      if (!mapLoadContinuedRef.current && mapLoadHandleRef.current !== null) {
        continueRender(mapLoadHandleRef.current);
        mapLoadContinuedRef.current = true;
      }
    }, 8000);

    return () => {
      window.clearTimeout(fallbackTimer);
      if (!mapLoadContinuedRef.current && mapLoadHandleRef.current !== null) {
        continueRender(mapLoadHandleRef.current);
        mapLoadContinuedRef.current = true;
      }
      mapLoadHandleRef.current = null;
    };
  }, [stream.id, start, end]);

  const handleMapReady = React.useCallback(() => {
    if (!mapLoadContinuedRef.current && mapLoadHandleRef.current !== null) {
      continueRender(mapLoadHandleRef.current);
      mapLoadContinuedRef.current = true;
    }
  }, []);

  // Experimental Map3D is opt-in via `cinematic.fallback:"none"` (requires the
  // Google Maps 3D preview API). Default renders the safe 2D chase camera.
  const use3d =
    view === "cinematic" &&
    stream.cinematic?.fallback === "none" &&
    (stream.cinematic.mode === "flyTo" || stream.cinematic.mode === "orbit");

  return (
    <Sequence
      durationInFrames={durFrames}
      from={Math.floor(fps * start)}
      layout="none"
    >
      <APIProvider
        apiKey={apiKey}
        language={mapLocale.language}
        region={mapLocale.region}
      >
        <MapRefContext.Provider value={{ map: mapInstance, setMap: setMapInstance }}>
          {view === "overview" && <OverviewMap stream={stream} onTilesLoaded={handleMapReady} />}
          {view === "cinematic" && (use3d
            ? <CinematicMap3D stream={stream} onReady={handleMapReady} />
            : <CinematicMap stream={stream} onTilesLoaded={handleMapReady} />)}
          {view === "streetview" && <StreetViewLeaf stream={stream} onPanoReady={handleMapReady} />}
          {view === "route" && <RouteMap stream={stream} onTilesLoaded={handleMapReady} />}
          <MapOverlays children={(stream.children as Stream[]) ?? []} waypoints={stream.waypoints} />
        </MapRefContext.Provider>
      </APIProvider>
    </Sequence>
  );
}

// ============================================================
// OverviewMap — static or dolly camera (far → near) over the map
// ============================================================
function OverviewMap({
  stream, onTilesLoaded,
}: { stream: MapStream; onTilesLoaded: () => void }) {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const start = stream.start ?? 0;
  const end = stream.end ?? start + (stream.duration ?? 1);
  const fallbackCenter = stream.center ?? { lat: 37.7749, lng: -122.4194 };
  const center = {
    lat: resolveTween(frame, fps, stream.camera?.center?.lat, start, end, fallbackCenter.lat),
    lng: resolveTween(frame, fps, stream.camera?.center?.lng, start, end, fallbackCenter.lng),
  };
  const zoom = resolveTween(frame, fps, stream.camera?.zoom, start, end, stream.zoom ?? 10);
  const heading = resolveTween(frame, fps, stream.camera?.heading, start, end, 0);
  const tilt = resolveTween(frame, fps, stream.camera?.tilt, start, end, 0);
  return (
    <GoogleMap
      mapId={String(stream.id ?? "map-overview")}
      center={center}
      zoom={zoom}
      heading={heading}
      tilt={tilt}
      mapTypeId={stream.mapType ?? "roadmap"}
      disableDefaultUI
      zoomControl={false}
      onTilesLoaded={onTilesLoaded}
      style={{ width: "100%", height: "100%", position: "absolute" }}
    >
      <MapBridge />
    </GoogleMap>
  );
}

// ============================================================
// RouteMap — classic animated route (view:"route", the default)
// ============================================================
function RouteMap({
  stream, onTilesLoaded,
}: { stream: MapStream; onTilesLoaded: () => void }) {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const waypoints = stream.waypoints ?? [];
  const start = stream.start ?? 0;
  const end = stream.end ?? start + (stream.duration ?? 1);
  const fallbackCenter = stream.center ?? { lat: waypoints[0]!.lat, lng: waypoints[0]!.lng };
  const center = {
    lat: resolveTween(frame, fps, stream.camera?.center?.lat, start, end, fallbackCenter.lat),
    lng: resolveTween(frame, fps, stream.camera?.center?.lng, start, end, fallbackCenter.lng),
  };
  const zoom = resolveTween(frame, fps, stream.camera?.zoom, start, end, stream.zoom ?? 10);
  return (
    <GoogleMap
      mapId={String(stream.id ?? "map-route")}
      center={center}
      zoom={zoom}
      mapTypeId={stream.mapType ?? "roadmap"}
      disableDefaultUI
      zoomControl={false}
      onTilesLoaded={onTilesLoaded}
      style={{ width: "100%", height: "100%", position: "absolute" }}
    >
      <MapBridge />
      <RouteWithMarkerLegs
        waypoints={waypoints}
        travelMode={stream.travelMode ?? "DRIVING"}
        markerEmoji={stream.routeMarker ?? "🚗"}
        actionDuration={end - start}
        routeColor={stream.routeColor ?? "#4285F4"}
        routeWeight={stream.routeWeight ?? 4}
        children={stream.children as Stream[]}
      />
    </GoogleMap>
  );
}

// ============================================================
// CinematicMap — 2D movie flyover (view:"cinematic")
//
//   flyAlong (default): drone chase — center follows the marker,
//                       heading = route bearing, tilt 45°
//   flyTo:              dolly from first waypoint toward the destination
//   orbit:              rotate heading around a fixed center
// ============================================================
function CinematicMap({
  stream, onTilesLoaded,
}: { stream: MapStream; onTilesLoaded: () => void }) {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const waypoints = stream.waypoints ?? [];
  const start = stream.start ?? 0;
  const end = stream.end ?? start + (stream.duration ?? 1);
  const actionDuration = Math.max(0.1, end - start);
  const mode = stream.cinematic?.mode ?? "flyAlong";
  const headingFollow = stream.cinematic?.headingFollow ?? true;
  const leg = useRouteLeg(waypoints, stream.travelMode ?? "DRIVING");

  const seconds = frame / fps;
  const pos = routePositionAt(leg, waypoints, actionDuration, seconds);
  const lookahead = routePositionAt(leg, waypoints, actionDuration, seconds + 0.4);
  const first = waypoints[0]!;
  const fallbackCenter = stream.center ?? first;

  let center: { lat: number; lng: number };
  if (mode === "flyAlong" && pos) {
    center = pos;
  } else if (mode === "flyTo") {
    center = {
      lat: resolveTween(frame, fps, stream.camera?.center?.lat, start, end, first.lat),
      lng: resolveTween(frame, fps, stream.camera?.center?.lng, start, end, first.lng),
    };
  } else {
    center = fallbackCenter;
  }

  let heading = resolveTween(frame, fps, stream.camera?.heading, start, end, 0);
  if (headingFollow && pos && lookahead) {
    heading = bearing(pos, lookahead);
  }

  const tilt = resolveTween(frame, fps, stream.cinematic?.tilt, start, end, 45);
  const zoom = resolveTween(frame, fps, stream.camera?.zoom, start, end, stream.zoom ?? 13);

  return (
    <GoogleMap
      mapId={String(stream.id ?? "map-cinematic")}
      center={center}
      zoom={zoom}
      heading={heading}
      tilt={tilt}
      mapTypeId={stream.mapType ?? "roadmap"}
      disableDefaultUI
      zoomControl={false}
      onTilesLoaded={onTilesLoaded}
      style={{ width: "100%", height: "100%", position: "absolute" }}
    >
      <RouteWithMarker
        waypoints={waypoints}
        travelMode={stream.travelMode ?? "DRIVING"}
        markerEmoji={stream.routeMarker ?? "🚗"}
        actionDuration={actionDuration}
      />
    </GoogleMap>
  );
}

// ============================================================
// CinematicMap3D — experimental Map3D flyover (opt-in via fallback:"none")
//
//   flyTo:  controlled `range` tween (far → near) over the route
//   orbit:  controlled heading/roll tween around a fixed center
//   Route drawn with a raw <gmp-polyline-3d> element; markers via <Marker3D>.
// ============================================================
function CinematicMap3D({
  stream, onReady,
}: { stream: MapStream; onReady: () => void }) {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const waypoints = stream.waypoints ?? [];
  const start = stream.start ?? 0;
  const end = stream.end ?? start + (stream.duration ?? 1);
  const actionDuration = Math.max(0.1, end - start);
  const first = waypoints[0] ?? { lat: 37.7749, lng: -122.4194 };
  const map3dRef = React.useRef<Map3DRef>(null);
  const map3d = useMap3D();
  const leg = useRouteLeg(waypoints, stream.travelMode ?? "DRIVING");

  const range = resolveTween(frame, fps, stream.cinematic?.range, start, end, 2000);
  const tilt = resolveTween(frame, fps, stream.cinematic?.tilt, start, end, 60);
  const roll = resolveTween(frame, fps, stream.cinematic?.roll, start, end, 0);
  const heading = resolveTween(frame, fps, stream.camera?.heading, start, end, 0);
  const center = {
    lat: resolveTween(frame, fps, stream.camera?.center?.lat, start, end, first.lat),
    lng: resolveTween(frame, fps, stream.camera?.center?.lng, start, end, first.lng),
    altitude: stream.cinematic?.altitude ?? 100,
  };

  const seconds = frame / fps;
  const pos = routePositionAt(leg, waypoints, actionDuration, seconds);

  // Route line via the raw gmp-polyline-3d custom element (no wrapper in 1.8.x).
  const legPath = React.useMemo(() => {
    if (!leg) return null;
    const pts: Array<{ lat: number; lng: number; altitude: number }> = [];
    for (const step of leg.steps ?? []) {
      for (const p of step.path ?? []) pts.push({ lat: p.lat(), lng: p.lng(), altitude: 0 });
    }
    return pts.length ? pts : null;
  }, [leg]);

  React.useEffect(() => {
    if (!map3d || !legPath) return;
    const el = document.createElement("gmp-polyline-3d") as unknown as google.maps.maps3d.Polyline3DElement;
    el.coordinates = legPath;
    el.strokeColor = stream.routeColor ?? "#4285F4";
    el.strokeWidth = stream.routeWeight ?? 4;
    map3d.appendChild(el);
    return () => {
      el.remove();
    };
  }, [map3d, legPath, stream.routeColor, stream.routeWeight]);

  return (
    <Map3D
      ref={map3dRef}
      mode={stream.mapType === "hybrid" ? "HYBRID" : "SATELLITE"}
      center={center}
      range={range}
      heading={heading}
      tilt={tilt}
      roll={roll}
      onSteadyChange={onReady}
      onAnimationEnd={onReady}
      style={{ width: "100%", height: "100%", position: "absolute" }}
    >
      {pos ? (
        <Marker3D position={{ lat: pos.lat, lng: pos.lng, altitude: 0 }} />
      ) : null}
    </Map3D>
  );
}

// ============================================================
// StreetViewLeaf — immersive StreetViewPanorama with animated POV/position
// ============================================================
function StreetViewLeaf({
  stream, onPanoReady,
}: { stream: MapStream; onPanoReady: () => void }) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const svLibrary = useMapsLibrary("streetView");
  const [pano, setPano] = React.useState<google.maps.StreetViewPanorama | null>(null);
  const panoRef = React.useRef<google.maps.StreetViewPanorama | null>(null);
  // Tracks whether the current panorama's imagery has reached StreetViewStatus.OK.
  const loadedRef = React.useRef(false);
  // Id of the last panorama that reached StreetViewStatus.OK — used to hold a
  // loaded view when a walk waypoint has no imagery (instead of flashing black).
  const lastGoodPanoRef = React.useRef<string | null>(null);
  // Index of the waypoint the walk's panorama is currently parked at (snap walk).
  const lastWpIndexRef = React.useRef(-1);

  // ── Persistent pano-load gate ────────────────────────────────────────────
  // Unlike a per-frame delayRender, this wait SURVIVES per-frame effect
  // re-runs. In the Player, frames advance faster than a pano loads, and a
  // per-frame delayRender is continued by the next frame's cleanup before the
  // imagery arrives — capturing black frames when a scene is entered by
  // playback. The wait completes only when the pano actually reaches OK.
  const waitHandleRef = React.useRef<number | null>(null);
  const waitPollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const waitCapRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const start = stream.start ?? 0;
  const end = stream.end ?? start + (stream.duration ?? 1);
  const sv = stream.streetView;
  const svRadius = typeof sv?.radius === "number" && sv.radius > 0 ? sv.radius : 50;

  const finishWait = React.useCallback(() => {
    if (waitHandleRef.current != null) {
      continueRender(waitHandleRef.current);
      waitHandleRef.current = null;
    }
    if (waitPollRef.current != null) {
      clearInterval(waitPollRef.current);
      waitPollRef.current = null;
    }
    if (waitCapRef.current != null) {
      clearTimeout(waitCapRef.current);
      waitCapRef.current = null;
    }
  }, []);

  const statusOk = React.useCallback(() => {
    const p = panoRef.current;
    return !!p && typeof p.getStatus === "function" && p.getStatus() === google.maps.StreetViewStatus.OK;
  }, []);

  const startWait = React.useCallback(() => {
    if (waitHandleRef.current != null) return; // already waiting
    waitHandleRef.current = delayRender("Street View pano");
    waitPollRef.current = setInterval(() => {
      if (statusOk()) {
        const p = panoRef.current;
        lastGoodPanoRef.current = p && typeof p.getPano === "function" ? p.getPano() : null;
        loadedRef.current = true;
        finishWait();
        onPanoReady();
      }
    }, 200);
    // Generous cap for slow or rate-limited loads (Google 429s under load).
    // On cap without OK, hold the last loaded panorama instead of showing black.
    waitCapRef.current = setTimeout(() => {
      if (statusOk()) {
        const p = panoRef.current;
        lastGoodPanoRef.current = p && typeof p.getPano === "function" ? p.getPano() : null;
        loadedRef.current = true;
        finishWait();
        onPanoReady();
        return;
      }
      const fallbackId = lastGoodPanoRef.current;
      const p = panoRef.current;
      if (fallbackId && p && typeof p.setPano === "function") {
        p.setPano(fallbackId);
        setTimeout(() => {
          finishWait();
          onPanoReady();
        }, 400);
      } else {
        finishWait();
        onPanoReady();
      }
    }, 8000);
  }, [statusOk, finishWait, onPanoReady]);

  // Unmount: always finish any pending wait so Remotion never hangs.
  React.useEffect(() => finishWait, [finishWait]);

  // Create the panorama once (no React wrapper component in this library version).
  React.useEffect(() => {
    if (!svLibrary || !containerRef.current) return;
    loadedRef.current = false;
    lastWpIndexRef.current = -1;
    const pan = new svLibrary.StreetViewPanorama(containerRef.current, {
      disableDefaultUI: true,
    });
    panoRef.current = pan;
    // setPosition(latLng, radius?) — radius (m) constrains the panorama search.
    // The public typings only expose the 1-arg overload, so cast the call.
    const panSetPosition = (loc: google.maps.LatLngLiteral) =>
      (pan.setPosition as unknown as (l: google.maps.LatLngLiteral, r: number) => void)(loc, svRadius);
    if (sv?.pano) {
      pan.setPano(sv.pano);
    } else if (sv?.location) {
      panSetPosition(sv.location);
    } else if (sv?.route?.length) {
      panSetPosition(sv.route[0]!);
    }
    if (sv?.pov) {
      pan.setPov({
        heading: typeof sv.pov.heading === "number" ? sv.pov.heading : 0,
        pitch: typeof sv.pov.pitch === "number" ? sv.pov.pitch : 0,
      });
    }
    if (typeof sv?.zoom === "number") {
      pan.setZoom(sv.zoom);
    }
    // Keep lastGood fresh whenever the API reports OK (async, never races).
    const onStatus = () => {
      if (typeof pan.getStatus === "function" && pan.getStatus() === google.maps.StreetViewStatus.OK) {
        lastGoodPanoRef.current = typeof pan.getPano === "function" ? pan.getPano() : null;
        loadedRef.current = true;
      }
    };
    pan.addListener("status_changed", onStatus);
    setPano(pan);
    // Gate the initial load (persistent — see startWait).
    startWait();
    return () => {
      loadedRef.current = false;
      panoRef.current = null;
      pan.setVisible(false);
    };
  }, [svLibrary, stream.id, sv?.pano, sv?.location, sv?.route, sv?.pov, sv?.zoom, svRadius, startWait]);

  // Per-frame POV + snap-walk position. The panorama only MOVES when the walk
  // crosses a waypoint boundary; a new pano load is gated by the persistent
  // startWait (never a per-frame finish, so playback can't capture black).
  React.useEffect(() => {
    if (!pano) return;
    const pov = pano.getPov();
    const heading = resolveTween(frame, fps, sv?.pov?.heading, start, end, pov.heading);
    const pitch = resolveTween(frame, fps, sv?.pov?.pitch, start, end, pov.pitch);
    pano.setPov({ heading, pitch });
    const zoom = resolveTween(frame, fps, sv?.zoom, start, end, pano.getZoom() ?? 0);
    pano.setZoom(zoom);

    if (sv?.route && sv.route.length > 1) {
      // Discrete "snap walk": hold at the nearest waypoint and jump between
      // waypoints. Continuous per-frame interpolation requests a (slightly
      // different) panorama every frame — hundreds of Google Street View API
      // calls per render, which gets rate-limited (429) and renders black.
      const t = Math.min(Math.max((frame / fps) / Math.max(0.1, end - start), 0), 1);
      const wpIndex = Math.min(Math.floor(t * sv.route.length), sv.route.length - 1);
      if (wpIndex !== lastWpIndexRef.current) {
        lastWpIndexRef.current = wpIndex;
        const pt = sv.route[wpIndex]!;
        (pano.setPosition as unknown as (l: google.maps.LatLngLiteral, r: number) => void)(pt, svRadius);
        // New waypoint → new panorama may be needed; gate until it loads.
        startWait();
      }
    } else if (!loadedRef.current) {
      // Static/POV-only scene: keep the initial load gated until ready.
      startWait();
    }
  }, [pano, frame, fps, start, end, sv?.route, sv?.pov, sv?.zoom, svRadius, startWait]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", position: "absolute" }}
    />
  );
}

// ============================================================
// WaypointMarkers — one marker per waypoint (media thumbnail or label)
// ============================================================
function WaypointMarkers({
  waypoints,
}: {
  waypoints: { lat: number; lng: number; label?: string; media?: string }[];
}) {
  return (
    <>
      {waypoints.map((wp, i) => (
        <AdvancedMarker key={i} position={wp}>
          {wp.media ? (
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 6,
                overflow: "hidden",
                border: "2px solid #fff",
                boxShadow: "0 1px 4px rgba(0,0,0,0.45)",
                background: "#fff",
                position: "relative",
                top: "-24px",
              }}
            >
              <img
                src={wp.media}
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            </div>
          ) : wp.label ? (
            <div
              style={{
                background: "rgba(255,255,255,0.9)",
                borderRadius: "4px",
                padding: "2px 6px",
                fontSize: "12px",
                fontWeight: 700,
                color: "#333",
                whiteSpace: "nowrap",
                position: "relative",
                top: "-24px",
              }}
            >
              {wp.label}
            </div>
          ) : null}
        </AdvancedMarker>
      ))}
    </>
  );
}

// ============================================================
// TravelingMarker — the animated marker along the route
// ============================================================
function TravelingMarker({
  position,
  glyph,
}: {
  position: { lat: number; lng: number } | null;
  glyph: string;
}) {
  if (!position) return null;
  return (
    <AdvancedMarker position={position}>
      <Pin glyphText={glyph} scale={4} />
    </AdvancedMarker>
  );
}

// ============================================================
// RoutePolylines — draws each leg's route line. Road legs are a
// solid line in the route color; synthetic legs (FLIGHT ✈️ / BOAT 🚢)
// are a dashed arc in a distinct color.
// ============================================================
function RoutePolylines({
  legs, routeColor, routeWeight,
}: {
  legs: RouteLeg[];
  routeColor: string;
  routeWeight: number;
}) {
  const map = useMap();

  React.useEffect(() => {
    if (!map) return;
    const created = legs.map((leg) => {
      const path = leg.steps.flatMap((s) => s.path);
      const synthetic = isSyntheticMode(leg.mode);
      const color = synthetic
        ? leg.mode.toUpperCase() === "BOAT" ? "#00ACC1" : "#FBBC04"
        : routeColor;
      const opts: google.maps.PolylineOptions = {
        map,
        path,
        strokeColor: color,
        strokeWeight: synthetic ? Math.max(3, routeWeight - 1) : routeWeight,
        strokeOpacity: 0.95,
        zIndex: 1,
      };
      if (synthetic) {
        opts.icons = [{
          icon: { path: "M 0 -1 0 1", strokeColor: color, strokeWeight: 2, scale: 2 },
          offset: "0",
          repeat: "12px",
        }];
      }
      return new google.maps.Polyline(opts);
    });
    return () => created.forEach((p) => p.setMap(null));
  }, [map, legs, routeColor, routeWeight]);

  return null;
}

// ============================================================
// RouteWithMarker — single-leg route (used by cinematic views).
// Fetches the Directions route, renders the route line + waypoint
// markers (label or media thumbnail) + the animated traveling marker
// ============================================================
function RouteWithMarker({
  waypoints, travelMode, markerEmoji, actionDuration,
}: {
  waypoints: { lat: number; lng: number; label?: string; media?: string }[];
  travelMode: string;
  markerEmoji: string;
  actionDuration: number;
}) {
  const leg = useRouteLeg(waypoints, travelMode);

  // Compute animated marker position
  const position = useAnimatedPosition({ leg, actionDuration, waypoints });

  return (
    <>
      <WaypointMarkers waypoints={waypoints} />
      <TravelingMarker position={position} glyph={markerEmoji} />
    </>
  );
}

// ============================================================
// RouteWithMarkerLegs — multi-leg route (view:"route"). Each
// waypoint may tag its outgoing leg with a travel mode
// (waypoint.mode ?? map travelMode); FLIGHT/BOAT legs are synthetic
// dashed arcs. The traveling marker switches glyph per leg
// (✈️ 🚢 🚶 🚲 🚌 🚗).
// ============================================================
function RouteWithMarkerLegs({
  waypoints, travelMode, markerEmoji, actionDuration, routeColor, routeWeight, children,
}: {
  waypoints: { lat: number; lng: number; label?: string; media?: string; mode?: string }[];
  travelMode: string;
  markerEmoji: string;
  actionDuration: number;
  routeColor: string;
  routeWeight: number;
  children?: Stream[];
}) {
  const legs = useRouteLegs(waypoints, travelMode);
  const stops = useRouteStops(children, waypoints, legs);
  const position = useAnimatedPositionLegs({ legs, actionDuration, stops });
  const glyph = position ? modeEmoji(position.mode) : markerEmoji;

  return (
    <>
      <RoutePolylines legs={legs} routeColor={routeColor} routeWeight={routeWeight} />
      <WaypointMarkers waypoints={waypoints} />
      <TravelingMarker position={position} glyph={glyph} />
    </>
  );
}

// ============================================================
// useRouteStops — derives the pin's dwell windows from the map's
// overlay children (each has at:"Label" + start/end). The pin holds
// at that waypoint while its child plays. Windows at the same
// waypoint are merged.
// ============================================================
function useRouteStops(
  children: Stream[] | undefined,
  waypoints: { lat: number; lng: number; label?: string; mode?: string }[],
  legs: RouteLeg[],
): RouteStopWindow[] {
  return React.useMemo(() => {
    if (!children || children.length === 0) return [];
    const byLabel = new Map<string, RouteStopWindow>();
    for (const child of children) {
      const label = (child as any).at as string | undefined;
      if (!label) continue;
      const wp = waypoints.find((w) => w.label === label);
      if (!wp) continue;
      const fromSec = child.start ?? 0;
      const toSec = child.end ?? fromSec + (child.duration ?? 1);
      // Mode of the leg that arrives at this waypoint (leg i → waypoint i+1).
      const idx = waypoints.findIndex((w) => w.label === label) - 1;
      const mode = legs[idx]?.mode ?? "DRIVING";
      const existing = byLabel.get(label);
      if (existing) {
        existing.fromSec = Math.min(existing.fromSec, fromSec);
        existing.toSec = Math.max(existing.toSec, toSec);
      } else {
        byLabel.set(label, { label, at: { lat: wp.lat, lng: wp.lng }, mode, fromSec, toSec });
      }
    }
    return [...byLabel.values()];
  }, [children, waypoints, legs]);
}


// ============================================================
// useRouteLegs — loads one Directions leg per consecutive waypoint
// pair (view:"route"). Each waypoint's `mode` tags its OUTGOING leg;
// FLIGHT/BOAT legs are synthetic arcs (no Directions route). Time is
// split across legs proportionally to each leg's duration.
// ============================================================
function useRouteLegs(
  waypoints: { lat: number; lng: number; mode?: string }[],
  travelMode: string,
): RouteLeg[] {
  const map = useMap();
  const routesLibrary = useMapsLibrary("routes");
  const [legs, setLegs] = React.useState<RouteLeg[]>([]);
  const handle = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (!routesLibrary || !map || waypoints.length < 2) return;
    let active = true;
    const renderHandle = delayRender("Loading map directions...");
    handle.current = renderHandle;

    const service = new routesLibrary.DirectionsService();

    Promise.all(
      waypoints.slice(0, -1).map((wp, i) => {
        const to = waypoints[i + 1]!;
        const mode = (wp.mode ?? travelMode).toUpperCase();
        if (isSyntheticMode(mode)) {
          return Promise.resolve<RouteLeg | null>(makeSyntheticLeg(wp, to, mode));
        }
        return service
          .route({
            origin: wp,
            destination: to,
            travelMode: google.maps.TravelMode[mode as keyof typeof google.maps.TravelMode] ?? google.maps.TravelMode.DRIVING,
            provideRouteAlternatives: false,
          })
          .then((response) => {
            const leg = response.routes[0]?.legs[0];
            if (!leg) return null;
            const steps = (leg.steps ?? []).map((s) => ({
              path: (s.path ?? []).map((p) => ({ lat: p.lat(), lng: p.lng() })),
              durationSec: s.duration?.value ?? 1,
            }));
            return {
              mode,
              from: wp,
              to,
              durationSec: leg.duration?.value ?? (steps.reduce((sum, st) => sum + st.durationSec, 0) || 1),
              steps,
            } satisfies RouteLeg;
          })
          .catch(() => null);
      }),
    ).then((resolved) => {
      if (!active) return;
      setLegs(resolved.filter((l): l is RouteLeg => l !== null));
      if (handle.current !== null) continueRender(handle.current);
    });

    return () => {
      active = false;
    };
  }, [routesLibrary, map, waypoints, travelMode]);

  return legs;
}

// ============================================================
// useAnimatedPositionLegs — leg-aware animated marker position
// (view:"route"): returns { lat, lng, mode } for the current frame
// ============================================================
function useAnimatedPositionLegs({
  legs, actionDuration, stops = [],
}: {
  legs: RouteLeg[];
  actionDuration: number;
  stops?: RouteStopWindow[];
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return React.useMemo(
    () => routePositionAtLegs(legs, actionDuration, frame / fps, stops),
    [legs, frame, fps, actionDuration, stops],
  );
}

// ============================================================
// useRouteLeg — loads the Directions route (shared by RouteMap,
// CinematicMap and CinematicMap3D). Uses the map instance from
// the nearest <GoogleMap> / <Map3D> context.
// ============================================================
function useRouteLeg(
  waypoints: { lat: number; lng: number }[],
  travelMode: string,
): google.maps.DirectionsLeg | null {
  const map = useMap();
  const routesLibrary = useMapsLibrary("routes");
  const [leg, setLeg] = React.useState<google.maps.DirectionsLeg | null>(null);
  const handle = React.useRef<number | null>(null);

  // Load directions
  React.useEffect(() => {
    if (!routesLibrary || !map || waypoints.length < 2) return;
    const renderHandle = delayRender("Loading map directions...");
    handle.current = renderHandle;

    const renderer = new routesLibrary.DirectionsRenderer({ map, suppressMarkers: true });
    const service = new routesLibrary.DirectionsService();

    service
      .route({
        origin: waypoints[0]!,
        destination: waypoints[waypoints.length - 1]!,
        waypoints: waypoints.slice(1, -1).map((wp) => ({ location: wp, stopover: true })),
        travelMode: google.maps.TravelMode[travelMode as keyof typeof google.maps.TravelMode],
        provideRouteAlternatives: false,
      })
      .then((response) => {
        renderer.setDirections(response);
        setLeg(response.routes[0]?.legs[0] ?? null);
        if (handle.current !== null) continueRender(handle.current);
      })
      .catch(() => {
        if (handle.current !== null) continueRender(handle.current);
      });

    return () => {
      renderer.setMap(null);
    };
  }, [routesLibrary, map, waypoints, travelMode]);

  return leg;
}

// ============================================================
// useAnimatedPosition — returns the current lat/lng of the
// animated marker along the route path
// ============================================================
function useAnimatedPosition({
  leg, actionDuration, waypoints,
}: {
  leg: google.maps.DirectionsLeg | null;
  actionDuration: number;
  waypoints: { lat: number; lng: number }[];
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return React.useMemo(
    () => routePositionAt(leg, waypoints, actionDuration, frame / fps),
    [leg, frame, fps, actionDuration, waypoints],
  );
}

// ============================================================
// routePositionAt — pure position math shared by the marker and
// the cinematic camera (deterministic per second)
// ============================================================
function routePositionAt(
  leg: google.maps.DirectionsLeg | null,
  waypoints: { lat: number; lng: number }[],
  actionDuration: number,
  seconds: number,
): { lat: number; lng: number } | null {
  const linearFallback = (): { lat: number; lng: number } | null => {
    if (waypoints.length < 2) return null;
    const t = Math.min(seconds / actionDuration, 1);
    const total = waypoints.length - 1;
    const segI = Math.min(Math.floor(t * total), total - 1);
    const segT = t * total - segI;
    const a = waypoints[segI];
    const b = waypoints[segI + 1];
    if (!a || !b) return null;
    return { lat: a.lat + (b.lat - a.lat) * segT, lng: a.lng + (b.lng - a.lng) * segT };
  };

  if (!leg || !leg.duration?.value) {
    return linearFallback();
  }

  // Follow the route path using leg steps
  const currentInSecond = seconds * (leg.duration.value / actionDuration);
  const { step, elapsedInSeconds } = getCurrentStep(leg, currentInSecond);
  if (!step || !step.path) {
    return linearFallback();
  }

  const stepElapsed = currentInSecond - elapsedInSeconds;
  const stepProgress = stepElapsed / (step.duration?.value ?? 1);
  const pathIdx = Math.min(
    Math.max(0, Math.floor(stepProgress * step.path.length)),
    step.path.length - 1,
  );
  const pt = step.path[pathIdx];
  if (!pt) return null;
  return { lat: pt.lat(), lng: pt.lng() };
}

// ============================================================
// bearing — initial bearing (degrees clockwise from north) between
// two lat/lng points. Haversine; no geometry library required.
// ============================================================
function bearing(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (d: number) => (d * 180) / Math.PI;
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// ============================================================
// getCurrentStep — finds which step of a DirectionsLeg the
// current time falls into
// ============================================================
function getCurrentStep(leg: google.maps.DirectionsLeg, currentInSecond: number) {
  let elapsedInSeconds = 0;
  for (const step of leg.steps ?? []) {
    const stepDur = step.duration?.value ?? 0;
    if (elapsedInSeconds <= currentInSecond && currentInSecond < elapsedInSeconds + stepDur) {
      return { step, elapsedInSeconds };
    }
    elapsedInSeconds += stepDur;
  }
  return { step: null, elapsedInSeconds: 0 };
}
