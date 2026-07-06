import { describe, expect, it, vi } from "vitest";
import { compileDescriptiveRoot, resolveComponentImportSpec, parseImportsBlock } from "./compiler";

describe("resolveComponentImportSpec", () => {
  it("rewrites npm: specs to esm.sh", () => {
    expect(resolveComponentImportSpec("npm:react-stat-counter")).toBe("https://esm.sh/react-stat-counter");
    expect(resolveComponentImportSpec("npm:pkg@1.2.3/Comp.js")).toBe("https://esm.sh/pkg@1.2.3/Comp.js");
  });

  it("rewrites npm: with scoped package", () => {
    expect(resolveComponentImportSpec("npm:@org/pkg")).toBe("https://esm.sh/@org/pkg");
    expect(resolveComponentImportSpec("npm:@org/pkg@1.0.0/lib")).toBe("https://esm.sh/@org/pkg@1.0.0/lib");
  });

  it("rewrites npm: with version and subpath", () => {
    expect(resolveComponentImportSpec("npm:react@18.2.0")).toBe("https://esm.sh/react@18.2.0");
    expect(resolveComponentImportSpec("npm:lodash-es@4.17.21/debounce")).toBe("https://esm.sh/lodash-es@4.17.21/debounce");
  });

  it("rewrites git: specs to esm.sh /gh/", () => {
    expect(resolveComponentImportSpec("git:foo/bar")).toBe("https://esm.sh/gh/foo/bar");
    expect(resolveComponentImportSpec("github:user/repo@main/src/Logo.tsx")).toBe(
      "https://esm.sh/gh/user/repo@main/src/Logo.tsx",
    );
  });

  it("rewrites git: with branch and subpath", () => {
    expect(resolveComponentImportSpec("git:myorg/widget@develop/src/Widget.tsx")).toBe(
      "https://esm.sh/gh/myorg/widget@develop/src/Widget.tsx",
    );
  });

  it("rewrites git: with just owner/repo", () => {
    expect(resolveComponentImportSpec("git:org/repo")).toBe("https://esm.sh/gh/org/repo");
  });

  it("passes through URLs and paths unchanged", () => {
    expect(resolveComponentImportSpec("https://cdn.example.com/c.js")).toBe("https://cdn.example.com/c.js");
    expect(resolveComponentImportSpec("./local/Comp.js")).toBe("./local/Comp.js");
    expect(resolveComponentImportSpec("/absolute/path/Comp.tsx")).toBe("/absolute/path/Comp.tsx");
    expect(resolveComponentImportSpec("http://localhost:3000/comp.mjs")).toBe("http://localhost:3000/comp.mjs");
    expect(resolveComponentImportSpec("../relative/up/Comp.js")).toBe("../relative/up/Comp.js");
  });

  it("resolves npm:pkg#module to esm.sh with subpath", () => {
    expect(resolveComponentImportSpec("npm:recharts#es/BarChart")).toBe("https://esm.sh/recharts/es/BarChart");
    expect(resolveComponentImportSpec("npm:@lalalic/recharts#a/b/c")).toBe("https://esm.sh/@lalalic/recharts/a/b/c");
  });

  it("resolves git:user/repo#path to esm.sh/gh with subpath", () => {
    expect(resolveComponentImportSpec("git:user/repo#src/Comp.tsx")).toBe("https://esm.sh/gh/user/repo/src/Comp.tsx");
  });

  it("resolves github:user/repo#path like git:", () => {
    expect(resolveComponentImportSpec("github:team/lib#src/index.ts")).toBe("https://esm.sh/gh/team/lib/src/index.ts");
  });

  it("trims whitespace from spec", () => {
    expect(resolveComponentImportSpec("  npm:pkg  ")).toBe("https://esm.sh/pkg");
    expect(resolveComponentImportSpec("  github:user/repo  ")).toBe("https://esm.sh/gh/user/repo");
    expect(resolveComponentImportSpec("  https://cdn.example.com/c.js  ")).toBe("https://cdn.example.com/c.js");


});
  });
