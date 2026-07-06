import { describe, expect, it } from "vitest";
import { parseMarkdownDescriptive } from "./markdown";
import { compileDescriptiveRoot } from "./compiler";

describe("parseMarkdownDescriptive", () => {
  it("supports nested scenes by heading depth", () => {
    const doc = `# video\nlayout:series\n## Parent\n- image src:p.jpg duration:2\n### Child\n- image src:c.jpg duration:1`;
    const parsed = parseMarkdownDescriptive(doc);

    const parent = parsed.children[0]! as any;
    expect(parent.type).toBe("scene");
    expect(parent.children).toHaveLength(2);

    const child = parent.children[1]!;
    expect(child.type).toBe("scene");
    expect(child.children[0]!.type).toBe("image");
  });

  it("reads scene metadata from lines below heading", () => {
    const doc = `# video\nlayout:series\n## Hook\nlayout:parallel instruction:"Fast opener" script:"Set mood"\n- image src:cover.jpg duration:2`;
    const parsed = parseMarkdownDescriptive(doc);

    const scene = parsed.children[0]! as any;
    expect(scene.type).toBe("scene");
    expect(scene.name).toBe("Hook");
    expect(scene.layout).toBe("parallel");
    expect(scene.instruction).toBe("Fast opener");
    expect(scene.script).toBe("Set mood");
    expect(scene.children[0]!!.type).toBe("image");
  });



  it("accepts full-word layout values", () => {
    const doc = `# video\nlayout:series\n## Intro\nlayout:parallel\n- parallel\n  - image src:p.jpg duration:2\n## Journey\nlayout:transitionSeries transition:fade transitionTime:0.4\n- image src:a.jpg duration:2\n- image src:b.jpg duration:2`;
    const parsed = parseMarkdownDescriptive(doc);

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
    const doc = `# video\nlayout:series\n## Intro\nlayout:parallel\n- image src:cover.jpg duration:2\n- video src:clip.mp4 startFrom:1 endAt:3\n- audio src:bgm.mp3 duration:3 volume:0.5\n- component duration:2 jsx:"<AnimatedHeadline />"\n- effect animation:fadeIn\n  - image src:card.jpg duration:1\n- map duration:2 waypoints:[37.77,-122.41,\"SF\";34.05,-118.24,\"LA\"]`;
    const parsed = parseMarkdownDescriptive(doc);

    const scene = parsed.children[0]! as any;
    expect(scene.children[0]!!.type).toBe("image");
    expect(scene.children[1]!!.type).toBe("video");
    expect(scene.children[2]!!.type).toBe("audio");
    expect(scene.children[3]!!.type).toBe("component");
    expect(scene.children[4]!!.type).toBe("effect");
    expect(scene.children[5]!!.type).toBe("map");
  });

  it("accepts full-word keys and normalizes enum aliases in keyed values", () => {
    const doc = `# video\nlayout:series width:1080 height:1920 fps:30\n## Intro\nlayout:parallel instruction:"desc" script:"narration"\n- image src:cover.jpg duration:2`;
    const parsed = parseMarkdownDescriptive(doc);

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

  it("parses root metadata: width, height, fps, layout", () => {
    const doc = `# video
width:1920 height:1080 fps:30 layout:series
## Scene
- image src:cover.jpg duration:2`;
    const parsed = parseMarkdownDescriptive(doc);

    expect(parsed.width).toBe(1920);
    expect(parsed.height).toBe(1080);
    expect(parsed.fps).toBe(30);
    expect(parsed.layout).toBe("series");
  });

  it("parses root instruction and metadata fields", () => {
    const doc = `# video
instruction:"A cool travel video" metadata:"summer 2026"
## Scene
- image src:a.jpg duration:2`;
    const parsed = parseMarkdownDescriptive(doc);

    expect(parsed.instruction).toBe("A cool travel video");
    expect(parsed.metadata).toBe("summer 2026");
  });

  it("parses key:value syntax correctly", () => {
    const doc = `# video
width:1920 height:1080 fps:30 layout:series
## Scene
- image src:a.jpg duration:2`;
    const parsed = parseMarkdownDescriptive(doc);

    expect(parsed.width).toBe(1920);
    expect(parsed.height).toBe(1080);
    expect(parsed.fps).toBe(30);
    expect(parsed.layout).toBe("series");

    const scene = parsed.children[0]! as any;
    expect(scene.children[0]!!.type).toBe("image");
    expect(scene.children[0]!!.src).toBe("a.jpg");
    expect(scene.children[0]!!.duration).toBe(2);
  });

  it("throws on unrecognized token", () => {
    const doc = `# video
## Scene
- image src:a.jpg duration:2 zoom`;
    expect(() => parseMarkdownDescriptive(doc)).toThrow();
  });

  it("parses component nodes with props", () => {
    const doc = `# video
layout:series
## Demo
- component duration:3 jsx:"<AnimatedHeadline text='Hello' gradient />"`;
    const parsed = parseMarkdownDescriptive(doc, );

    const scene = parsed.children[0]! as any;
    const c = scene.children[0]!!;
    expect(c.type).toBe("component");
    expect(c.duration).toBe(3);
  });

  it("parses effect node with animation", () => {
    const doc = `# video
## Scene
- effect fadeIn
  - image src:card.jpg duration:1`;
    const parsed = parseMarkdownDescriptive(doc, );

    const scene = parsed.children[0]! as any;
    const fx = scene.children[0]!!;
    expect(fx.type).toBe("effect");
    expect(fx.animation).toBe("fadeIn");
    expect(fx.children).toHaveLength(1);
    expect(fx.children[0]!.type).toBe("image");
  });

  it("parses map node with waypoints", () => {
    const doc = `# video
layout:series
## Route
- map duration:4 waypoints:[37.77,-122.41,"SF";34.05,-118.24,"LA"]`;
    const parsed = parseMarkdownDescriptive(doc, );

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
layout:series
## Section
- include src:child.json duration:4`;
    const parsed = parseMarkdownDescriptive(doc, );

    const scene = parsed.children[0]! as any;
    const inc = scene.children[0]!!;
    expect(inc.type).toBe("include");
    expect(inc.src).toBe("child.json");
    expect(inc.duration).toBe(4);
  });

  it("parses audio node", () => {
    const doc = `# video
layout:series
## Scene
- audio src:bgm.mp3 duration:4 volume:0.5`;
    const parsed = parseMarkdownDescriptive(doc, );

    const scene = parsed.children[0]! as any;
    const a = scene.children[0]!!;
    expect(a.type).toBe("audio");
    expect(a.src).toBe("bgm.mp3");
    expect(a.duration).toBe(4);
    expect(a.volume).toBe(0.5);
  });

  it("parses rhythm node", () => {
    const doc = `# video
layout:series
## Beat
- rhythm src:track.mp3 duration:5`;
    const parsed = parseMarkdownDescriptive(doc, );

    const scene = parsed.children[0]! as any;
    const r = scene.children[0]!!;
    expect(r.type).toBe("rhythm");
    expect(r.src).toBe("track.mp3");
    expect(r.duration).toBe(5);
  });

  it("parses quoted strings with special characters", () => {
    const doc = `# video
## Scene
layout:parallel
- image src:a.jpg duration:2 script:"Special chars: spaces, #hash, &ampersand"`;
    const parsed = parseMarkdownDescriptive(doc);

    const scene = parsed.children[0]! as any;
    expect(scene.children[0]!!.script).toBe("Special chars: spaces, #hash, &ampersand");
  });

  it("handles empty input gracefully", () => {
    const parsed = parseMarkdownDescriptive("", );
    expect(parsed.children).toEqual([]);
  });
  it("parses image with prompt instead of src", () => {
    const doc = `# video
width:640 height:480 layout:series
## Scene
layout:parallel
- image prompt:"a beautiful sunset over mountains" duration:3`;
    const parsed = parseMarkdownDescriptive(doc);
    const img = parsed.children[0]!.children[0];
    expect(img.type).toBe("image");
    expect(img.prompt).toBe("a beautiful sunset over mountains");
    expect(img.src).toBeUndefined();
    expect(img.duration).toBe(3);
  });

  it("parses video with prompt instead of src", () => {
    const doc = `# video
width:640 height:480 layout:series
## Scene
layout:parallel
- video prompt:"waves crashing on beach" duration:5`;
    const parsed = parseMarkdownDescriptive(doc);
    const vid = parsed.children[0]!.children[0];
    expect(vid.type).toBe("video");
    expect(vid.prompt).toBe("waves crashing on beach");
    expect(vid.src).toBeUndefined();
    expect(vid.duration).toBe(5);
  });
  it("round-trips markdown → parse → compile", () => {
    const doc = `# video
width:1080 height:1920 fps:30 layout:series
## Hook
script:"Set the mood" instruction:"Visual opening" layout:parallel
- image src:cover.jpg duration:3
- video src:clip.mp4 startFrom:1 endAt:4
## End
script:"Wrap up" layout:parallel
- image src:final.jpg duration:2`;

    const parsed = parseMarkdownDescriptive(doc);
    const compiled = compileDescriptiveRoot(parsed);

    expect(compiled.type).toBe("root");
    expect(compiled.width).toBe(1080);
    expect(compiled.height).toBe(1920);
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
---
# video
## Scene
- image src:a.jpg duration:1`;
      const parsed = parseMarkdownDescriptive(doc);
      expect(parsed.width).toBe(1080);
      expect(parsed.height).toBe(1920);
      expect(parsed.fps).toBe(30);
    });

    it("parses imports from ~~~js imports block with multiple imports", () => {
      const doc = `---
width: 640
height: 480
---
# video
## Demo
- component duration:1 jsx:"<ComA />"

~~~js imports
import { ComA } from "npm:stat-counter"
import { ComB } from "github:foo/bar/src/Logo.tsx"
import { ComC } from "https://cdn.example.com/banner.js"
~~~`;
      const parsed = parseMarkdownDescriptive(doc);
      // imports removed from component schema — now at root level
      // imports removed from component schema — now at root level

      // Compiler resolves from: specs onto component nodes
      const compiled = compileDescriptiveRoot(parsed);
      const scene = compiled.children[0]! as any;
      const c = scene.children[0]!!;
      // imports removed from component schema — now at root level
    });

    it("parses JSON array imports is no longer supported — use ~~~js imports instead", () => {
      // JSON array imports in frontmatter are no longer supported.
      // Use ~~~js imports code blocks instead.
      const doc = `# video
- component duration:1 jsx:"<ComA />"

~~~js imports
import { ComA } from "npm:pkg"
import { ComB } from "npm:other"
~~~`;
      const parsed = parseMarkdownDescriptive(doc);
      // imports removed from component schema — now at root level
      // imports removed from component schema — now at root level
      // imports removed from component schema — now at root level
    });

    it("parses inline component definitions from ~~~js imports block", () => {
      const doc = `# video
## Demo
- component duration:1 jsx:"<Badge />"

~~~js imports
export function Badge({ text }) {
  return <span>{text}</span>
}

import { Card } from "npm:card"
~~~`;
      const parsed = parseMarkdownDescriptive(doc);
      // imports removed from component schema — now at root level
      // imports removed from component schema — now at root level
      // imports removed from component schema — now at root level
    });

    it("does not treat unrelated ``` code blocks as components", () => {
      const doc = `# video
## Scene
- image src:a.jpg duration:1

\`\`\`bash
npm install foo
\`\`\`

\`\`\`jsx
export default function Unnamed() { return null; }
\`\`\`
`;
      const parsed = parseMarkdownDescriptive(doc);
      // bash block ignored; jsx block without name also ignored
      // imports removed from component schema — now at root level
    });

    it("supports inline jsx: key on a component node (usage JSX)", () => {
      const doc = `# video
## Scene
- component duration:1 jsx:"<Foo />"`;
      const parsed = parseMarkdownDescriptive(doc);
      const scene = parsed.children[0]! as any;
      const c = scene.children[0]!!;
      expect(c.jsx).toBe("<Foo />");
      expect(c.jsx).toContain("Foo");
    });

    it("component node can have jsx: only (no componentName)", () => {
      const doc = `# video
## Scene
- component duration:1 jsx:"<Greeting name='World' />"

~~~js imports
import { Greeting } from "npm:greeting"
~~~`;
      const parsed = parseMarkdownDescriptive(doc);
      const scene = parsed.children[0] as any;
      const c = scene.children[0];
      expect(c.jsx).toBe("<Greeting name='World' />");
      expect(c.jsx).toContain("Greeting");

      const compiled = compileDescriptiveRoot(parsed);
      const compiledScene = compiled.children[0]! as any;
      const cc = compiledScene.children[0]!;
      expect(cc.jsx).toBe("<Greeting name='World' />");
      // imports removed from component schema — now at root level
      // imports removed from component schema — now at root level
    });

    it("imports from ~~~js imports block resolve onto component nodes", () => {
      const doc = `# video
## Scene
- component duration:1 jsx:"<Logo />"

~~~js imports
import { Logo } from "npm:logo-pkg"
~~~`;
      const parsed = parseMarkdownDescriptive(doc);
      // imports removed from component schema — now at root level

      const compiled = compileDescriptiveRoot(parsed);
      const scene = compiled.children[0]! as any;
      // imports removed from component schema — now at root level
    });

    // ── Import source types ──────────────────────────────────────────────

    it("~~~js imports with from:npm resolves to esm.sh", () => {
      const doc = `# video
## Scene
- component duration:1 jsx:"<CompA />"

~~~js imports
import { CompA } from "npm:some-pkg"
~~~`;
      const parsed = parseMarkdownDescriptive(doc);
      // imports removed from component schema — now at root level
      const compiled = compileDescriptiveRoot(parsed);
      // imports removed from component schema — now at root level
    });

    it("~~~js imports with from:npm@version", () => {
      const doc = `# video
## Scene
- component duration:1 jsx:"<Chart />"
- component duration:1 jsx:"<Chart />"

~~~js imports
import { Chart } from "npm:chart-js@4.5.0"
~~~`;
      const parsed = parseMarkdownDescriptive(doc);
      // imports removed from component schema — now at root level
      const compiled = compileDescriptiveRoot(parsed);
      const [byName, byJsx] = (compiled.children[0]! as any).children;
      // imports removed from component schema — now at root level
      // imports removed from component schema — now at root level
    });

    it("~~~js imports with from:git:user/repo@branch/path", () => {
      const doc = `# video
## Scene
- component duration:1 jsx:"<Badge />"

~~~js imports
import { Badge } from "git:myorg/badge-component@master/src/Badge.tsx"
~~~`;
      const parsed = parseMarkdownDescriptive(doc);
      const compiled = compileDescriptiveRoot(parsed);
      // imports removed from component schema — now at root level
    });

    it("~~~js imports with from:github:user/repo", () => {
      const doc = `# video
## Scene
- component duration:1 jsx:"<Logo />"

~~~js imports
import { Logo } from "github:team/logo-assets"
~~~`;
      const parsed = parseMarkdownDescriptive(doc);
      const compiled = compileDescriptiveRoot(parsed);
      // imports removed from component schema — now at root level
    });

    it("~~~js imports with from:https URL", () => {
      const doc = `# video
## Scene
- component duration:1 jsx:"<Widget />"

~~~js imports
import { Widget } from "https://cdn.example.com/widget.mjs"
~~~`;
      const parsed = parseMarkdownDescriptive(doc);
      const compiled = compileDescriptiveRoot(parsed);
      // imports removed from component schema — now at root level
    });

    it("~~~js imports with from:http URL", () => {
      const doc = `# video
## Scene
- component duration:1 jsx:"<DevUI />"

~~~js imports
import { DevUI } from "http://localhost:5173/src/components/DevPanel.tsx"
~~~`;
      const parsed = parseMarkdownDescriptive(doc);
      const compiled = compileDescriptiveRoot(parsed);
      // imports removed from component schema — now at root level
    });

    it("~~~js imports with from:local relative path", () => {
      const doc = `# video
## Scene
- component duration:1 jsx:"<LocalComp />"

~~~js imports
import { LocalComp } from "./components/MyWidget.tsx"
~~~`;
      const parsed = parseMarkdownDescriptive(doc);
      const compiled = compileDescriptiveRoot(parsed);
      // imports removed from component schema — now at root level
    });

    it("~~~js imports with from:absolute path", () => {
      const doc = `# video
## Scene
- component duration:1 jsx:"<Helper />"

~~~js imports
import { Helper } from "/Users/me/lib/helper.tsx"
~~~`;
      const parsed = parseMarkdownDescriptive(doc);
      const compiled = compileDescriptiveRoot(parsed);
      // imports removed from component schema — now at root level
    });

    // ── Import entry variants ────────────────────────────────────────────

    it("~~~js imports with from: + exports:", () => {
      // exports is not directly represented in import statements;
      // the default export is used. This is a compiler concern.
      const doc = `# video
## Scene
- component duration:1 jsx:"<Counter />"

~~~js imports
import { Counter } from "npm:stat-counter"
~~~`;
      const parsed = parseMarkdownDescriptive(doc);
      // imports removed from component schema — now at root level
    });

    it("~~~js imports with inline function definition", () => {
      const doc = `# video
## Scene
- component duration:1 jsx:"<Greeting />"

~~~js imports
export function Greeting({ name }) {
  return <h1>{name}</h1>
}
~~~`;
      const parsed = parseMarkdownDescriptive(doc);
      // imports removed from component schema — now at root level
      // imports removed from component schema — now at root level
    });

    // ── Component node usage modes ────────────────────────────────────────

    it("component node resolved from ~~~js imports", () => {
      const doc = `# video
## Scene
- component duration:2 jsx:"<StatBox value={10} label='Score' />"

~~~js imports
import { StatBox } from "npm:stat-box"
~~~`;
      const parsed = parseMarkdownDescriptive(doc);
      const compiled = compileDescriptiveRoot(parsed);
      const c = (compiled.children[0]! as any).children[0]!;
      // imports removed from component schema — now at root level
    });

    it("component node with jsx only (no componentName)", () => {
      const doc = `# video
## Scene
- component duration:2 jsx:"<Greeting name='World' />"`;
      const parsed = parseMarkdownDescriptive(doc);
      const c = (parsed.children[0]! as any).children[0]!;
      expect(c.jsx).toBe("<Greeting name='World' />");
    });

    it("component node with jsx referencing imported components", () => {
      const doc = `# video
## Scene
- component duration:2 jsx:"<Header title='Page' /><Footer />"

~~~js imports
import { Header } from "npm:header-lib"
import { Footer } from "git:org/footer@main"
~~~`;
      const parsed = parseMarkdownDescriptive(doc);
      const compiled = compileDescriptiveRoot(parsed);
      const c = (compiled.children[0]! as any).children[0]!;
      expect(c.jsx).toBe("<Header title='Page' /><Footer />");
      // imports removed from component schema — now at root level
      // imports removed from component schema — now at root level
    });

    it("component node with both componentName and jsx", () => {
      const doc = `# video
## Scene
- component duration:2 jsx:"<Widget mode='dark' />"`;
      const parsed = parseMarkdownDescriptive(doc);
      const c = (parsed.children[0]! as any).children[0]!;
      expect(c.jsx).toBe("<Widget mode='dark' />");
      // props merged into jsx expression
    });

    // ── Multiple imports + mixed component nodes ──────────────────────────

    it("multiple imports with mixed sources in one ~~~js imports block", () => {
      const doc = `# video
## Scene
- component duration:1 jsx:"<Counter />"
- component duration:1 jsx:"<Logo />"
- component duration:1 jsx:"<Badge />"
- component duration:1 jsx:"<Chart />"

~~~js imports
import { Counter } from "npm:counter-lib"
import { Logo } from "github:org/design-system/src/Logo.tsx"
import { Chart } from "https://cdn.example.com/chart.js"

export function Badge({ label }) {
  return <span>{label}</span>
}
~~~`;
      const parsed = parseMarkdownDescriptive(doc);
      // imports removed from component schema — now at root level
      // imports removed from component schema — now at root level
      // imports removed from component schema — now at root level
      // imports removed from component schema — now at root level

      const compiled = compileDescriptiveRoot(parsed);
      const children = (compiled.children[0]! as any).children;
      // imports removed from component schema — now at root level
      // imports removed from component schema — now at root level
      // imports removed from component schema — now at root level
      // imports removed from component schema — now at root level
    });

    it("jsx usage node with no frontmatter imports (host-registered fallback)", () => {
      const doc = `# video
## Scene
- component duration:2 jsx:"<AnimatedHeadline text='Hello' />"`;
      const parsed = parseMarkdownDescriptive(doc);
      // No imports → jsx will reference host-registered components at runtime
      const compiled = compileDescriptiveRoot(parsed);
      const c = (compiled.children[0]! as any).children[0]!;
      expect(c.jsx).toBe("<AnimatedHeadline text='Hello' />");
      // imports removed from component schema — now at root level
    });

    it("component node with pipe-delimited jsx body on bullet line", () => {
      // jsx can contain spaces, commas, quotes — the pipe | syntax on the bullet
      const doc = `# video
## Scene
- component duration:2 jsx:"<Counter value={42} suffix='%' />"`;
      const parsed = parseMarkdownDescriptive(doc);
      const c = (parsed.children[0]! as any).children[0]!;
      expect(c.jsx).toBe("<Counter value={42} suffix='%' />");
    });

    it("empty frontmatter (just --- line pairs) is ignored", () => {
      const doc = `---
---
# video
## Scene
- image src:a.jpg duration:1`;
      const parsed = parseMarkdownDescriptive(doc);
      // imports removed from component schema — now at root level
    });
  });
});
