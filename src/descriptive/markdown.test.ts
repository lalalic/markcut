import { describe, expect, it } from "vitest";
import { parseMarkdownDescriptive } from "./markdown";
import { compileDescriptiveRoot } from "./compiler";

describe("parseMarkdownDescriptive", () => {
  it("compat mode infers type from src when omitted", () => {
    const doc = `# video\nlo:ser\n## Intro\n- cover.jpg dr:2\n- clip.mp4 sf:1 ea:4\n- bgm.mp3 dr:3 vol:0.6`;
    const parsed = parseMarkdownDescriptive(doc, { mode: "compatible" });

    const scene = parsed.children[0]! as any;
    expect(scene.type).toBe("scene");
    expect(scene.children[0]!!.type).toBe("image");
    expect(scene.children[1]!!.type).toBe("video");
    expect(scene.children[2]!!.type).toBe("audio");
  });

  it("compat mode infers enum keys without explicit key", () => {
    const doc = `# video\nser\n## Hook par\n- i cover.jpg dr:2\n## Journey ts fade 0.4\n- i a.jpg dr:2\n- i b.jpg dr:2`;
    const parsed = parseMarkdownDescriptive(doc, { mode: "compatible" });

    expect(parsed.layout).toBe("series");

    const hook = parsed.children[0]! as any;
    expect(hook.layout).toBe("parallel");

    const journey = parsed.children[1]! as any;
    expect(journey.layout).toBe("transitionSeries");
    expect(journey.transition).toBe("fade");
    expect(journey.transitionTime).toBe(0.4);
  });

  it("compat mode treats bare quoted string as script", () => {
    const doc = `# video\nlo:ser\n## Intro lo:par \"Set mood\"\n- v demo.mp4 \"Show the key feature\" dr:3`;
    const parsed = parseMarkdownDescriptive(doc, { mode: "compatible" });

    const scene = parsed.children[0]! as any;
    expect(scene.script).toBe("Set mood");

    const leaf = scene.children[0]!!;
    expect(leaf.script).toBe("Show the key feature");
  });

  it("supports nested scenes by heading depth", () => {
    const doc = `# video\nlo:ser\n## Parent\n- i p.jpg dr:2\n### Child\n- i c.jpg dr:1`;
    const parsed = parseMarkdownDescriptive(doc, { mode: "compatible" });

    const parent = parsed.children[0]! as any;
    expect(parent.type).toBe("scene");
    expect(parent.children).toHaveLength(2);

    const child = parent.children[1]!;
    expect(child.type).toBe("scene");
    expect(child.children[0]!.type).toBe("image");
  });

  it("reads scene metadata from lines below heading", () => {
    const doc = `# video\nlo:ser\n## Hook\nlayout:parallel instruction:"Fast opener" script:"Set mood"\n- i cover.jpg dr:2`;
    const parsed = parseMarkdownDescriptive(doc, { mode: "compatible" });

    const scene = parsed.children[0]! as any;
    expect(scene.type).toBe("scene");
    expect(scene.name).toBe("Hook");
    expect(scene.layout).toBe("parallel");
    expect(scene.instruction).toBe("Fast opener");
    expect(scene.script).toBe("Set mood");
    expect(scene.children[0]!!.type).toBe("image");
  });

  it("reads compatible scene metadata (bare enums, quoted script) below heading", () => {
    const doc = `# video\nlo:ser\n## Journey\nts fade 0.4 "Move through moments"\n- i a.jpg dr:2`;
    const parsed = parseMarkdownDescriptive(doc, { mode: "compatible" });

    const scene = parsed.children[0]! as any;
    expect(scene.layout).toBe("transitionSeries");
    expect(scene.transition).toBe("fade");
    expect(scene.transitionTime).toBe(0.4);
    expect(scene.script).toBe("Move through moments");
  });

  it("accepts full-word layout values", () => {
    const doc = `# video\nlo:series\n## Intro lo:parallel\n- parallel\n  - i p.jpg dr:2\n## Journey lo:transitionSeries fade 0.4\n- i a.jpg dr:2\n- i b.jpg dr:2`;
    const parsed = parseMarkdownDescriptive(doc, { mode: "compatible" });

    expect(parsed.layout).toBe("series");

    const intro = parsed.children[0]! as any;
    expect(intro.layout).toBe("parallel");
    expect(intro.children[0]!.type).toBe("parallel");

    const journey = parsed.children[1]! as any;
    expect(journey.layout).toBe("transitionSeries");
    expect(journey.transition).toBe("fade");
    expect(journey.transitionTime).toBe(0.4);
  });

  it("accepts full-word type tokens", () => {
    const doc = `# video\nlo:series\n## Intro lo:parallel\n- image cover.jpg dr:2\n- video clip.mp4 sf:1 ea:3\n- audio bgm.mp3 dr:3 vol:0.5\n- component dr:2 jsx:\"<AnimatedHeadline />\"\n- effect fadeIn\n  - image card.jpg dr:1\n- map dr:2 wp:[37.77,-122.41,\"SF\";34.05,-118.24,\"LA\"]`;
    const parsed = parseMarkdownDescriptive(doc, { mode: "compatible" });

    const scene = parsed.children[0]! as any;
    expect(scene.children[0]!!.type).toBe("image");
    expect(scene.children[1]!!.type).toBe("video");
    expect(scene.children[2]!!.type).toBe("audio");
    expect(scene.children[3]!!.type).toBe("component");
    expect(scene.children[4]!!.type).toBe("effect");
    expect(scene.children[5]!!.type).toBe("map");
  });

  it("accepts full-word keys and normalizes enum aliases in keyed values", () => {
    const doc = `# video\nlayout:ser width:1080 height:1920 fps:30\n## Intro layout:parallel instruction:\"desc\" script:\"narration\"\n- image src:cover.jpg duration:2`;
    const parsed = parseMarkdownDescriptive(doc, { mode: "compatible" });

    expect(parsed.layout).toBe("series");
    expect(parsed.width).toBe(1080);

    const intro = parsed.children[0]! as any;
    expect(intro.layout).toBe("parallel");
    expect(intro.instruction).toBe("desc");
    expect(intro.script).toBe("narration");

    const leaf = intro.children[0]!;
    expect(leaf.type).toBe("image");
    expect(leaf.src).toBe("cover.jpg");
    expect(leaf.duration).toBe(2);
  });

  it("parses root metadata: width, height, fps, theme", () => {
    const doc = `# video
w:1920 h:1080 fps:30 theme:neon lo:ser
## Scene
- i cover.jpg dr:2`;
    const parsed = parseMarkdownDescriptive(doc, { mode: "compatible" });

    expect(parsed.width).toBe(1920);
    expect(parsed.height).toBe(1080);
    expect(parsed.fps).toBe(30);
    expect(parsed.theme).toBe("neon");
    expect(parsed.layout).toBe("series");
  });

  it("parses root instruction and metadata fields", () => {
    const doc = `# video
inst:"A cool travel video" metadata:"summer 2026"
## Scene
- i a.jpg dr:2`;
    const parsed = parseMarkdownDescriptive(doc, { mode: "compatible" });

    expect(parsed.instruction).toBe("A cool travel video");
    expect(parsed.metadata).toBe("summer 2026");
  });

  it("parses strict mode correctly with key:value syntax", () => {
    const doc = `# video
width:1920 height:1080 fps:30 layout:series
## Scene
- image src:a.jpg duration:2`;
    const parsed = parseMarkdownDescriptive(doc, { mode: "strict" });

    expect(parsed.width).toBe(1920);
    expect(parsed.height).toBe(1080);
    expect(parsed.fps).toBe(30);
    expect(parsed.layout).toBe("series");

    const scene = parsed.children[0]! as any;
    expect(scene.children[0]!!.type).toBe("image");
    expect(scene.children[0]!!.src).toBe("a.jpg");
    expect(scene.children[0]!!.duration).toBe(2);
  });

  it("strict mode throws on unrecognized token", () => {
    const doc = `# video
## Scene
- image src:a.jpg duration:2 zoom`;
    expect(() => parseMarkdownDescriptive(doc, { mode: "strict" })).toThrow();
  });

  it("parses component nodes with props", () => {
    const doc = `# video
lo:ser
## Demo
- component dr:3 jsx:"<AnimatedHeadline text='Hello' gradient />"`;
    const parsed = parseMarkdownDescriptive(doc, { mode: "compatible" });

    const scene = parsed.children[0]! as any;
    const c = scene.children[0]!!;
    expect(c.type).toBe("component");
    expect(c.duration).toBe(3);
  });

  it("parses effect node with animation", () => {
    const doc = `# video
## Scene
- effect fadeIn
  - image src:card.jpg dr:1`;
    const parsed = parseMarkdownDescriptive(doc, { mode: "compatible" });

    const scene = parsed.children[0]! as any;
    const fx = scene.children[0]!!;
    expect(fx.type).toBe("effect");
    expect(fx.animation).toBe("fadeIn");
    expect(fx.children).toHaveLength(1);
    expect(fx.children[0]!.type).toBe("image");
  });

  it("parses map node with waypoints", () => {
    const doc = `# video
lo:ser
## Route
- map dr:4 wp:[37.77,-122.41,"SF";34.05,-118.24,"LA"]`;
    const parsed = parseMarkdownDescriptive(doc, { mode: "compatible" });

    const scene = parsed.children[0]! as any;
    const m = scene.children[0]!!;
    expect(m.type).toBe("map");
    expect(m.duration).toBe(4);
    expect(m.waypoints).toHaveLength(2);
    expect(m.waypoints[0].lat).toBe(37.77);
    expect(m.waypoints[0].label).toBe("SF");
    expect(m.waypoints[1].label).toBe("LA");
  });

  it("parses include node", () => {
    const doc = `# video
lo:ser
## Section
- include src:child.json dr:4`;
    const parsed = parseMarkdownDescriptive(doc, { mode: "compatible" });

    const scene = parsed.children[0]! as any;
    const inc = scene.children[0]!!;
    expect(inc.type).toBe("include");
    expect(inc.src).toBe("child.json");
    expect(inc.duration).toBe(4);
  });

  it("parses audio node", () => {
    const doc = `# video
lo:ser
## Scene
- audio src:bgm.mp3 dr:4 vol:0.5`;
    const parsed = parseMarkdownDescriptive(doc, { mode: "compatible" });

    const scene = parsed.children[0]! as any;
    const a = scene.children[0]!!;
    expect(a.type).toBe("audio");
    expect(a.src).toBe("bgm.mp3");
    expect(a.duration).toBe(4);
    expect(a.volume).toBe(0.5);
  });

  it("parses rhythm node", () => {
    const doc = `# video
lo:ser
## Beat
- rhythm src:track.mp3 dr:5`;
    const parsed = parseMarkdownDescriptive(doc, { mode: "compatible" });

    const scene = parsed.children[0]! as any;
    const r = scene.children[0]!!;
    expect(r.type).toBe("rhythm");
    expect(r.src).toBe("track.mp3");
    expect(r.duration).toBe(5);
  });

  it("parses quoted strings with special characters", () => {
    const doc = `# video
## Scene lo:par
- i a.jpg dr:2 script:"Special chars: spaces, #hash, &ampersand"`;
    const parsed = parseMarkdownDescriptive(doc, { mode: "compatible" });

    const scene = parsed.children[0]! as any;
    expect(scene.children[0]!!.script).toBe("Special chars: spaces, #hash, &ampersand");
  });

  it("handles empty input gracefully", () => {
    const parsed = parseMarkdownDescriptive("", { mode: "compatible" });
    expect(parsed.children).toEqual([]);
  });

  it("round-trips markdown → parse → compile", () => {
    const doc = `# video
w:1080 h:1920 fps:30 theme:minimal lo:ser
## Hook q:"Set the mood" inst:"Visual opening"
- i cover.jpg dr:3
- v clip.mp4 sf:1 ea:4
## End q:"Wrap up"
- i final.jpg dr:2`;

    const parsed = parseMarkdownDescriptive(doc, { mode: "compatible" });
    const compiled = compileDescriptiveRoot(parsed, { mode: "draft" });

    expect(compiled.type).toBe("root");
    expect(compiled.width).toBe(1080);
    expect(compiled.height).toBe(1920);
    expect((compiled as any).theme).toBe("minimal");
    expect(compiled.isSeries).toBe(true);
    expect(compiled.children).toHaveLength(2);

    const hook = compiled.children[0]! as any;
    expect(hook.type).toBe("scene");
    expect(hook.children).toHaveLength(2);
    expect((parsed.children[0]! as any).script).toBe("Set the mood");

    const end = compiled.children[1]! as any;
    expect(end.type).toBe("scene");
    expect(end.durationInSeconds).toBe(2);
  });

  describe("frontmatter", () => {
    it("parses scalar frontmatter keys into root attrs", () => {
      const doc = `---
width: 1080
height: 1920
fps: 30
theme: neon
---
# video
## Scene
- image src:a.jpg dr:1`;
      const parsed = parseMarkdownDescriptive(doc, { mode: "strict" });
      expect(parsed.width).toBe(1080);
      expect(parsed.height).toBe(1920);
      expect(parsed.fps).toBe(30);
      expect(parsed.theme).toBe("neon");
    });

    it("parses YAML array imports with from: and exports:", () => {
      const doc = `---
imports:
  - ComA:
      from: npm:stat-counter
      exports: default
  - ComB:
      from: github:foo/bar/src/Logo.tsx
  - ComC:
      from: https://cdn.example.com/banner.js
---
# video
## Demo
- component dr:2 jsx:"<ComA />"`;
      const parsed = parseMarkdownDescriptive(doc, { mode: "strict" });
      expect(parsed.imports).toBeDefined();
      expect(parsed.imports!.length).toBe(3);
      expect(parsed.imports![0]).toEqual({ name: "ComA", from: "npm:stat-counter", exports: "default" });
      expect(parsed.imports![1]).toEqual({ name: "ComB", from: "github:foo/bar/src/Logo.tsx" });
      expect(parsed.imports![2]).toEqual({ name: "ComC", from: "https://cdn.example.com/banner.js" });

      // Compiler resolves from: specs onto component nodes
      const compiled = compileDescriptiveRoot(parsed, { mode: "draft" });
      const scene = compiled.children[0]! as any;
      const c = scene.children[0]!!;
      expect((c as any).imports.ComA).toBe("https://esm.sh/stat-counter");
    });

    it("parses JSON array imports on a single line", () => {
      const doc = `---
imports: [{"name":"ComA","from":"npm:pkg"},{"name":"ComB","from":"npm:other"}]
---
# video
- component dr:1 jsx:"<ComA />"`;
      const parsed = parseMarkdownDescriptive(doc, { mode: "strict" });
      expect(parsed.imports).toEqual([
        { name: "ComA", from: "npm:pkg" },
        { name: "ComB", from: "npm:other" },
      ]);
    });

    it("parses YAML imports with inline jsx:", () => {
      const doc = `---
imports:
  - Badge:
      jsx: export default ({text}) => <span>{text}</span>
  - Card:
      from: npm:card
---
# video
## Demo
- component dr:1 jsx:"<Badge />"`;
      const parsed = parseMarkdownDescriptive(doc, { mode: "strict" });
      expect(parsed.imports).toBeDefined();
      expect(parsed.imports![0]).toEqual({
        name: "Badge",
        jsx: "export default ({text}) => <span>{text}</span>",
      });
      expect(parsed.imports![1]).toEqual({ name: "Card", from: "npm:card" });
    });

    it("supports ```jsx code blocks as import entries", () => {
      const doc = `---
width: 640
height: 480
---
# video
## Demo
- component dr:1 jsx:"<Hello />"

\`\`\`jsx Hello
export default function Hello({ value }) {
  return <div>{value}</div>;
}
\`\`\`
`;
      const parsed = parseMarkdownDescriptive(doc, { mode: "strict" });
      expect(parsed.imports).toBeDefined();
      const helloEntry = parsed.imports!.find((e) => e.name === "Hello");
      expect(helloEntry).toBeDefined();
      expect(helloEntry!.jsx).toContain("export default function Hello");
      expect(helloEntry!.from).toBeUndefined();

      // Compiler: jsx code block is an inline definition, not usage jsx
      const compiled = compileDescriptiveRoot(parsed, { mode: "draft" });
      const scene = compiled.children[0]! as any;
      const c = scene.children[0]!!;
      expect(c.imports).toBeDefined();
      expect(c.imports.Hello).toBe("__jsx__:Hello");
      expect(c.src).toBeUndefined();
    });

    it("does not treat unrelated ``` code blocks as components", () => {
      const doc = `# video
## Scene
- image src:a.jpg dr:1

\`\`\`bash
npm install foo
\`\`\`

\`\`\`jsx
export default function Unnamed() { return null; }
\`\`\`
`;
      const parsed = parseMarkdownDescriptive(doc, { mode: "strict" });
      // bash block ignored; jsx block without name also ignored
      expect(parsed.imports).toBeUndefined();
    });

    it("supports inline jsx: key on a component node (usage JSX)", () => {
      const doc = `# video
## Scene
- component dr:1 jsx:"<Foo />"`;
      const parsed = parseMarkdownDescriptive(doc, { mode: "strict" });
      const scene = parsed.children[0]! as any;
      const c = scene.children[0]!!;
      expect(c.jsx).toBe("<Foo />");
      expect(c.jsx).toContain("Foo");
    });

    it("component node can have jsx: only (no componentName)", () => {
      const doc = `# video
imports:[{"name":"Greeting","from":"npm:greeting"}]
## Scene
- component dr:1 jsx:"<Greeting name='World' />"`;
      const parsed = parseMarkdownDescriptive(doc, { mode: "strict" });
      const scene = parsed.children[0] as any;
      const c = scene.children[0];
      expect(c.jsx).toBe("<Greeting name='World' />");
      expect(c.jsx).toContain("Greeting");

      const compiled = compileDescriptiveRoot(parsed, { mode: "draft" });
      const compiledScene = compiled.children[0]! as any;
      const cc = compiledScene.children[0]!;
      expect(cc.jsx).toBe("<Greeting name='World' />");
      expect(cc.imports).toBeDefined();
      expect(cc.imports.Greeting).toBe("https://esm.sh/greeting");
    });

    it("imports in body root attrs also resolve (JSON array)", () => {
      const doc = `# video
imports:[{"name":"Logo","from":"npm:logo-pkg"}]
## Scene
- component dr:1 jsx:"<Logo />"`;
      const parsed = parseMarkdownDescriptive(doc, { mode: "strict" });
      expect(parsed.imports).toEqual([{ name: "Logo", from: "npm:logo-pkg" }]);

      const compiled = compileDescriptiveRoot(parsed, { mode: "draft" });
      const scene = compiled.children[0]! as any;
      expect(scene.children[0]!!.imports.Logo).toBe("https://esm.sh/logo-pkg");
    });

    // ── Import source types in frontmatter ─────────────────────────────────

    it("frontmatter imports with from:npm resolves to esm.sh", () => {
      const doc = `---
imports:
  - CompA:
      from: npm:some-pkg
---
# video
## Scene
- component dr:1 jsx:"<CompA />"`;
      const parsed = parseMarkdownDescriptive(doc);
      expect(parsed.imports![0]!.from).toBe("npm:some-pkg");
      const compiled = compileDescriptiveRoot(parsed, { mode: "draft" });
      expect((compiled.children[0]! as any).children[0]!.imports.CompA).toBe("https://esm.sh/some-pkg");
    });

    it("frontmatter imports with from:npm@version", () => {
      const doc = `---
imports:
  - Chart:
      from: npm:chart-js@4.5.0
---
# video
## Scene
- component dr:1 jsx:"<Chart />"
- component dr:1 jsx:"<Chart />"`;
      const parsed = parseMarkdownDescriptive(doc);
      expect(parsed.imports![0]!.from).toBe("npm:chart-js@4.5.0");
      const compiled = compileDescriptiveRoot(parsed, { mode: "draft" });
      const [byName, byJsx] = (compiled.children[0]! as any).children;
      expect(byName.imports.Chart).toBe("https://esm.sh/chart-js@4.5.0");
      expect(byJsx.imports.Chart).toBe("https://esm.sh/chart-js@4.5.0");
    });

    it("frontmatter imports with from:git:user/repo@branch/path", () => {
      const doc = `---
imports:
  - Badge:
      from: git:myorg/badge-component@master/src/Badge.tsx
---
# video
## Scene
- component dr:1 jsx:"<Badge />"`;
      const parsed = parseMarkdownDescriptive(doc);
      const compiled = compileDescriptiveRoot(parsed, { mode: "draft" });
      expect((compiled.children[0]! as any).children[0]!.imports.Badge).toBe(
        "https://esm.sh/gh/myorg/badge-component@master/src/Badge.tsx",
      );
    });

    it("frontmatter imports with from:github:user/repo", () => {
      const doc = `---
imports:
  - Logo:
      from: github:team/logo-assets
---
# video
## Scene
- component dr:1 jsx:"<Logo />"`;
      const parsed = parseMarkdownDescriptive(doc);
      const compiled = compileDescriptiveRoot(parsed, { mode: "draft" });
      expect((compiled.children[0]! as any).children[0]!.imports.Logo).toBe(
        "https://esm.sh/gh/team/logo-assets",
      );
    });

    it("frontmatter imports with from:https URL", () => {
      const doc = `---
imports:
  - Widget:
      from: https://cdn.example.com/widget.mjs
---
# video
## Scene
- component dr:1 jsx:"<Widget />"`;
      const parsed = parseMarkdownDescriptive(doc);
      const compiled = compileDescriptiveRoot(parsed, { mode: "draft" });
      expect((compiled.children[0]! as any).children[0]!.imports.Widget).toBe(
        "https://cdn.example.com/widget.mjs",
      );
    });

    it("frontmatter imports with from:http URL", () => {
      const doc = `---
imports:
  - DevUI:
      from: http://localhost:5173/src/components/DevPanel.tsx
---
# video
## Scene
- component dr:1 jsx:"<DevUI />"`;
      const parsed = parseMarkdownDescriptive(doc);
      const compiled = compileDescriptiveRoot(parsed, { mode: "draft" });
      expect((compiled.children[0]! as any).children[0]!.imports.DevUI).toBe(
        "http://localhost:5173/src/components/DevPanel.tsx",
      );
    });

    it("frontmatter imports with from:local relative path", () => {
      const doc = `---
imports:
  - LocalComp:
      from: ./components/MyWidget.tsx
---
# video
## Scene
- component dr:1 jsx:"<LocalComp />"`;
      const parsed = parseMarkdownDescriptive(doc);
      const compiled = compileDescriptiveRoot(parsed, { mode: "draft" });
      expect((compiled.children[0]! as any).children[0]!.imports.LocalComp).toBe(
        "./components/MyWidget.tsx",
      );
    });

    it("frontmatter imports with from:absolute path", () => {
      const doc = `---
imports:
  - Helper:
      from: /Users/me/lib/helper.tsx
---
# video
## Scene
- component dr:1 jsx:"<Helper />"`;
      const parsed = parseMarkdownDescriptive(doc);
      const compiled = compileDescriptiveRoot(parsed, { mode: "draft" });
      expect((compiled.children[0]! as any).children[0]!.imports.Helper).toBe(
        "/Users/me/lib/helper.tsx",
      );
    });

    // ── Import entry variants in frontmatter ──────────────────────────────

    it("frontmatter import with from: + exports:", () => {
      const doc = `---
imports:
  - Counter:
      from: npm:stat-counter
      exports: StatCounter
---
# video
## Scene
- component dr:1 jsx:"<Counter />"`;
      const parsed = parseMarkdownDescriptive(doc);
      expect(parsed.imports![0]).toEqual({ name: "Counter", from: "npm:stat-counter", exports: "StatCounter" });
    });

    it("frontmatter import with jsx: only (inline def)", () => {
      const doc = `---
imports:
  - Greeting:
      jsx: export default ({name}) => <h1>{name}</h1>
---
# video
## Scene
- component dr:1 jsx:"<Greeting />"`;
      const parsed = parseMarkdownDescriptive(doc);
      expect(parsed.imports![0]!.name).toBe("Greeting");
      expect(parsed.imports![0]!.jsx).toContain("export default");
      expect(parsed.imports![0]!.from).toBeUndefined();
    });

    it("frontmatter import with from: + jsx: (both)", () => {
      const doc = `---
imports:
  - Card:
      from: npm:card-component
      jsx: |
        export default (props) => <div>{props.children}</div>
---
# video
## Scene
- component dr:1 jsx:"<Card />"`;
      const parsed = parseMarkdownDescriptive(doc);
      expect(parsed.imports![0]!.from).toBe("npm:card-component");
      expect(parsed.imports![0]!.jsx).toBeDefined();
      expect(parsed.imports![0]!.exports).toBeUndefined();
    });

    // ── Component node usage modes ────────────────────────────────────────

    it("component node with componentName only (resolved from imports)", () => {
      const doc = `---
imports:
  - StatBox:
      from: npm:stat-box
---
# video
## Scene
- component dr:2 jsx:"<StatBox value={10} label='Score' />"`;
      const parsed = parseMarkdownDescriptive(doc);
      const compiled = compileDescriptiveRoot(parsed, { mode: "draft" });
      const c = (compiled.children[0]! as any).children[0]!;
      expect(c.imports.StatBox).toBe("https://esm.sh/stat-box");
    });

    it("component node with jsx only (no componentName)", () => {
      const doc = `# video
## Scene
- component dr:2 jsx:"<Greeting name='World' />"`;
      const parsed = parseMarkdownDescriptive(doc, { mode: "strict" });
      const c = (parsed.children[0]! as any).children[0]!;
      expect(c.jsx).toBe("<Greeting name='World' />");
    });

    it("component node with jsx referencing imported components", () => {
      const doc = `---
imports:
  - Header:
      from: npm:header-lib
  - Footer:
      from: git:org/footer@main
---
# video
## Scene
- component dr:2 jsx:"<Header title='Page' /><Footer />"`;
      const parsed = parseMarkdownDescriptive(doc);
      const compiled = compileDescriptiveRoot(parsed, { mode: "draft" });
      const c = (compiled.children[0]! as any).children[0]!;
      expect(c.jsx).toBe("<Header title='Page' /><Footer />");
      expect(c.imports.Header).toBe("https://esm.sh/header-lib");
      expect(c.imports.Footer).toBe("https://esm.sh/gh/org/footer@main");
    });

    it("component node with both componentName and jsx", () => {
      const doc = `# video
## Scene
- component dr:2 jsx:"<Widget mode='dark' />"`;
      const parsed = parseMarkdownDescriptive(doc, { mode: "strict" });
      const c = (parsed.children[0]! as any).children[0]!;
      expect(c.jsx).toBe("<Widget mode='dark' />");
      // props merged into jsx expression
    });

    // ── Multiple imports + mixed component nodes ──────────────────────────

    it("multiple imports with mixed sources in one frontmatter", () => {
      const doc = `---
imports:
  - Counter:
      from: npm:counter-lib
      exports: default
  - Logo:
      from: github:org/design-system/src/Logo.tsx
  - Badge:
      jsx: export default ({label}) => <span>{label}</span>
  - Chart:
      from: https://cdn.example.com/chart.js
---
# video
## Scene
- component dr:1 jsx:"<Counter />" props:{value:5}
- component dr:1 jsx:"<Logo />"
- component dr:1 jsx:"<Badge />" props:{label:"New"}
- component dr:1 jsx:"<Chart />"`;
      const parsed = parseMarkdownDescriptive(doc);
      expect(parsed.imports).toHaveLength(4);
      const names = parsed.imports!.map((e) => e.name);
      expect(names).toEqual(["Counter", "Logo", "Badge", "Chart"]);

      const compiled = compileDescriptiveRoot(parsed, { mode: "draft" });
      const children = (compiled.children[0]! as any).children;
      expect(children[0]!.imports.Counter).toBe("https://esm.sh/counter-lib");
      expect(children[1]!.imports.Logo).toBe("https://esm.sh/gh/org/design-system/src/Logo.tsx");
      expect(children[2]!.src).toBeUndefined();
      expect(children[2]!.imports.Badge).toBe("__jsx__:Badge");
      expect(children[3]!.imports.Chart).toBe("https://cdn.example.com/chart.js");
    });

    it("jsx usage node with no frontmatter imports (host-registered fallback)", () => {
      const doc = `# video
## Scene
- component dr:2 jsx:"<AnimatedHeadline text='Hello' />"`;
      const parsed = parseMarkdownDescriptive(doc, { mode: "strict" });
      // No imports → jsx will reference host-registered components at runtime
      const compiled = compileDescriptiveRoot(parsed, { mode: "draft" });
      const c = (compiled.children[0]! as any).children[0]!;
      expect(c.jsx).toBe("<AnimatedHeadline text='Hello' />");
      expect(c.imports).toBeUndefined();
    });

    it("component node with pipe-delimited jsx body on bullet line", () => {
      // jsx can contain spaces, commas, quotes — the pipe | syntax on the bullet
      const doc = `# video
## Scene
- component dr:2 jsx:"<Counter value={42} suffix='%' />"`;
      const parsed = parseMarkdownDescriptive(doc, { mode: "strict" });
      const c = (parsed.children[0]! as any).children[0]!;
      expect(c.jsx).toBe("<Counter value={42} suffix='%' />");
    });

    it("empty frontmatter (just --- line pairs) is ignored", () => {
      const doc = `---
---
# video
## Scene
- image src:a.jpg dr:1`;
      const parsed = parseMarkdownDescriptive(doc, { mode: "strict" });
      expect(parsed.imports).toBeUndefined();
    });
  });
});
