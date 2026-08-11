/**
 * Unit tests for the stream-tree schema.
 *
 * Fast (no rendering). Guards against silent data loss from zod's default
 * `.strip()` behavior — specifically the `root.imports` component-registry
 * field that the player server sets after bundling frontmatter imports.
 */
import { describe, it, expect } from "vitest";
import { root, component, mapStream } from "../src/schema/index";

describe("root.imports — component registry passthrough", () => {
  it("preserves a string bundle URL through root.parse()", () => {
    // This is what the player server sets after bundling frontmatter imports.
    const parsed = root.parse({
      type: "root",
      imports: "http://localhost:3001/.component-cache/abc123.js",
      children: [],
    });
    expect(parsed.imports).toBe("http://localhost:3001/.component-cache/abc123.js");
  });

  it("preserves an inline component map (programmatic API)", () => {
    const Hello = () => null;
    const parsed = root.parse({
      type: "root",
      imports: { Hello, BarChart: () => null },
      children: [],
    });
    expect(parsed.imports).toBeDefined();
    expect(Object.keys(parsed.imports as object).sort()).toEqual(["BarChart", "Hello"]);
  });

  it("defaults imports to undefined when absent", () => {
    const parsed = root.parse({ type: "root", children: [] });
    expect(parsed.imports).toBeUndefined();
  });
});

describe("component node", () => {
  it("requires a jsx usage expression", () => {
    const c = component.parse({
      type: "component",
      jsx: "<BarChart data={[{value: 1}]} />",
      start: 0,
      end: 2,
    });
    expect(c.type).toBe("component");
    expect(c.jsx).toContain("BarChart");
  });

  it("carries data bindings for the JSX scope", () => {
    const c = component.parse({
      type: "component",
      jsx: "<Hello name={who} />",
      data: { who: "World" },
      start: 0,
      end: 1,
    });
    expect(c.data).toEqual({ who: "World" });
  });

  it("rejects a component without jsx", () => {
    expect(() =>
      component.parse({
        type: "component",
        start: 0,
        end: 1,
      }),
    ).toThrow();
  });
});

describe("map stream — dynamic camera views", () => {
  const base = { type: "map", waypoints: [{ lat: 37.77, lng: -122.41 }], start: 0, end: 5 };

  it("defaults view to route", () => {
    expect(mapStream.parse(base).view).toBe("route");
  });

  it("accepts all views", () => {
    for (const view of ["overview", "route", "cinematic", "streetview"] as const) {
      expect(mapStream.parse({ ...base, view }).view).toBe(view);
    }
  });

  it("carries camera tween specs and static numbers", () => {
    const m = mapStream.parse({
      ...base,
      view: "overview",
      camera: { zoom: { __tween: [6, 12, "easeInOut"] }, tilt: 45 },
    });
    expect(m.camera?.zoom).toEqual({ __tween: [6, 12, "easeInOut"] });
    expect(m.camera?.tilt).toBe(45);
  });

  it("carries cinematic config with tweenable tilt/range", () => {
    const m = mapStream.parse({
      ...base,
      view: "cinematic",
      cinematic: { mode: "flyTo", tilt: { __tween: [0, 45] }, range: 2000, fallback: "2d" },
    });
    expect(m.cinematic?.mode).toBe("flyTo");
    expect(m.cinematic?.tilt).toEqual({ __tween: [0, 45] });
    expect(m.cinematic?.range).toBe(2000);
    expect(m.cinematic?.fallback).toBe("2d");
  });

  it("carries streetView config with pov tweens, zoom and walk route", () => {
    const m = mapStream.parse({
      ...base,
      view: "streetview",
      streetView: {
        location: { lat: 37.77, lng: -122.41 },
        pov: { heading: { __tween: [200, 320] }, pitch: -10 },
        zoom: 0.5,
        route: [{ lat: 37.77, lng: -122.41 }, { lat: 37.78, lng: -122.42 }],
      },
    });
    expect(m.streetView?.pov?.heading).toEqual({ __tween: [200, 320] });
    expect(m.streetView?.pov?.pitch).toBe(-10);
    expect(m.streetView?.zoom).toBe(0.5);
    expect(m.streetView?.route?.length).toBe(2);
  });

  it("rejects an invalid view", () => {
    expect(() => mapStream.parse({ ...base, view: "drone" })).toThrow();
  });
});
