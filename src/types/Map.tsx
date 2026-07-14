/**
 * Map stream type — animated route on Google Maps.
 *
 * Renders a Google Map with Directions API route between waypoints and an
 * animated marker that travels along the path in sync with the current frame.
 * Uses @vis.gl/react-google-maps (Google Maps JS API wrapper) — no separate
 * API key management needed beyond what's embedded in the engine build.
 *
 * Adapted from qili-ai studio's map component.
 *
 * Usage in stream tree:
 *   {
 *     type: "map",
 *     waypoints: [{ lat, lng, label? }],
 *     travelMode: "DRIVING",        // DRIVING | WALKING | BICYCLING
 *     mapType: "roadmap",           // roadmap | satellite | hybrid | terrain
 *     routeMarker: "🚗",            // emoji/char for animated pin
 *     start: 0, end: 5
 *   }
 */
import React from "react";
import { Sequence, useCurrentFrame, useVideoConfig, delayRender, continueRender } from "remotion";
import { useFrameEvents } from "../context/index";
import {
  APIProvider, Map as GoogleMap, useMap, useMapsLibrary,
  AdvancedMarker, Pin,
} from "@vis.gl/react-google-maps";
import type { MapStream } from "../schema/index";

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

// ============================================================
// MapLeaf — entry point, renders each action as a Sequence
// ============================================================
export function MapLeaf({ stream }: { stream: MapStream }) {
  const { fps } = useVideoConfig();
  const waypoints = stream.waypoints ?? [];
  const start = stream.start ?? 0;
  const end = stream.end ?? start + (stream.duration ?? 1);
  const totalDur = stream.durationInSeconds ?? end;
  const apiKey = resolveApiKey(stream);
  useFrameEvents(stream.on, Math.max(1, Math.floor(totalDur * fps)));
  if (waypoints.length === 0) return null;

  const durFrames = Math.max(1, Math.floor(fps * (end - start)));
  const center = stream.center ?? { lat: waypoints[0].lat, lng: waypoints[0].lng };
  const zoom = stream.zoom ?? 10;
  const mapType = stream.mapType ?? "roadmap";
  const travelMode = stream.travelMode ?? "DRIVING";
  const markerEmoji = stream.routeMarker ?? "🚗";
  return (
    <Sequence
      durationInFrames={durFrames}
      from={Math.floor(fps * start)}
      layout="none"
    >
      <APIProvider apiKey={apiKey}>
        <GoogleMap
          mapId={String(stream.id ?? "map")}
          defaultCenter={center}
          defaultZoom={zoom}
          defaultOptions={{
            mapTypeId: mapType,
            disableDefaultUI: true,
            zoomControl: false,
          }}
          style={{ width: "100%", height: "100%", position: "absolute" }}
        >
          <RouteWithMarker
            waypoints={waypoints}
            travelMode={travelMode}
            markerEmoji={markerEmoji}
            actionDuration={end - start}
          />
        </GoogleMap>
      </APIProvider>
    </Sequence>
  );
}

// ============================================================
// RouteWithMarker — gets the route via DirectionsService, then
// renders an animated marker that follows the route path
// ============================================================
function RouteWithMarker({
  waypoints, travelMode, markerEmoji, actionDuration,
}: {
  waypoints: { lat: number; lng: number; label?: string }[];
  travelMode: string;
  markerEmoji: string;
  actionDuration: number;
}) {
  const map = useMap();
  const routesLibrary = useMapsLibrary("routes");
  const [leg, setLeg] = React.useState<google.maps.DirectionsLeg | null>(null);
  const [routeIndex, setRouteIndex] = React.useState(0);
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
        origin: waypoints[0],
        destination: waypoints[waypoints.length - 1],
        waypoints: waypoints.slice(1, -1).map((wp) => ({ location: wp, stopover: true })),
        travelMode: google.maps.TravelMode[travelMode as keyof typeof google.maps.TravelMode],
        provideRouteAlternatives: false,
      })
      .then((response) => {
        renderer.setDirections(response);
        setRouteIndex(0);
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

  // Update route index
  React.useEffect(() => {
    setRouteIndex((prev) => prev);
  }, [routeIndex]);

  // Compute animated marker position
  const position = useAnimatedPosition({ leg, actionDuration, waypoints });

  return (
    <>
      {waypoints.map((wp, i) => (
        <AdvancedMarker key={i} position={wp}>
          {wp.label ? (
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
      {position ? (
        <AdvancedMarker position={position}>
          <Pin glyphText={markerEmoji} scale={4} />
        </AdvancedMarker>
      ) : null}
    </>
  );
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

  return React.useMemo(() => {
    if (!leg || !leg.duration?.value) {
      // Fallback: linear interpolation between waypoints
      if (waypoints.length < 2) return null;
      const t = Math.min(frame / (actionDuration * fps), 1);
      const total = waypoints.length - 1;
      const segI = Math.min(Math.floor(t * total), total - 1);
      const segT = (t * total) - segI;
      const a = waypoints[segI];
      const b = waypoints[segI + 1];
      if (!a || !b) return null;
      return {
        lat: a.lat + (b.lat - a.lat) * segT,
        lng: a.lng + (b.lng - a.lng) * segT,
      };
    }

    // Follow the route path using leg steps
    const currentInSecond = (frame / fps) * (leg.duration.value / actionDuration);
    const { step, elapsedInSeconds } = getCurrentStep(leg, currentInSecond);
    if (!step || !step.path) {
      // Fallback to linear
      const t = Math.min(frame / (actionDuration * fps), 1);
      const total = waypoints.length - 1;
      const segI = Math.min(Math.floor(t * total), total - 1);
      const segT = (t * total) - segI;
      const a = waypoints[segI];
      const b = waypoints[segI + 1];
      if (!a || !b) return null;
      return {
        lat: a.lat + (b.lat - a.lat) * segT,
        lng: a.lng + (b.lng - a.lng) * segT,
      };
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
  }, [leg, frame, fps, actionDuration, waypoints]);
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