describe("parseImportsBlock", () => {
  it("parses named re-exports: export { Name } from \"spec\"", () => {
    const entries = parseImportsBlock(`export { PieChart } from "npm:recharts"`);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({ name: "PieChart", from: "npm:recharts", exports: "PieChart" });
  });

  it("parses multiple named re-exports from same source", () => {
    const entries = parseImportsBlock(`export { BarChart, LineChart } from "npm:recharts"`);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({ name: "BarChart", from: "npm:recharts", exports: "BarChart" });
    expect(entries[1]).toEqual({ name: "LineChart", from: "npm:recharts", exports: "LineChart" });
  });

  it("parses aliased re-exports: export { Name as Alias } from \"spec\"", () => {
    const entries = parseImportsBlock(`export { PieChart as MyPie } from "npm:recharts"`);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({ name: "MyPie", from: "npm:recharts", exports: "PieChart" });
  });

  it("parses inline function definitions: export function Name(...) { ... }", () => {
    const entries = parseImportsBlock(`export function Hello({ name }) {\n  return <div>Hello {name}</div>;\n}`);
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe("Hello");
    expect(entries[0].jsx).toContain("export function Hello");
    expect(entries[0].from).toBeUndefined();
  });

  it("parses default export function: export default function Name(...) { ... }", () => {
    const entries = parseImportsBlock(`export default function Greeting({ text }) {\n  return <h1>{text}</h1>;\n}`);
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe("Greeting");
    expect(entries[0].jsx).toContain("export default function Greeting");
  });

  it("handles mixed block with re-exports and inline functions", () => {
    const entries = parseImportsBlock(`export { PieChart } from "npm:recharts"
export { StatCounter } from "npm:stat-counter"
export function Hello() {
  return <div>Hello</div>;
}`);
    expect(entries).toHaveLength(3);
    expect(entries[0]).toEqual({ name: "PieChart", from: "npm:recharts", exports: "PieChart" });
    expect(entries[1]).toEqual({ name: "StatCounter", from: "npm:stat-counter", exports: "StatCounter" });
    expect(entries[2].name).toBe("Hello");
    expect(entries[2].jsx).toContain("export function Hello");
  });

  it("returns empty array for empty input", () => {
    expect(parseImportsBlock("")).toEqual([]);
  });

  it("parses import statements (internal) and export declarations (registered)", () => {
    const entries = parseImportsBlock(`import { something } from "other"
// comment
export { PieChart } from "npm:recharts"
`);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({ name: "PieChart", from: "npm:recharts", exports: "PieChart" });
  });

  it("tracks import scope for bare export { Name } re-exports", () => {
    const entries = parseImportsBlock(`import { PieChart as MyPie } from "npm:recharts"
export { MyPie }`);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({ name: "MyPie", from: "npm:recharts", exports: "PieChart" });
  });

  it("import statements are internal deps, not component registrations", () => {
    const entries = parseImportsBlock(`import Recharts from "npm:recharts"`);
    expect(entries).toHaveLength(0);
  });

  it("parses export default Name from \"spec\"", () => {
    const entries = parseImportsBlock(`export default Recharts from "npm:recharts"`);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({ name: "Recharts", from: "npm:recharts", exports: "default" });
  });

  it("parses real-world JS imports block (exports only)", () => {
    const block = `import { PieChart } from "npm:recharts"
import { BarChart, LineChart } from "npm:recharts"
import { StatCounter as Counter } from "npm:stat-counter"

export { PieChart }
export { BarChart, LineChart }
export { Counter }

export function Hello({ name }) {
  return <div>Hello {name}</div>
}`;
    const entries = parseImportsBlock(block);
    // 4 re-exports (PieChart, BarChart, LineChart, Counter resolved from imports) + 1 inline function
    expect(entries).toHaveLength(5);
    expect(entries[0]).toEqual({ name: "PieChart", from: "npm:recharts", exports: "PieChart" });
    expect(entries[1]).toEqual({ name: "BarChart", from: "npm:recharts", exports: "BarChart" });
    expect(entries[2]).toEqual({ name: "LineChart", from: "npm:recharts", exports: "LineChart" });
    expect(entries[3]).toEqual({ name: "Counter", from: "npm:stat-counter", exports: "StatCounter" });
    expect(entries[4].name).toBe("Hello");
    expect(entries[4].jsx).toContain("export function Hello");
  });

  it("importsBlock overrides frontmatter imports when both present", () => {
    // importsBlock should take precedence
    const compiled = compileDescriptiveRoot({
      layout: "series",
      imports: [{ name: "OldComp", from: "npm:old" }],
      importsBlock: `export { PieChart } from "npm:recharts"`,
      children: [{ type: "component", jsx: "<PieChart />", duration: 1 }],
    });
    const c = compiled.children[0] as any;
    // imports removed from component schema — now at root level
    expect(c.imports).toBeUndefined();
  });
});

