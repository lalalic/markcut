import { describe, expect, it } from "vitest";
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
    expect(entries[0]).toEqual({ name: "PieChart", from: "npm:recharts" });
  });

  it("parses multiple named re-exports from same source", () => {
    const entries = parseImportsBlock(`export { BarChart, LineChart } from "npm:recharts"`);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({ name: "BarChart", from: "npm:recharts" });
    expect(entries[1]).toEqual({ name: "LineChart", from: "npm:recharts" });
  });

  it("parses aliased re-exports: export { Name as Alias } from \"spec\"", () => {
    const entries = parseImportsBlock(`export { PieChart as MyPie } from "npm:recharts"`);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({ name: "MyPie", from: "npm:recharts" });
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
    expect(entries[0]).toEqual({ name: "PieChart", from: "npm:recharts" });
    expect(entries[1]).toEqual({ name: "StatCounter", from: "npm:stat-counter" });
    expect(entries[2].name).toBe("Hello");
    expect(entries[2].jsx).toContain("export function Hello");
  });

  it("returns empty array for empty input", () => {
    expect(parseImportsBlock("")).toEqual([]);
  });

  it("ignores import statements and other non-export lines", () => {
    const entries = parseImportsBlock(`import { something } from "other"
// comment
export { PieChart } from "npm:recharts"
`);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({ name: "PieChart", from: "npm:recharts" });
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
    expect(c.imports).toBeDefined();
    expect(c.imports.PieChart).toBe("https://esm.sh/recharts");
    expect(c.imports.OldComp).toBeUndefined();
  });
});

