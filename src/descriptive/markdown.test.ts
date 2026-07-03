import { describe, expect, it } from "vitest";
import { parseMarkdownDescriptive } from "./markdown";

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
});
