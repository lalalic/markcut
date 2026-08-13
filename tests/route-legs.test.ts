import { describe, it, expect } from "vitest";
import {
  haversineKm,
  greatCirclePath,
  makeSyntheticLeg,
  modeEmoji,
  routePositionAtLegs,
  isSyntheticMode,
  type RouteLeg,
} from "../src/utils/route-legs";

const SF = { lat: 37.7749, lng: -122.4194 };
const LA = { lat: 34.0522, lng: -118.2437 };
const PIER = { lat: 34.0094, lng: -118.4969 };

describe("haversineKm", () => {
  it("is ~0 for identical points", () => {
    expect(haversineKm(SF, SF)).toBeCloseTo(0, 6);
  });

  it("is ~560 km for SF→LA (great-circle)", () => {
    expect(haversineKm(SF, LA)).toBeGreaterThan(500);
    expect(haversineKm(SF, LA)).toBeLessThan(620);
  });
});

describe("greatCirclePath", () => {
  it("includes both endpoints and is monotonic in length", () => {
    const path = greatCirclePath(SF, LA, 32);
    expect(path.length).toBe(33);
    expect(path[0]).toEqual(SF);
    const last = path[path.length - 1]!;
    expect(last.lat).toBeCloseTo(LA.lat, 4);
    expect(last.lng).toBeCloseTo(LA.lng, 4);
  });

  it("handles identical endpoints without NaN", () => {
    const path = greatCirclePath(SF, SF, 8);
    expect(path.every((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))).toBe(true);
    expect(path[0]).toEqual(SF);
  });
});

describe("makeSyntheticLeg", () => {
  it("builds a FLIGHT leg with a cruise-speed duration and single arc step", () => {
    const leg = makeSyntheticLeg(SF, LA, "FLIGHT");
    expect(leg.mode).toBe("FLIGHT");
    expect(leg.durationSec).toBeGreaterThan(0);
    // SF→LA ~559 km @ 850 km/h ≈ 0.66 h ≈ 2370 s
    expect(leg.durationSec).toBeGreaterThan(2000);
    expect(leg.durationSec).toBeLessThan(2700);
    expect(leg.steps).toHaveLength(1);
    expect(leg.steps[0]!.path.length).toBeGreaterThan(10);
  });

  it("builds a BOAT leg with a slower speed (longer duration for same distance)", () => {
    const boat = makeSyntheticLeg(SF, LA, "BOAT");
    const flight = makeSyntheticLeg(SF, LA, "FLIGHT");
    expect(boat.mode).toBe("BOAT");
    expect(boat.durationSec).toBeGreaterThan(flight.durationSec);
  });
});

describe("isSyntheticMode / modeEmoji", () => {
  it("flags FLIGHT and BOAT as synthetic", () => {
    expect(isSyntheticMode("FLIGHT")).toBe(true);
    expect(isSyntheticMode("BOAT")).toBe(true);
    expect(isSyntheticMode("flight")).toBe(true);
    expect(isSyntheticMode("DRIVING")).toBe(false);
    expect(isSyntheticMode("WALKING")).toBe(false);
    expect(isSyntheticMode(undefined)).toBe(false);
  });

  it("maps modes to emoji", () => {
    expect(modeEmoji("FLIGHT")).toBe("✈️");
    expect(modeEmoji("BOAT")).toBe("🚢");
    expect(modeEmoji("WALKING")).toBe("🚶");
    expect(modeEmoji("BICYCLING")).toBe("🚲");
    expect(modeEmoji("TRANSIT")).toBe("🚌");
    expect(modeEmoji("DRIVING")).toBe("🚗");
    expect(modeEmoji(undefined)).toBe("📍");
  });
});

