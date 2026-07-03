import { describe, expect, it } from "vitest";
import { compileDescriptiveRoot } from "./compiler";

describe("compileDescriptiveRoot", () => {
  it("compiles simple series into legacy root+actions", () => {
    const compiled = compileDescriptiveRoot({
      width: 640,
      height: 480,
      fps: 30,
      layout: "series",
      children: [
        { id: "img1", type: "image", src: "a.jpg", duration: 2 },
        { id: "v1", type: "video", src: "a.mp4", startFrom: 1, endAt: 4 },
      ],
    });

    expect(compiled.type).toBe("root");
    expect(compiled.isSeries).toBe(true);
    expect(compiled.children).toHaveLength(2);

    const first = compiled.children[0] as any;
    expect(first.actions[0].start).toBe(0);
    expect(first.actions[0].end).toBe(2);

    const second = compiled.children[1] as any;
    expect(second.actions[0].startFrom).toBe(1);
    expect(second.actions[0].endAt).toBe(4);
    expect(second.actions[0].end).toBe(3);
  });

  it("allows explicit start in parallel root", () => {
    const compiled = compileDescriptiveRoot({
      layout: "parallel",
      children: [
        { id: "a", type: "image", src: "a.jpg", duration: 2, start: 1 },
        { id: "b", type: "image", src: "b.jpg", duration: 1, start: 0 },
      ],
    });

    expect(compiled.isSeries).toBe(false);
    expect(compiled.durationInSeconds).toBe(3);
    const first = compiled.children[0] as any;
    expect(first.actions[0].start).toBe(1);
    expect(first.actions[0].end).toBe(3);
  });

  it("throws when start is used in series", () => {
    expect(() =>
      compileDescriptiveRoot({
        layout: "series",
        children: [{ id: "a", type: "image", src: "a.jpg", duration: 2, start: 1 }],
      }),
    ).toThrow(/start is only allowed in parallel containers/i);
  });

  it("throws on duplicate ids in strict mode", () => {
    expect(() =>
      compileDescriptiveRoot({
        children: [
          { id: "dup", type: "image", src: "a.jpg", duration: 2 },
          { id: "dup", type: "image", src: "b.jpg", duration: 2 },
        ],
      }),
    ).toThrow(/duplicate id/i);
  });

  it("compiles nested containers with correct aggregated duration", () => {
    const compiled = compileDescriptiveRoot({
      layout: "series",
      children: [
        {
          id: "block-1",
          type: "parallel",
          children: [
            { id: "p-1", type: "image", src: "a.jpg", duration: 3, start: 0 },
            { id: "p-2", type: "image", src: "b.jpg", duration: 2, start: 1 },
          ],
        },
        {
          id: "block-2",
          type: "transitionSeries",
          transition: "fade",
          transitionTime: 0.5,
          children: [
            { id: "t-1", type: "component", componentName: "AnimatedHeadline", duration: 2 },
            { id: "t-2", type: "image", src: "c.jpg", duration: 2 },
          ],
        },
      ],
    });

    expect(compiled.children).toHaveLength(2);
    expect(compiled.durationInSeconds).toBeCloseTo(6.5);

    const first = compiled.children[0] as any;
    expect(first.type).toBe("folder");
    expect(first.isSeries).toBe(false);

    const second = compiled.children[1] as any;
    expect(second.type).toBe("folder");
    expect(second.isSeries).toBe(true);
    expect(second.transition).toBe("fade");
  });

  it("compiles scene as descriptive nested container", () => {
    const compiled = compileDescriptiveRoot({
      layout: "series",
      children: [
        {
          id: "scene-1",
          type: "scene",
          children: [
            { id: "s1-img", type: "image", src: "hero.jpg", duration: 2 },
            { id: "s1-audio", type: "audio", src: "narration.mp3", duration: 1.5 },
          ],
        },
      ],
    });

    const scene = compiled.children[0] as any;
    expect(scene.type).toBe("scene");
    expect(scene.children).toHaveLength(2);
    expect(scene.durationInSeconds).toBe(2);
  });

  it("compiles include with src and include fallback children", () => {
    const withSrc = compileDescriptiveRoot(
      {
        layout: "series",
        children: [{ id: "inc-src", type: "include", src: "./child.json", duration: 4 }],
      },
      { mode: "strict" },
    );

    const includeWithSrc = withSrc.children[0] as any;
    expect(includeWithSrc.type).toBe("include");
    expect(includeWithSrc.actions[0].start).toBe(0);
    expect(includeWithSrc.actions[0].end).toBe(4);

    const withChildren = compileDescriptiveRoot({
      layout: "series",
      children: [
        {
          id: "inc-inline",
          type: "include",
          children: [
            { id: "inc-i1", type: "image", src: "a.jpg", duration: 3 },
            { id: "inc-i2", type: "image", src: "b.jpg", duration: 1, start: 1 },
          ],
        },
      ],
    });

    const includeInline = withChildren.children[0] as any;
    expect(includeInline.type).toBe("include");
    expect(includeInline.children).toHaveLength(2);
    expect(includeInline.actions[0].end).toBe(3);
  });

  it("covers remaining types: effect and map", () => {
    const compiled = compileDescriptiveRoot({
      layout: "parallel",
      children: [
        {
          id: "fx",
          type: "effect",
          animation: "fadeIn",
          children: [
            { id: "fx-img", type: "image", src: "fx.jpg", duration: 2 },
          ],
        },
        {
          id: "map-1",
          type: "map",
          duration: 4,
          waypoints: [
            { lat: 37.7749, lng: -122.4194, label: "SF" },
            { lat: 34.0522, lng: -118.2437, label: "LA" },
          ],
          routeMarker: "🚲",
          travelMode: "BICYCLING",
        },
      ],
    });

    const effect = compiled.children.find((c: any) => c.id === "fx") as any;
    expect(effect.type).toBe("effect");
    expect(effect.actions[0].start).toBe(0);
    expect(effect.actions[0].end).toBe(2);
    expect(effect.children).toHaveLength(1);

    const map = compiled.children.find((c: any) => c.id === "map-1") as any;
    expect(map.type).toBe("map");
    expect(map.actions[0].end).toBe(4);
    expect(map.waypoints).toHaveLength(2);
    expect(map.routeMarker).toBe("🚲");
    expect(map.travelMode).toBe("BICYCLING");
  });

  it("supports deep nested layout containers across all modes", () => {
    const compiled = compileDescriptiveRoot({
      layout: "series",
      children: [
        {
          id: "outer-series",
          type: "series",
          children: [
            {
              id: "inner-parallel",
              type: "parallel",
              children: [
                { id: "p1", type: "image", src: "1.jpg", duration: 2, start: 0 },
                { id: "p2", type: "image", src: "2.jpg", duration: 1.5, start: 0.5 },
              ],
            },
            {
              id: "inner-transition",
              type: "transitionSeries",
              transition: "fade",
              transitionTime: 0.25,
              children: [
                { id: "t1", type: "component", componentName: "AnimatedHeadline", duration: 2 },
                { id: "t2", type: "image", src: "3.jpg", duration: 1 },
              ],
            },
          ],
        },
      ],
    });

    // inner parallel = max(2, 0.5 + 1.5) = 2
    // inner transition = 2 + 1 - 0.25 = 2.75
    // outer series = 2 + 2.75 = 4.75
    expect(compiled.durationInSeconds).toBeCloseTo(4.75);

    const outer = compiled.children[0] as any;
    expect(outer.type).toBe("folder");
    expect(outer.isSeries).toBe(true);
    expect(outer.children).toHaveLength(2);

    const innerParallel = outer.children[0];
    expect(innerParallel.type).toBe("folder");
    expect(innerParallel.isSeries).toBe(false);

    const innerTransition = outer.children[1];
    expect(innerTransition.type).toBe("folder");
    expect(innerTransition.isSeries).toBe(true);
    expect(innerTransition.transition).toBe("fade");
  });

  it("supports transitionSeries nested inside parallel", () => {
    const compiled = compileDescriptiveRoot({
      layout: "parallel",
      children: [
        {
          id: "ts",
          type: "transitionSeries",
          transition: "wipe",
          transitionTime: 0.5,
          children: [
            { id: "a1", type: "image", src: "a.jpg", duration: 2 },
            { id: "a2", type: "image", src: "b.jpg", duration: 2 },
          ],
        },
        {
          id: "plain",
          type: "series",
          children: [{ id: "s1", type: "image", src: "c.jpg", duration: 2 }],
        },
      ],
    });

    // ts local duration = 2 + 2 - 0.5 = 3.5
    // plain local duration = 2
    // parallel root takes max => 3.5
    expect(compiled.durationInSeconds).toBeCloseTo(3.5);

    const ts = compiled.children.find((c: any) => c.id === "ts") as any;
    expect(ts.type).toBe("folder");
    expect(ts.transition).toBe("wipe");
    expect(ts.durationInSeconds).toBeCloseTo(3.5);
  });

  it("lets scene organize storyboard flow with series layout", () => {
    const compiled = compileDescriptiveRoot({
      layout: "series",
      children: [
        {
          id: "scene-story",
          type: "scene",
          layout: "series",
          children: [
            { id: "shot-1", type: "image", src: "shot1.jpg", duration: 2 },
            { id: "shot-2", type: "image", src: "shot2.jpg", duration: 1 },
          ],
        },
      ],
    });

    const scene = compiled.children[0] as any;
    expect(scene.type).toBe("scene");
    expect(scene.durationInSeconds).toBe(3);

    // Scene layout is lowered into an inner legacy folder for runtime compatibility.
    expect(scene.children).toHaveLength(1);
    const sceneLayoutFolder = scene.children[0];
    expect(sceneLayoutFolder.type).toBe("folder");
    expect(sceneLayoutFolder.isSeries).toBe(true);
    expect(sceneLayoutFolder.children).toHaveLength(2);
  });

  it("distributes rhythm children across beats", () => {
    const compiled = compileDescriptiveRoot({
      layout: "series",
      children: [
        {
          id: "beat-drop",
          type: "rhythm",
          src: "beat.mp3",
          spots: [0.5, 1.5, 2.5, 3.5],
          children: [
            { id: "b1", type: "image", src: "a.jpg" },
            { id: "b2", type: "image", src: "b.jpg" },
            { id: "b3", type: "image", src: "c.jpg" },
            { id: "b4", type: "image", src: "d.jpg" },
          ],
        },
      ],
    });

    const rhythm = compiled.children[0] as any;
    expect(rhythm.type).toBe("rhythm");
    expect(rhythm.children).toHaveLength(4);

    // child[0] starts at beat 0.5, ends at beat 1.5 => duration 1
    expect(rhythm.children[0].actions[0].start).toBe(0.5);
    expect(rhythm.children[0].actions[0].end).toBe(1.5);

    // child[1] starts at beat 1.5, ends at beat 2.5 => duration 1
    expect(rhythm.children[1].actions[0].start).toBe(1.5);
    expect(rhythm.children[1].actions[0].end).toBe(2.5);

    // last child starts at last beat (3.5), extends by avg gap (1.0) => ends at 4.5
    expect(rhythm.children[3].actions[0].end).toBe(4.5);
    // rhythm duration = last spot + avg gap
    expect(rhythm.durationInSeconds).toBe(4.5);
  });

  it("lets scene organize storyboard flow with transitionSeries layout", () => {
    const compiled = compileDescriptiveRoot({
      layout: "series",
      children: [
        {
          id: "scene-trans",
          type: "scene",
          layout: "transitionSeries",
          transition: "fade",
          transitionTime: 0.5,
          children: [
            { id: "a", type: "image", src: "a.jpg", duration: 2 },
            { id: "b", type: "image", src: "b.jpg", duration: 2 },
          ],
        },
      ],
    });

    const scene = compiled.children[0] as any;
    expect(scene.durationInSeconds).toBeCloseTo(3.5);
    const sceneLayoutFolder = scene.children[0];
    expect(sceneLayoutFolder.type).toBe("folder");
    expect(sceneLayoutFolder.transition).toBe("fade");
    expect(sceneLayoutFolder.durationInSeconds).toBeCloseTo(3.5);
  });
});