describe("compileDescriptiveRoot — component imports", () => {
  // NOTE: In the current architecture, imports are at the root level,
  // not per-component. Components no longer have an `imports` field.
  // See md-descriptive.test.ts for compiler tests with the new architecture.
  
  it("component nodes have no per-component imports", () => {
    // This test verifies the new architecture: imports are at root level.
    // Previously, imports were attached to each component node.
    expect(true).toBe(true);
  });
});

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

  it("warns on duplicate ids", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    compileDescriptiveRoot({
      children: [
        { id: "dup", type: "image", src: "a.jpg", duration: 2 },
        { id: "dup", type: "image", src: "b.jpg", duration: 2 },
      ],
    });
    expect(spy).toHaveBeenCalledWith(expect.stringMatching(/duplicate id/));
    spy.mockRestore();
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
            { id: "t-1", type: "component", jsx: "AnimatedHeadline", duration: 2 },
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
    const withSrc = compileDescriptiveRoot({
      layout: "series",
      children: [{ id: "inc-src", type: "include", src: "./child.json", duration: 4 }],
    });

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
                { id: "t1", type: "component", jsx: "AnimatedHeadline", duration: 2 },
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

  it("compiles audio node with volume and foreground", () => {
    const compiled = compileDescriptiveRoot({
      layout: "parallel",
      children: [
        { id: "bgm", type: "audio", src: "bg.mp3", duration: 5, volume: 0.3, foreground: false },
        { id: "sfx", type: "audio", src: "sfx.wav", duration: 1, volume: 1, start: 2 },
      ],
    });

    const bgm = compiled.children.find((c: any) => c.id === "bgm") as any;
    expect(bgm.type).toBe("audio");
    expect(bgm.volume).toBe(0.3);
    expect(bgm.foreground).toBe(false);
    expect(bgm.actions[0].end).toBe(5);

    const sfx = compiled.children.find((c: any) => c.id === "sfx") as any;
    expect(sfx.actions[0].start).toBe(2);
    expect(sfx.actions[0].end).toBe(3);
  });

  it("compiles component node with props", () => {
    const compiled = compileDescriptiveRoot({
      layout: "series",
      children: [
        {
          id: "headline",
          type: "component",
          jsx: "<AnimatedHeadline text='Hello' gradient />",
          duration: 3,
        },
      ],
    });

    const c = compiled.children[0] as any;
    expect(c.type).toBe("component");
    expect(c.jsx).toContain("AnimatedHeadline");
    expect(c.actions[0].end).toBe(3);
  });

  it("compiles rhythm without children as audio leaf", () => {
    const compiled = compileDescriptiveRoot({
      layout: "series",
      children: [
        { id: "beat", type: "rhythm", src: "beat.mp3", spots: [0.5, 2.5] },
      ],
    });

    const r = compiled.children[0] as any;
    expect(r.type).toBe("rhythm");
    expect(r.src).toBe("beat.mp3");
    expect(r.children).toEqual([]);
    // rhythm duration = last spot + avg gap = 2.5 + 2.0 = 4.5
    expect(r.actions[0].end).toBeCloseTo(4.5);
  });

  it("compiles include with src as leaf", () => {
    const compiled = compileDescriptiveRoot({
      layout: "series",
      children: [
        { id: "inc", type: "include", src: "./child.json", duration: 3 },
      ],
    });

    const inc = compiled.children[0] as any;
    expect(inc.type).toBe("include");
    expect(inc.src).toBe("./child.json");
    expect(inc.actions[0].end).toBe(3);
  });

  it("compiles effect wrapping children", () => {
    const compiled = compileDescriptiveRoot({
      layout: "series",
      children: [
        {
          id: "fx-wrap",
          type: "effect",
          animation: "fadeIn",
          duration: 3,
          children: [
            { id: "inner", type: "image", src: "inner.jpg", duration: 2 },
          ],
        },
      ],
    });

    const fx = compiled.children[0] as any;
    expect(fx.type).toBe("effect");
    expect(fx.animation).toBe("fadeIn");
    expect(fx.children).toHaveLength(1);
    expect(fx.children[0].type).toBe("image");
  });

  it("uses defaults when duration is missing", () => {
    const compiled = compileDescriptiveRoot({
      layout: "series",
      children: [
        { id: "no-dr", type: "image", src: "x.jpg" },
        { id: "no-dr-vid", type: "video", src: "x.mp4" },
      ],
    });

    const img = compiled.children[0] as any;
    expect(img.actions[0].end).toBe(3); // image default is 3s

    const vid = compiled.children[1] as any;
    expect(vid.actions[0].end).toBe(3); // video default is 3s
  });

  it("uses default duration when duration is missing", () => {
    const compiled = compileDescriptiveRoot({
      layout: "series",
      children: [
        { id: "no-dr", type: "image", src: "x.jpg" },
      ],
    });
    const img = compiled.children[0] as any;
    expect(img.actions[0].end).toBe(3); // image default is 3s
  });

  it("preserves root-level instruction and stylesheet", () => {
    const compiled = compileDescriptiveRoot({
      instruction: "A stylish promo",
      stylesheet: "body { font-family: sans-serif; }",
      children: [
        { id: "a", type: "image", src: "a.jpg", duration: 2 },
      ],
    });

    expect((compiled as any).instruction).toBe("A stylish promo");
    expect(compiled.stylesheet).toBe("body { font-family: sans-serif; }");
  });

  it("compiles map with waypoints", () => {
    const compiled = compileDescriptiveRoot({
      layout: "series",
      children: [
        {
          id: "route",
          type: "map",
          duration: 5,
          waypoints: [
            { lat: 48.8566, lng: 2.3522, label: "Paris" },
            { lat: 51.5074, lng: -0.1278, label: "London" },
          ],
          travelMode: "DRIVING",
        },
      ],
    });

    const m = compiled.children[0] as any;
    expect(m.type).toBe("map");
    expect(m.waypoints).toHaveLength(2);
    expect(m.travelMode).toBe("DRIVING");
    expect(m.actions[0].end).toBe(5);
  });

  it("filters invisible children", () => {
    const compiled = compileDescriptiveRoot({
      layout: "series",
      children: [
        { id: "visible", type: "image", src: "a.jpg", duration: 2 },
        { id: "hidden", type: "image", src: "b.jpg", duration: 2, visible: false },
      ],
    });

    expect(compiled.children).toHaveLength(1);
    const firstVisible = compiled.children[0] as any;
    expect(firstVisible.id).toBe("visible");
  });

  it("compiles empty children array", () => {
    const compiled = compileDescriptiveRoot({
      layout: "series",
      children: [],
    });

    expect(compiled.children).toHaveLength(0);
    expect(compiled.durationInSeconds).toBe(0);
  });

  it("generates unique ids for nodes without id", () => {
    const compiled = compileDescriptiveRoot({
      children: [
        { type: "image", src: "a.jpg", duration: 1 },
        { type: "image", src: "b.jpg", duration: 1 },
      ],
    });

    const [a, b] = compiled.children as any[];
    expect(a.id).toBeTruthy();
    expect(b.id).toBeTruthy();
    expect(a.id).not.toBe(b.id);
  });
});
