import { describe, expect, it } from "vitest";
import { parseMarkdownDescriptive } from "./markdown";
import { compileDescriptiveRoot } from "./compiler";

describe("parseMarkdownDescriptive", () => {
  it("compat mode infers type from src when omitted", () => {
    const doc = `# video\nlo:ser\n## Intro\n- cover.jpg dr:2\n- clip.mp4 sf:1 ea:4\n- bgm.mp3 dr:3 vol:0.6`;
    const parsed = parseMarkdownDescriptive(doc, { mode: "compatible" });

    const scene = parsed.children[0] as any;
    expect(scene.type).toBe("scene");
    expect(scene.children[0].type).toBe("image");
    expect(scene.children[1].type).toBe("video");
    expect(scene.children[2].type).toBe("audio");
  });

  it("compat mode infers enum keys without explicit key", () => {
    const doc = `# video\nser\n## Hook par\n- i cover.jpg dr:2\n## Journey ts fade 0.4\n- i a.jpg dr:2\n- i b.jpg dr:2`;
    const parsed = parseMarkdownDescriptive(doc, { mode: "compatible" });

    expect(parsed.layout).toBe("series");

    const hook = parsed.children[0] as any;
    expect(hook.layout).toBe("parallel");

    const journey = parsed.children[1] as any;
    expect(journey.layout).toBe("transitionSeries");
    expect(journey.transition).toBe("fade");
    expect(journey.transitionTime).toBe(0.4);
  });

  it("compat mode treats bare quoted string as script", () => {
    const doc = `# video\nlo:ser\n## Intro lo:par \"Set mood\"\n- v demo.mp4 \"Show the key feature\" dr:3`;
    const parsed = parseMarkdownDescriptive(doc, { mode: "compatible" });

    const scene = parsed.children[0] as any;
    expect(scene.script).toBe("Set mood");

    const leaf = scene.children[0];
    expect(leaf.script).toBe("Show the key feature");
  });

  it("supports nested scenes by heading depth", () => {
    const doc = `# video\nlo:ser\n## Parent\n- i p.jpg dr:2\n### Child\n- i c.jpg dr:1`;
    const parsed = parseMarkdownDescriptive(doc, { mode: "compatible" });

    const parent = parsed.children[0] as any;
    expect(parent.type).toBe("scene");
    expect(parent.children).toHaveLength(2);

    const child = parent.children[1];
    expect(child.type).toBe("scene");
    expect(child.children[0].type).toBe("image");
  });

  it("reads scene metadata from lines below heading", () => {
    const doc = `# video\nlo:ser\n## Hook\nlayout:parallel instruction:"Fast opener" script:"Set mood"\n- i cover.jpg dr:2`;
    const parsed = parseMarkdownDescriptive(doc, { mode: "compatible" });

    const scene = parsed.children[0] as any;
    expect(scene.type).toBe("scene");
    expect(scene.name).toBe("Hook");
    expect(scene.layout).toBe("parallel");
    expect(scene.instruction).toBe("Fast opener");
    expect(scene.script).toBe("Set mood");
    expect(scene.children[0].type).toBe("image");
  });

  it("reads compatible scene metadata (bare enums, quoted script) below heading", () => {
    const doc = `# video\nlo:ser\n## Journey\nts fade 0.4 "Move through moments"\n- i a.jpg dr:2`;
    const parsed = parseMarkdownDescriptive(doc, { mode: "compatible" });

    const scene = parsed.children[0] as any;
    expect(scene.layout).toBe("transitionSeries");
    expect(scene.transition).toBe("fade");
    expect(scene.transitionTime).toBe(0.4);
    expect(scene.script).toBe("Move through moments");
  });

  it("accepts full-word layout values", () => {
    const doc = `# video\nlo:series\n## Intro lo:parallel\n- parallel\n  - i p.jpg dr:2\n## Journey lo:transitionSeries fade 0.4\n- i a.jpg dr:2\n- i b.jpg dr:2`;
    const parsed = parseMarkdownDescriptive(doc, { mode: "compatible" });

    expect(parsed.layout).toBe("series");

    const intro = parsed.children[0] as any;
    expect(intro.layout).toBe("parallel");
    expect(intro.children[0].type).toBe("parallel");

    const journey = parsed.children[1] as any;
    expect(journey.layout).toBe("transitionSeries");
    expect(journey.transition).toBe("fade");
    expect(journey.transitionTime).toBe(0.4);
  });

  it("accepts full-word type tokens", () => {
    const doc = `# video\nlo:series\n## Intro lo:parallel\n- image cover.jpg dr:2\n- video clip.mp4 sf:1 ea:3\n- audio bgm.mp3 dr:3 vol:0.5\n- component AnimatedHeadline dr:2\n- effect fadeIn\n  - image card.jpg dr:1\n- map dr:2 wp:[37.77,-122.41,\"SF\";34.05,-118.24,\"LA\"]`;
    const parsed = parseMarkdownDescriptive(doc, { mode: "compatible" });

    const scene = parsed.children[0] as any;
    expect(scene.children[0].type).toBe("image");
    expect(scene.children[1].type).toBe("video");
    expect(scene.children[2].type).toBe("audio");
    expect(scene.children[3].type).toBe("component");
    expect(scene.children[4].type).toBe("effect");
    expect(scene.children[5].type).toBe("map");
  });

  it("accepts full-word keys and normalizes enum aliases in keyed values", () => {
    const doc = `# video\nlayout:ser width:1080 height:1920 fps:30\n## Intro layout:parallel instruction:\"desc\" script:\"narration\"\n- image src:cover.jpg duration:2`;
    const parsed = parseMarkdownDescriptive(doc, { mode: "compatible" });

    expect(parsed.layout).toBe("series");
    expect(parsed.width).toBe(1080);

    const intro = parsed.children[0] as any;
    expect(intro.layout).toBe("parallel");
    expect(intro.instruction).toBe("desc");
    expect(intro.script).toBe("narration");

    const leaf = intro.children[0];
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

    const scene = parsed.children[0] as any;
    expect(scene.children[0].type).toBe("image");
    expect(scene.children[0].src).toBe("a.jpg");
    expect(scene.children[0].duration).toBe(2);
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
- component componentName:AnimatedHeadline dr:3 props:{text:"Hello",gradient:true}`;
    const parsed = parseMarkdownDescriptive(doc, { mode: "compatible" });

    const scene = parsed.children[0] as any;
    const c = scene.children[0];
    expect(c.type).toBe("component");
    expect(c.componentName).toBe("AnimatedHeadline");
    expect(c.duration).toBe(3);
    expect(c.props).toEqual({ text: "Hello", gradient: true });
  });

  it("parses effect node with animation", () => {
    const doc = `# video
## Scene
- effect fadeIn
  - image src:card.jpg dr:1`;
    const parsed = parseMarkdownDescriptive(doc, { mode: "compatible" });

    const scene = parsed.children[0] as any;
    const fx = scene.children[0];
    expect(fx.type).toBe("effect");
    expect(fx.animation).toBe("fadeIn");
    expect(fx.children).toHaveLength(1);
    expect(fx.children[0].type).toBe("image");
  });

  it("parses map node with waypoints", () => {
    const doc = `# video
lo:ser
## Route
- map dr:4 wp:[37.77,-122.41,"SF";34.05,-118.24,"LA"]`;
    const parsed = parseMarkdownDescriptive(doc, { mode: "compatible" });

    const scene = parsed.children[0] as any;
    const m = scene.children[0];
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

    const scene = parsed.children[0] as any;
    const inc = scene.children[0];
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

    const scene = parsed.children[0] as any;
    const a = scene.children[0];
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

    const scene = parsed.children[0] as any;
    const r = scene.children[0];
    expect(r.type).toBe("rhythm");
    expect(r.src).toBe("track.mp3");
    expect(r.duration).toBe(5);
  });

  it("parses quoted strings with special characters", () => {
    const doc = `# video
## Scene lo:par
- i a.jpg dr:2 script:"Special chars: spaces, #hash, &ampersand"`;
    const parsed = parseMarkdownDescriptive(doc, { mode: "compatible" });

    const scene = parsed.children[0] as any;
    expect(scene.children[0].script).toBe("Special chars: spaces, #hash, &ampersand");
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

    const hook = compiled.children[0] as any;
    expect(hook.type).toBe("scene");
    expect(hook.children).toHaveLength(2);
    expect((parsed.children[0] as any).script).toBe("Set the mood");

    const end = compiled.children[1] as any;
    expect(end.type).toBe("scene");
    expect(end.durationInSeconds).toBe(2);
  });
});