describe("compileDescriptiveRoot — component imports", () => {
  it("resolves imports array onto component nodes", () => {
    const compiled = compileDescriptiveRoot({
      layout: "series",
      imports: [
        { name: "StatCounter", from: "npm:stat-counter" },
        { name: "Logo", from: "github:foo/bar/src/Logo.tsx" },
        { name: "Banner", from: "https://cdn.example.com/banner.js" },
      ],
      children: [
        { type: "component", jsx: "StatCounter", duration: 2 },
        { type: "component", jsx: "Logo", duration: 1 },
        { type: "component", jsx: "Banner", duration: 1 },
        // Unknown name stays src-less (registry fallback at runtime)
        { type: "component", jsx: "HostOnly", duration: 1 },
      ],
    });

    const [stat, logo, banner, host] = compiled.children as any[];
    expect(stat.imports.StatCounter).toBe("https://esm.sh/stat-counter");
    expect(logo.imports.Logo).toBe("https://esm.sh/gh/foo/bar/src/Logo.tsx");
    expect(banner.imports.Banner).toBe("https://cdn.example.com/banner.js");
    expect(host.imports).toBeDefined();
  });

  it("attaches resolved src from imports with jsx: (inline definition)", () => {
    const compiled = compileDescriptiveRoot({
      layout: "series",
      imports: [
        { name: "HelloComp", jsx: "export default function HelloComp(){return null}" },
      ],
      children: [
        { type: "component", jsx: "HelloComp", duration: 1 },
      ],
    });

    const c = compiled.children[0] as any;
    // inline jsx definitions don't have a URL src
    // c.src removed from schema
    expect(c.imports).toBeDefined();
    expect(c.imports.HelloComp).toBe("__jsx__:HelloComp");
  });

  it("component node jsx is usage JSX, not definition", () => {
    const compiled = compileDescriptiveRoot({
      layout: "series",
      imports: [
        { name: "ComA", from: "npm:com-a" },
        { name: "ComB", from: "npm:com-b" },
      ],
      children: [
        // usage JSX: references ComA and ComB from frontmatter imports
        { type: "component", jsx: "<ComA value={42} />", duration: 1 },
      ],
    });

    const c = compiled.children[0] as any;
    expect(c.jsx).toBe("<ComA value={42} />");
    expect(c.jsx).toBe("<ComA value={42} />");
    // imports map has both resolved URLs
    expect(c.imports).toBeDefined();
    expect(c.imports.ComA).toBe("https://esm.sh/com-a");
    expect(c.imports.ComB).toBe("https://esm.sh/com-b");
  });

  it("resolves imports nested inside scenes and containers", () => {
    const compiled = compileDescriptiveRoot({
      layout: "series",
      imports: [{ name: "Logo", from: "npm:logo" }],
      children: [
        {
          type: "scene",
          children: [
            { type: "component", jsx: "Logo", duration: 1 },
          ],
        },
      ],
    });

    const scene = compiled.children[0] as any;
    const logo = scene.children[0];
    expect(logo.imports.Logo).toBe("https://esm.sh/logo");
  });

  it("componentName is optional when jsx is set", () => {
    const compiled = compileDescriptiveRoot({
      layout: "series",
      imports: [
        { name: "Greeting", from: "npm:greeting" },
      ],
      children: [
        // no componentName, only jsx
        { type: "component", jsx: "<Greeting name='World' />", duration: 1 },
      ],
    });

    const c = compiled.children[0] as any;
    expect(c.jsx).toBe("<Greeting name='World' />");
    expect(c.imports.Greeting).toBe("https://esm.sh/greeting");
  });

  // ── Import source types ──────────────────────────────────────────────────

  it("import from:npm resolves to esm.sh", () => {
    const compiled = compileDescriptiveRoot({
      layout: "series",
      imports: [{ name: "A", from: "npm:pkg-name" }],
      children: [{ type: "component", jsx: "A", duration: 1 }],
    });
    expect((compiled.children[0] as any).imports.A).toBe("https://esm.sh/pkg-name");
  });

  it("import from:npm@version resolves with version", () => {
    const compiled = compileDescriptiveRoot({
      layout: "series",
      imports: [{ name: "A", from: "npm:react@18.2.0" }],
      children: [{ type: "component", jsx: "A", duration: 1 }],
    });
    expect((compiled.children[0] as any).imports.A).toBe("https://esm.sh/react@18.2.0");
  });

  it("import from:npm with subpath", () => {
    const compiled = compileDescriptiveRoot({
      layout: "series",
      imports: [{ name: "A", from: "npm:lodash-es/debounce" }],
      children: [{ type: "component", jsx: "A", duration: 1 }],
    });
    expect((compiled.children[0] as any).imports.A).toBe("https://esm.sh/lodash-es/debounce");
  });

  it("import from:git resolves to esm.sh/gh", () => {
    const compiled = compileDescriptiveRoot({
      layout: "series",
      imports: [{ name: "A", from: "git:user/repo" }],
      children: [{ type: "component", jsx: "A", duration: 1 }],
    });
    expect((compiled.children[0] as any).imports.A).toBe("https://esm.sh/gh/user/repo");
  });

  it("import from:git with branch and subpath", () => {
    const compiled = compileDescriptiveRoot({
      layout: "series",
      imports: [{ name: "A", from: "git:myorg/widget@main/src/Widget.tsx" }],
      children: [{ type: "component", jsx: "A", duration: 1 }],
    });
    expect((compiled.children[0] as any).imports.A).toBe("https://esm.sh/gh/myorg/widget@main/src/Widget.tsx");
  });

  it("import from:github resolves like git:", () => {
    const compiled = compileDescriptiveRoot({
      layout: "series",
      imports: [{ name: "A", from: "github:team/repo" }],
      children: [{ type: "component", jsx: "A", duration: 1 }],
    });
    expect((compiled.children[0] as any).imports.A).toBe("https://esm.sh/gh/team/repo");
  });

  it("import from:https passes through", () => {
    const compiled = compileDescriptiveRoot({
      layout: "series",
      imports: [{ name: "A", from: "https://cdn.example.com/lib/widget.mjs" }],
      children: [{ type: "component", jsx: "A", duration: 1 }],
    });
    expect((compiled.children[0] as any).imports.A).toBe("https://cdn.example.com/lib/widget.mjs");
  });

  it("import from:http passes through", () => {
    const compiled = compileDescriptiveRoot({
      layout: "series",
      imports: [{ name: "A", from: "http://localhost:3000/comp.js" }],
      children: [{ type: "component", jsx: "A", duration: 1 }],
    });
    expect((compiled.children[0] as any).imports.A).toBe("http://localhost:3000/comp.js");
  });

  it("import from:local path passes through", () => {
    const compiled = compileDescriptiveRoot({
      layout: "series",
      imports: [{ name: "A", from: "./components/Widget.jsx" }],
      children: [{ type: "component", jsx: "A", duration: 1 }],
    });
    expect((compiled.children[0] as any).imports.A).toBe("./components/Widget.jsx");
  });

  it("import from:absolute path passes through", () => {
    const compiled = compileDescriptiveRoot({
      layout: "series",
      imports: [{ name: "A", from: "/Users/me/project/Widget.js" }],
      children: [{ type: "component", jsx: "A", duration: 1 }],
    });
    expect((compiled.children[0] as any).imports.A).toBe("/Users/me/project/Widget.js");
  });

  // ── Import entry types ───────────────────────────────────────────────────

  it("import entry with exports: (named export)", () => {
    const compiled = compileDescriptiveRoot({
      layout: "series",
      imports: [{ name: "Counter", from: "npm:stat-counter", exports: "StatCounter" }],
      children: [{ type: "component", jsx: "Counter", duration: 1 }],
    });
    const c = compiled.children[0] as any;
    expect(c.imports.Counter).toBe("https://esm.sh/stat-counter");
    // exports is carried as resolved metadata; schema preserves it
  });

  it("import entry with jsx: only (inline definition)", () => {
    const compiled = compileDescriptiveRoot({
      layout: "series",
      imports: [{ name: "Badge", jsx: "export default ({text}) => <span>{text}</span>" }],
      children: [{ type: "component", jsx: "Badge", duration: 1 }],
    });
    const c = compiled.children[0] as any;
    // c.src removed from schema
    expect(c.imports).toBeDefined();
    expect(c.imports.Badge).toBe("__jsx__:Badge");
  });

  it("import entry with from: + exports: + jsx: (fully specified)", () => {
    const compiled = compileDescriptiveRoot({
      layout: "series",
      imports: [{
        name: "Widget",
        from: "npm:widget-lib",
        exports: "Widget",
        jsx: "export default ...",
      }],
      children: [{ type: "component", jsx: "Widget", duration: 1 }],
    });
    const c = compiled.children[0] as any;
    expect(c.imports.Widget).toBe("https://esm.sh/widget-lib");
    // When both from: and jsx: are present, src takes priority for loading.
    // imports is only populated with __jsx__: entries when no from: is set.
    expect(c.imports).toBeDefined();
    expect(c.imports.Widget).toBe("https://esm.sh/widget-lib"); // src wins
  });

  it("import entry with jsx: multi-line definition", () => {
    const compiled = compileDescriptiveRoot({
      layout: "series",
      imports: [{
        name: "Card",
        jsx: `export default function Card({title, children}) {\n  return <div><h2>{title}</h2>{children}</div>;\n}`,
      }],
      children: [{ type: "component", jsx: "Card", duration: 1 }],
    });
    const c = compiled.children[0] as any;
    expect(c.imports.Card).toBe("__jsx__:Card");
  });

  // ── Component node usage modes ──────────────────────────────────────────

  it("component node with componentName only (host-registered)", () => {
    const compiled = compileDescriptiveRoot({
      layout: "series",
      children: [
        { type: "component", jsx: "<AnimatedHeadline text='Hello' />", duration: 2 },
      ],
    });
    const c = compiled.children[0] as any;
    expect(c.jsx).toContain("AnimatedHeadline");
    expect(c.imports).toBeUndefined();
  });

  it("component node with componentName matched to import from:", () => {
    const compiled = compileDescriptiveRoot({
      layout: "series",
      imports: [{ name: "FancyChart", from: "npm:chart-component" }],
      children: [
        { type: "component", jsx: "<FancyChart data={[1,2,3]} />", duration: 1 },
      ],
    });
    const c = compiled.children[0] as any;
    expect(c.imports?.FancyChart).toBe("https://esm.sh/chart-component");
    expect(c.jsx).toBe("<FancyChart data={[1,2,3]} />");
  });

  it("component node with jsx only (no imports, inline)", () => {
    const compiled = compileDescriptiveRoot({
      layout: "series",
      children: [
        // jsx without imports: standalone expression (no external deps)
        { type: "component", jsx: "<div>Hello World</div>", duration: 1 },
      ],
    });
    const c = compiled.children[0] as any;
    expect(c.jsx).toBe("<div>Hello World</div>");
    expect(c.imports).toBeUndefined(); // no imports needed
  });

  it("component node with jsx and matching imports from frontmatter", () => {
    const compiled = compileDescriptiveRoot({
      layout: "series",
      imports: [
        { name: "Gauge", from: "npm:gauge-chart" },
        { name: "Table", from: "npm:data-table" },
      ],
      children: [
        { type: "component", jsx: "<Gauge value={75} />", duration: 1 },
      ],
    });
    const c = compiled.children[0] as any;
    expect(c.jsx).toBe("<Gauge value={75} />");
    // All imports are included for runtime scope
    expect(c.imports.Gauge).toBe("https://esm.sh/gauge-chart");
    expect(c.imports.Table).toBe("https://esm.sh/data-table");
  });

  it("component node with jsx referencing multiple imported components", () => {
    const compiled = compileDescriptiveRoot({
      layout: "series",
      imports: [
        { name: "Icon", from: "npm:icon-lib" },
        { name: "Tooltip", from: "npm:tooltip-lib" },
        { name: "Card", from: "github:team/card@main/Card.tsx" },
      ],
      children: [
        { type: "component", jsx: "<Card><Icon name='star' /><Tooltip text='Favorite'>Star</Tooltip></Card>", duration: 1 },
      ],
    });
    const c = compiled.children[0] as any;
    expect(c.imports.Icon).toBe("https://esm.sh/icon-lib");
    expect(c.imports.Tooltip).toBe("https://esm.sh/tooltip-lib");
    expect(c.imports.Card).toBe("https://esm.sh/gh/team/card@main/Card.tsx");
  });

  it("component node with both componentName and jsx (componentName is name, jsx is usage)", () => {
    const compiled = compileDescriptiveRoot({
      layout: "series",
      imports: [{ name: "Counter", from: "npm:counter" }],
      children: [
        { type: "component", jsx: "<Counter value={42} />", duration: 1 },
      ],
    });
    const c = compiled.children[0] as any;
    expect(c.imports.Counter).toBe("https://esm.sh/counter");
    expect(c.jsx).toBe("<Counter value={42} />");
  });

  it("component node with jsx referencing imports that have inline jsx definitions", () => {
    const compiled = compileDescriptiveRoot({
      layout: "series",
      imports: [
        { name: "LocalComp", jsx: "export default () => <div>Local</div>" },
        { name: "RemoteComp", from: "npm:remote" },
      ],
      children: [
        { type: "component", jsx: "<LocalComp /><RemoteComp />", duration: 1 },
      ],
    });
    const c = compiled.children[0] as any;
    expect(c.imports.LocalComp).toBe("__jsx__:LocalComp");
    expect(c.imports.RemoteComp).toBe("https://esm.sh/remote");
  });

  it("multiple component nodes share the same import registry", () => {
    const compiled = compileDescriptiveRoot({
      layout: "series",
      imports: [{ name: "Widget", from: "npm:widget" }],
      children: [
        { type: "component", jsx: "<Widget id={1} />", duration: 1 },
        { type: "component", jsx: "<Widget id={2} />", duration: 1 },
        { type: "component", jsx: "<Widget id={3} />", duration: 1 },
      ],
    });
    const [a, b, c] = compiled.children as any[];
    expect(a.imports.Widget).toBe("https://esm.sh/widget");
    expect(b.imports.Widget).toBe("https://esm.sh/widget");
    expect(c.imports.Widget).toBe("https://esm.sh/widget");
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
    }, { mode: "draft" });

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

  it("uses draft mode defaults when duration is missing", () => {
    const compiled = compileDescriptiveRoot({
      layout: "series",
      children: [
        { id: "no-dr", type: "image", src: "x.jpg" },
        { id: "no-dr-vid", type: "video", src: "x.mp4" },
      ],
    }, { mode: "draft" });

    const img = compiled.children[0] as any;
    expect(img.actions[0].end).toBe(3); // image default is 3s

    const vid = compiled.children[1] as any;
    expect(vid.actions[0].end).toBe(3); // video default is 3s
  });

  it("throws in strict mode when duration is missing", () => {
    expect(() =>
      compileDescriptiveRoot({
        layout: "series",
        children: [
          { id: "no-dr", type: "image", src: "x.jpg" },
        ],
      }, { mode: "strict" }),
    ).toThrow(/cannot resolve duration/i);
  });

  it("preserves root-level theme, instruction, and stylesheet", () => {
    const compiled = compileDescriptiveRoot({
      theme: "cinematic",
      instruction: "A stylish promo",
      stylesheet: "body { font-family: sans-serif; }",
      children: [
        { id: "a", type: "image", src: "a.jpg", duration: 2 },
      ],
    });

    expect((compiled as any).theme).toBe("cinematic");
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