describe("routePositionAtLegs", () => {
  const makeLeg = (mode: string, durationSec: number, path: { lat: number; lng: number }[]): RouteLeg => ({
    mode,
    from: path[0]!,
    to: path[path.length - 1]!,
    durationSec,
    steps: [{ path, durationSec }],
  });

  const straight = (a: { lat: number; lng: number }, b: { lat: number; lng: number }, n = 20) => {
    const out: { lat: number; lng: number }[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      out.push({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t });
    }
    return out;
  };

  const legs: RouteLeg[] = [
    makeLeg("FLIGHT", 10, straight(SF, LA)),
    makeLeg("DRIVING", 30, straight(LA, PIER)),
  ];

  it("returns null for no legs", () => {
    expect(routePositionAtLegs([], 40, 0)).toBeNull();
  });

  it("starts at the first waypoint and ends at the last", () => {
    const start = routePositionAtLegs(legs, 40, 0)!;
    expect(start.lat).toBeCloseTo(SF.lat, 5);
    expect(start.lng).toBeCloseTo(SF.lng, 5);
    expect(start.mode).toBe("FLIGHT");

    const end = routePositionAtLegs(legs, 40, 40)!;
    expect(end.lat).toBeCloseTo(PIER.lat, 5);
    expect(end.lng).toBeCloseTo(PIER.lng, 5);
    expect(end.mode).toBe("DRIVING");
  });

  it("splits time proportionally to leg duration and reports the current leg mode", () => {
    // leg durations 10 + 30 = 40 total; actionDuration 40s
    // → flight leg occupies t∈[0,10], driving leg t∈[10,40]
    const atFlightEnd = routePositionAtLegs(legs, 40, 9.99)!;
    expect(atFlightEnd.mode).toBe("FLIGHT");

    const atDrivingStart = routePositionAtLegs(legs, 40, 10.01)!;
    expect(atDrivingStart.mode).toBe("DRIVING");
    expect(atDrivingStart.lat).toBeCloseTo(LA.lat, 4);
  });

  it("mid-leg position tracks the leg's path (proportional timing)", () => {
    // leg durations [10,30]; actionDuration 40. At t=20 the driving leg is
    // (20-10)/30 = 1/3 of the way from LA → PIER (with point quantization).
    const atThird = 1 / 3;
    const mid = routePositionAtLegs(legs, 40, 20)!;
    expect(mid.mode).toBe("DRIVING");
    expect(mid.lat).toBeCloseTo(LA.lat + (PIER.lat - LA.lat) * atThird, 2);
    expect(mid.lng).toBeCloseTo(LA.lng + (PIER.lng - LA.lng) * atThird, 2);
  });

  it("clamps past-the-end seconds to the destination", () => {
    const end = routePositionAtLegs(legs, 40, 100)!;
    expect(end.lat).toBeCloseTo(PIER.lat, 5);
    expect(end.mode).toBe("DRIVING");
  });

  it("holds at a waypoint during a dwell window", () => {
    const stops = [{ label: "LA", at: LA, mode: "FLIGHT", fromSec: 8, toSec: 12 }];
    // Inside the dwell → pin holds at LA, not on the flight arc.
    const during = routePositionAtLegs(legs, 40, 10, stops)!;
    expect(during.mode).toBe("FLIGHT");
    expect(during.lat).toBeCloseTo(LA.lat, 4);
    expect(during.lng).toBeCloseTo(LA.lng, 4);

    // At toSec the dwell is over and motion resumes (no longer holding at LA).
    const resumed = routePositionAtLegs(legs, 40, 12, stops)!;
    expect(resumed.mode).toBe("FLIGHT");
    expect(resumed.lat).toBeGreaterThan(LA.lat);
  });

  it("compresses drive time around dwells (dwell removed from drive budget)", () => {
    const stops = [{ label: "LA", at: LA, mode: "FLIGHT", fromSec: 8, toSec: 12 }];
    // With the 4s dwell at LA, at wall-clock t=12 the pin is only ~89% along
    // the flight arc (still north of LA) because the drive budget shrank.
    const withStop = routePositionAtLegs(legs, 40, 12, stops)!;
    expect(withStop.mode).toBe("FLIGHT");
    expect(withStop.lat).toBeGreaterThan(LA.lat);
    expect(withStop.lat).toBeLessThan(SF.lat);

    // Without the stop, t=12 is already 20% into the LA→PIER driving leg.
    const noStop = routePositionAtLegs(legs, 40, 12)!;
    expect(noStop.mode).toBe("DRIVING");
  });
});
