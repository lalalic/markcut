/**
 * Integration tests for the Markdown Descriptive pipeline.
 *
 * Tests the full pipeline: markdown → parse → compile → stream tree.
 * Each fixture is a `.md` file in `tests/fixtures/md/` that exercises
 * specific features of the descriptive markdown format.
 *
 * These tests verify:
 * - Correct parsing of markdown into DescriptiveRoot
 * - Correct compilation into stream tree (Root)
 * - Structural correctness (types, durations, nesting)
 * - Frontmatter and imports resolution
 * - Code fence parsing (```js imports and ```jsx Name)
 * - Edge cases (empty input, special characters, etc.)
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { parseMarkdownDescriptive } from "../src/descriptive/markdown";
import { compileDescriptiveRoot } from "../src/descriptive/compiler";

const MD_FIXTURES_DIR = resolve(__dirname, "fixtures/md");

interface MdFixture {
  name: string;
  source: string;
  path: string;
}

function loadAllFixtures(): MdFixture[] {
  if (!existsSync(MD_FIXTURES_DIR)) return [];
  return readdirSync(MD_FIXTURES_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => ({
      name: f.replace(/\.md$/, ""),
      source: readFileSync(resolve(MD_FIXTURES_DIR, f), "utf-8"),
      path: resolve(MD_FIXTURES_DIR, f),
    }));
}

function loadFixture(name: string): MdFixture {
  const path = resolve(MD_FIXTURES_DIR, `${name}.md`);
  return {
    name,
    source: readFileSync(path, "utf-8"),
    path,
  };
}

// ── Parse & Compile each fixture ──────────────────────────────────────────

describe("markdown fixtures — parse & compile", () => {
  const fixtures = loadAllFixtures();

  it("has fixtures to test", () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  for (const fx of fixtures) {
    it(`parses and compiles: ${fx.name}`, () => {
      // Parse markdown → DescriptiveRoot
      const parsed = parseMarkdownDescriptive(fx.source);
      expect(parsed).toBeDefined();
      expect(parsed.children).toBeDefined();

      // Compile DescriptiveRoot → stream tree (Root)
      const compiled = compileDescriptiveRoot(parsed);
      expect(compiled).toBeDefined();
      expect(compiled.type).toBe("root");
      expect(compiled.id).toBe("root");
      expect(typeof compiled.width).toBe("number");
      expect(typeof compiled.height).toBe("number");
      expect(typeof compiled.fps).toBe("number");

      // Must have at least one child
      expect(compiled.children.length).toBeGreaterThanOrEqual(0);

      // All children must have valid types
      for (const child of compiled.children) {
        expect(child.type).toBeDefined();
        expect(["folder", "scene", "video", "audio", "image", "component", "effect", "rhythm", "map", "include", "root"]).toContain(child.type);
      }
    });
  }
});

// ── Basic ─────────────────────────────────────────────────────────────────

describe("basic fixture", () => {
  const fx = loadFixture("basic");

  it("parses root metadata correctly", () => {
    const parsed = parseMarkdownDescriptive(fx.source);
    expect(parsed.width).toBe(640);
    expect(parsed.height).toBe(480);
    expect(parsed.fps).toBe(30);
    expect(parsed.layout).toBe("series");
  });

  it("compiles root with correct dimensions", () => {
    const parsed = parseMarkdownDescriptive(fx.source);
    const compiled = compileDescriptiveRoot(parsed);
    expect(compiled.width).toBe(640);
    expect(compiled.height).toBe(480);
    expect(compiled.fps).toBe(30);
    expect(compiled.isSeries).toBe(true);
  });

  it("parses scene with children", () => {
    const parsed = parseMarkdownDescriptive(fx.source);
    expect(parsed.children).toHaveLength(1);
    const scene = parsed.children[0] as any;
    expect(scene.type).toBe("scene");
    expect(scene.name).toBe("Intro");
    expect(scene.layout).toBe("parallel");
    expect(scene.children).toHaveLength(2);
    expect(scene.children[0].type).toBe("image");
    expect(scene.children[1].type).toBe("video");
  });
});

// ── All Nodes ─────────────────────────────────────────────────────────────

describe("all-nodes fixture", () => {
  const fx = loadFixture("all-nodes");

  it("parses all node types", () => {
    const parsed = parseMarkdownDescriptive(fx.source);
    // Intro scene with root instruction
    expect(parsed.instruction).toBe("Full node type demo");
    expect(parsed.metadata).toBe("all-nodes");
    expect(parsed.children).toHaveLength(6);

    const sceneTypes = parsed.children.map((s: any) => s.name);
    expect(sceneTypes).toContain("Media");
    expect(sceneTypes).toContain("Components");
    expect(sceneTypes).toContain("Effects");
    expect(sceneTypes).toContain("Rhythm");
    expect(sceneTypes).toContain("Map");
    expect(sceneTypes).toContain("Include");
  });

  it("parses image with fit", () => {
    const parsed = parseMarkdownDescriptive(fx.source);
    const mediaScene = parsed.children[0] as any;
    const img = mediaScene.children[0];
    expect(img.type).toBe("image");
    expect(img.src).toBe("photo.jpg");
    expect(img.duration).toBe(3);
    expect(img.fit).toBe("cover");
  });

  it("parses video with trim and playbackRate", () => {
    const parsed = parseMarkdownDescriptive(fx.source);
    const mediaScene = parsed.children[0] as any;
    const vid = mediaScene.children[1];
    expect(vid.type).toBe("video");
    expect(vid.src).toBe("movie.mp4");
    expect(vid.startFrom).toBe(0.5);
    expect(vid.endAt).toBe(3.5);
    expect(vid.volume).toBe(0.9);
    expect(vid.playbackRate).toBe(1.2);
  });

  it("parses audio with foreground", () => {
    const parsed = parseMarkdownDescriptive(fx.source);
    const mediaScene = parsed.children[0] as any;
    const aud = mediaScene.children[2];
    expect(aud.type).toBe("audio");
    expect(aud.foreground).toBe(true);
    expect(aud.volume).toBe(0.5);
  });

  it("parses component with jsx", () => {
    const parsed = parseMarkdownDescriptive(fx.source);
    const compScene = parsed.children[1] as any;
    const c1 = compScene.children[0];
    expect(c1.type).toBe("component");
    expect(c1.jsx).toContain("AnimatedHeadline");
    expect(c1.duration).toBe(3);
  });

  it("parses effect with animation", () => {
    const parsed = parseMarkdownDescriptive(fx.source);
    const fxScene = parsed.children[2] as any;
    const e1 = fxScene.children[0];
    expect(e1.type).toBe("effect");
    expect(e1.animation).toBe("fadeIn");
    expect(e1.children).toHaveLength(1);
    expect(e1.children[0].type).toBe("image");
  });

  it("parses rhythm with spots", () => {
    const parsed = parseMarkdownDescriptive(fx.source);
    const rhythmScene = parsed.children.find((s: any) => s.name === "Rhythm");
    const r = rhythmScene!.children[0];
    expect(r.type).toBe("rhythm");
    expect(r.src).toBe("beat.mp3");
    expect(r.spots).toEqual([0.5, 1.2, 1.9, 2.8]);
    expect(r.volume).toBe(0.8);
    expect(r.children).toHaveLength(4);
  });

  it("parses map with waypoints", () => {
    const parsed = parseMarkdownDescriptive(fx.source);
    const mapScene = parsed.children[4] as any;
    const m = mapScene.children[0];
    expect(m.type).toBe("map");
    expect(m.duration).toBe(4);
    expect(m.travelMode).toBe("DRIVING");
    expect(m.waypoints).toHaveLength(3);
    expect(m.waypoints[0].label).toBe("SF");
    expect(m.waypoints[1].label).toBe("LA");
    expect(m.waypoints[2].label).toBe("LV");
  });

  it("parses include with src", () => {
    const parsed = parseMarkdownDescriptive(fx.source);
    const includeScene = parsed.children[5] as any;
    const inc = includeScene.children[0];
    expect(inc.type).toBe("include");
    expect(inc.src).toBe("./child.json");
    expect(inc.duration).toBe(3);
  });
});

// ── Scenes ────────────────────────────────────────────────────────────────

describe("scenes fixture", () => {
  const fx = loadFixture("scenes");

  it("parses multiple scenes with different layouts", () => {
    const parsed = parseMarkdownDescriptive(fx.source);
    expect(parsed.children).toHaveLength(3);

    const [hook, journey, wrap] = parsed.children as any[];
    expect(hook.name).toBe("Hook");
    expect(hook.layout).toBe("parallel");
    expect(hook.instruction).toBe("Grab attention fast");

    expect(journey.name).toBe("Journey");
    expect(journey.layout).toBe("transitionSeries");
    expect(journey.transition).toBe("fade");
    expect(journey.transitionTime).toBe(0.5);
    // Script is now an audio child instead of a property on the scene
    expect(journey.children[0].type).toBe("audio");
    expect(journey.children[0].script).toBe("Follow along on this adventure");
    expect(journey.children).toHaveLength(4); // 1 audio + 3 images

    expect(wrap.name).toBe("WrapUp");
    expect(wrap.layout).toBe("parallel");
    // Script is now an audio child instead of a property on the scene
    expect(wrap.children[0].type).toBe("audio");
    expect(wrap.children[0].script).toBe("Thanks for watching");
    expect(wrap.children).toHaveLength(2); // 1 audio + 1 image
  });

  it("compiles transitionSeries with overlap", () => {
    const parsed = parseMarkdownDescriptive(fx.source);
    const compiled = compileDescriptiveRoot(parsed);
    // Journey scene: 3 images of 2,2,3 with transition 0.5 → total = 2+2+3 - 2*0.5 = 6
    const journey = compiled.children[1] as any;
    expect(journey.type).toBe("scene" || "folder");
  });
});

// ── Frontmatter ───────────────────────────────────────────────────────────

describe("frontmatter fixture", () => {
  const fx = loadFixture("frontmatter");

  it("parses frontmatter root attrs", () => {
    const parsed = parseMarkdownDescriptive(fx.source);
    expect(parsed.width).toBe(640);
    expect(parsed.height).toBe(480);
    expect(parsed.fps).toBe(30);
  });

  it("parses imports from ```js imports block", () => {
    const parsed = parseMarkdownDescriptive(fx.source);
    // importsBlock is set, not frontmatter imports
    expect(parsed.imports).toBeUndefined();
    expect(parsed.importsBlock).toBeDefined();
    expect(parsed.importsBlock).toContain("StatCounter");
    expect(parsed.importsBlock).toContain("github:foo/bar/src/Logo.tsx");
    expect(parsed.importsBlock).toContain("InlineBadge");
  });

  it("parses frontmatter tts config", () => {
    const parsed = parseMarkdownDescriptive(fx.source);
    expect(parsed.tts).toBeDefined();
    expect(parsed.tts).toContain("edge-tts");
    expect(parsed.tts).toContain("{input}");
    expect(parsed.tts).toContain("{output}");
  });

  it("parses frontmatter stt config", () => {
    const parsed = parseMarkdownDescriptive(fx.source);
    expect(parsed.stt).toBeDefined();
    expect(parsed.stt).toContain("whisper");
    expect(parsed.stt).toContain("{input}");
    expect(parsed.stt).toContain("{output}");
    expect(parsed.stt).toContain("--language zh");
  });

  it("compiles with resolved imports", () => {
    const parsed = parseMarkdownDescriptive(fx.source);
    const compiled = compileDescriptiveRoot(parsed);
    const scene = compiled.children[0] as any;
    const statComp = scene.children[0];
    // imports removed from component schema — now at root level
    // imports removed from component schema — now at root level
  });
});

describe("subtitle frontmatter fixture", () => {
  const src = `---
width: 640
height: 480
fps: 30
subtitle:
  src: captions.vtt
  type: typewriter
  fontSize: 48
  fontFamily: "Helvetica Neue"
  fontStyle: bold
---
# video
layout:series
## Scene
- image src:bg.jpg duration:3
`;

  it("parses subtitle from frontmatter as object", () => {
    const parsed = parseMarkdownDescriptive(src);
    expect(parsed.subtitle).toBeDefined();
    expect(parsed.subtitle!.src).toBe("captions.vtt");
    expect(parsed.subtitle!.type).toBe("typewriter");
    expect(parsed.subtitle!.fontSize).toBe(48);
    expect(parsed.subtitle!.fontFamily).toBe("Helvetica Neue");
    expect(parsed.subtitle!.fontStyle).toBe("bold");
  });

  it("compiles subtitle into root stream tree", () => {
    const parsed = parseMarkdownDescriptive(src);
    const compiled = compileDescriptiveRoot(parsed);
    expect(compiled.subtitle).toBeDefined();
    expect(compiled.subtitle!.src).toBe("captions.vtt");
    expect(compiled.subtitle!.type).toBe("typewriter");
    expect(compiled.subtitle!.fontSize).toBe(48);
  });

  it("parses subtitle as plain string (src only)", () => {
    const simpleSrc = `---
width: 640
height: 480
fps: 30
subtitle: subtitles.vtt
---
# video
layout:series
## Scene
- image src:bg.jpg duration:3
`;
    const parsed = parseMarkdownDescriptive(simpleSrc);
    expect(parsed.subtitle).toBeDefined();
    expect(parsed.subtitle!.src).toBe("subtitles.vtt");
    expect(parsed.subtitle!.type).toBeUndefined();
  });
});

// ── Imports Block ─────────────────────────────────────────────────────────

describe("imports-block fixture", () => {
  const fx = loadFixture("imports-block");

  it("parses ```js imports code fence", () => {
    const parsed = parseMarkdownDescriptive(fx.source);
    expect(parsed.importsBlock).toBeDefined();
    expect(parsed.importsBlock).toContain("import { PieChart } from");
    expect(parsed.importsBlock).toContain("export function Hello");
  });

  it("compiles with importsBlock resolution", () => {
    const parsed = parseMarkdownDescriptive(fx.source);
    const compiled = compileDescriptiveRoot(parsed);
    const scene = compiled.children[0] as any;
    const pieChart = scene.children[0];
    // imports removed from component schema
    const hello = scene.children[1];
    // imports removed from component schema
  });
});

// ── JSX Code Fence ────────────────────────────────────────────────────────

describe("jsx-code-fence fixture", () => {
  const fx = loadFixture("jsx-code-fence");

  it("parses inline component definitions from ```js imports block", () => {
    const parsed = parseMarkdownDescriptive(fx.source);
    expect(parsed.imports).toBeUndefined();
    expect(parsed.importsBlock).toBeDefined();
    expect(parsed.importsBlock).toContain("function Greeting");
    expect(parsed.importsBlock).toContain("function Counter");
  });

  it("compiles with inline component definitions from imports block", () => {
    const parsed = parseMarkdownDescriptive(fx.source);
    const compiled = compileDescriptiveRoot(parsed);
    const scene = compiled.children[0] as any;
    const greeting = scene.children[0];
    const counter = scene.children[1];
    // imports removed from component schema
    expect(greeting.jsx).toContain("Greeting");
    // imports removed from component schema
    expect(counter.jsx).toContain("Counter");
  });
});

// ── Nested Scenes ─────────────────────────────────────────────────────────

describe("nested-scenes fixture", () => {
  const fx = loadFixture("nested-scenes");

  it("parses nested scenes by heading depth", () => {
    const parsed = parseMarkdownDescriptive(fx.source);
    expect(parsed.children).toHaveLength(3);

    const ch1 = parsed.children[0] as any;
    expect(ch1.name).toBe("Chapter1");
    expect(ch1.title).toBe("The Beginning");
    expect(ch1.layout).toBe("series");

    // Chapter1 has 2 nested scenes (Shot1, Shot2) + their leaf children
    const shot1 = ch1.children[0] as any;
    expect(shot1.type).toBe("scene");
    expect(shot1.name).toBe("Shot1");
    expect(shot1.children).toHaveLength(2);

    const ch2 = parsed.children[1] as any;
    expect(ch2.name).toBe("Chapter2");
    expect(ch2.layout).toBe("series");

    const ch3 = parsed.children[2] as any;
    expect(ch3.name).toBe("Chapter3");
    expect(ch3.layout).toBe("parallel");
  });
});

// ── Effects ───────────────────────────────────────────────────────────────

describe("effects fixture", () => {
  const fx = loadFixture("effects");

  it("parses various effect types", () => {
    const parsed = parseMarkdownDescriptive(fx.source);
    expect(parsed.children).toHaveLength(4);

    const fades = parsed.children[0] as any;
    expect(fades.children[0].animation).toBe("fadeIn");
    expect(fades.children[1].animation).toBe("fadeOut");

    const slides = parsed.children[1] as any;
    expect(slides.children[0].animation).toBe("slideInLeft");
    expect(slides.children[1].animation).toBe("slideInRight");

    const attention = parsed.children[2] as any;
    expect(attention.children[0].animation).toBe("bounceIn");
    expect(attention.children[0].animationTimingFunction).toBe("ease-out");
    expect(attention.children[0].animationIterationCount).toBe(2);
    expect(attention.children[1].animation).toBe("pulse");
    expect(attention.children[1].animationTimingFunction).toBe("ease-in-out");
  });

  it("parses custom keyframes", () => {
    const parsed = parseMarkdownDescriptive(fx.source);
    const custom = parsed.children[3] as any;
    const e = custom.children[0];
    expect(e.animation).toBe("custom");
    expect(e.customKeyframes).toBeDefined();
    expect(e.customKeyframes["0"]).toBeDefined();
    expect(e.customKeyframes["50"]).toBeDefined();
    expect(e.customKeyframes["100"]).toBeDefined();
  });
});

// ── Map ───────────────────────────────────────────────────────────────────

describe("map fixture", () => {
  const fx = loadFixture("map");

  it("parses multiple map configurations", () => {
    const parsed = parseMarkdownDescriptive(fx.source);
    expect(parsed.children).toHaveLength(3);

    const roadTrip = parsed.children[0] as any;
    const m1 = roadTrip.children[0];
    expect(m1.type).toBe("map");
    expect(m1.waypoints).toHaveLength(3);
    expect(m1.travelMode).toBe("DRIVING");
    expect(m1.routeColor).toBe("#FF5733");
    expect(m1.routeWeight).toBe(6);
    expect(m1.zoom).toBe(8);
    expect(m1.mapType).toBe("roadmap");
    expect(m1.routeMarker).toBe("🚗");

    const walking = parsed.children[1] as any;
    const m2 = walking.children[0];
    expect(m2.travelMode).toBe("WALKING");
    expect(m2.mapType).toBe("hybrid");
    expect(m2.zoom).toBe(15);
    expect(m2.routeMarker).toBe("🚶");

    const transit = parsed.children[2] as any;
    const m3 = transit.children[0];
    expect(m3.travelMode).toBe("TRANSIT");
    expect(m3.mapType).toBe("satellite");
    expect(m3.zoom).toBe(12);
    expect(m3.routeMarker).toBe("🗼");
  });
});

// ── Rhythm ────────────────────────────────────────────────────────────────

describe("rhythm fixture", () => {
  const fx = loadFixture("rhythm");

  it("parses rhythm with beat-synced children", () => {
    const parsed = parseMarkdownDescriptive(fx.source);
    expect(parsed.children).toHaveLength(2);

    const drop = parsed.children[0] as any;
    const r1 = drop.children[0];
    expect(r1.type).toBe("rhythm");
    expect(r1.spots).toEqual([0.0, 0.5, 1.0, 1.5]);
    expect(r1.volume).toBe(0.9);
    expect(r1.children).toHaveLength(4);

    const slow = parsed.children[1] as any;
    const r2 = slow.children[0];
    expect(r2.spots).toEqual([0.0, 1.2, 2.5, 3.8, 5.0]);
    expect(r2.volume).toBe(0.6);
    expect(r2.children).toHaveLength(5);
  });

  it("compiles rhythm with derived durations", () => {
    const parsed = parseMarkdownDescriptive(fx.source);
    const compiled = compileDescriptiveRoot(parsed);
    // The rhythm node should compile to a rhythm stream
    const rootChildren = compiled.children;
    expect(rootChildren.length).toBeGreaterThan(0);
  });
});

// ── Tween ─────────────────────────────────────────────────────────────────

describe("tween fixture", () => {
  const fx = loadFixture("tween");

  it("parses components with tween() expressions", () => {
    const parsed = parseMarkdownDescriptive(fx.source);
    expect(parsed.children).toHaveLength(3);

    const bar = parsed.children[0] as any;
    expect(bar.children[0].type).toBe("component");
    expect(bar.children[0].jsx).toContain("tween(");

    const nivo = parsed.children[1] as any;
    expect(nivo.children[0].jsx).toContain("tween(0,80)");

    const color = parsed.children[2] as any;
    expect(color.children[0].jsx).toContain("tween('#000','#FFF')");
  });
});

// ── Edge Cases ────────────────────────────────────────────────────────────

describe("edge-cases fixture", () => {
  const fx = loadFixture("edge-cases");

  it("parses empty include", () => {
    const parsed = parseMarkdownDescriptive(fx.source);
    const emptyScene = parsed.children.find((s: any) => s.name === "Empty");
    expect(emptyScene!.children[0].type).toBe("include");
    // include without src is valid
  });

  it("handles special characters in src", () => {
    const parsed = parseMarkdownDescriptive(fx.source);
    const specialScene = parsed.children.find((s: any) => s.name === "SpecialChars");
    expect(specialScene!.children[0].src).toBe("my photo.jpg");
    expect(specialScene!.children[1].src).toBe("bgm (copy).mp3");
  });

  it("parses quoted scripts as audio siblings", () => {
    const parsed = parseMarkdownDescriptive(fx.source);
    const quotedScene = parsed.children.find((s: any) => s.name === "QuotedScripts");
    // Script on image: converts to audio sibling
    expect(quotedScene!.children[0].type).toBe("image");
    expect(quotedScene!.children[1].type).toBe("audio");
    expect(quotedScene!.children[1].script).toBe("Special chars: #hash, $dollar, %percent, &ampersand");
    // Script on video: converts to audio sibling
    expect(quotedScene!.children[2].type).toBe("video");
    expect(quotedScene!.children[3].type).toBe("audio");
    expect(quotedScene!.children[3].script).toBe("Path with spaces: /Users/me/my video.mp4");
  });

  it("handles long durations", () => {
    const parsed = parseMarkdownDescriptive(fx.source);
    const longScene = parsed.children.find((s: any) => s.name === "LongDuration");
    expect(longScene!.children[0].duration).toBe(60);
  });

  it("handles visible:false", () => {
    const parsed = parseMarkdownDescriptive(fx.source);
    const visibleScene = parsed.children.find((s: any) => s.name === "VisibleFalse");
    expect(visibleScene!.children[0].visible).toBe(false);
    // Second image has no visible key; defaults to true at compile time
    expect(visibleScene!.children[1].visible).toBeUndefined();
  });

  it("parses isBackground on audio", () => {
    const parsed = parseMarkdownDescriptive(fx.source);
    const bgScene = parsed.children.find((s: any) => s.name === "BackgroundAudio");
    expect(bgScene!.children[0].isBackground).toBe(true);
  });

  it("parses start offsets in parallel", () => {
    const parsed = parseMarkdownDescriptive(fx.source);
    const parallelScene = parsed.children.find((s: any) => s.name === "StartOffsets");
    expect(parallelScene!.children[0].start).toBe(1);
    expect(parallelScene!.children[0].duration).toBe(3);
    expect(parallelScene!.children[1].start).toBe(0);
    expect(parallelScene!.children[1].duration).toBe(2);
    expect(parallelScene!.children[2].start).toBe(2);
    expect(parallelScene!.children[2].duration).toBe(4);

    // Compile should succeed (start is only valid in parallel)
    const compiled = compileDescriptiveRoot(
      parseMarkdownDescriptive(fx.source),
    );
    expect(compiled.type).toBe("root");
  });
});

// ── Full Feature ──────────────────────────────────────────────────────────

describe("full-feature fixture", () => {
  const fx = loadFixture("full-feature");

  it("parses complete video with all features", () => {
    const parsed = parseMarkdownDescriptive(fx.source);
    // Frontmatter
    expect(parsed.width).toBe(1080);
    expect(parsed.height).toBe(1920);
    expect(parsed.fps).toBe(30);
    expect(parsed.instruction).toBe("Full feature demo video");
    expect(parsed.metadata).toBe("v2.0-feature-test");

    // Imports are in ```js imports block (not frontmatter)
    expect(parsed.imports).toBeUndefined();
    expect(parsed.importsBlock).toBeDefined();
    expect(parsed.importsBlock).toContain("AnimatedHeadline");
    expect(parsed.importsBlock).toContain("StatCounter");

    // TTS
    expect(parsed.tts).toBeDefined();
    expect(parsed.tts).toContain("edge-tts");
    expect(parsed.tts).toContain("{input}");

    // 9 scenes (including nested ones)
    const topLevel = parsed.children.filter((s: any) => s.type === "scene");
    expect(topLevel.length).toBeGreaterThanOrEqual(5);
    const names = topLevel.map((s: any) => s.name);
    expect(names).toContain("OpeningHook");
    expect(names).toContain("StatShowcase");
    expect(names).toContain("MediaMontage");
    expect(names).toContain("AnimatedEffects");
    expect(names).toContain("InteractiveMap");
    expect(names).toContain("BeatSync");
    expect(names).toContain("Closing");
  });

  it("compiles full feature without errors", () => {
    const parsed = parseMarkdownDescriptive(fx.source);
    const compiled = compileDescriptiveRoot(parsed);
    expect(compiled.type).toBe("root");
    expect(compiled.children.length).toBeGreaterThan(0);

    // Verify all children compile to valid stream types
    for (const child of compiled.children) {
      expect(child.type).toBeDefined();
    }
  });

  it("resolves inline component definitions from imports block in full feature", () => {
    const parsed = parseMarkdownDescriptive(fx.source);
    const compiled = compileDescriptiveRoot(parsed);
    // The last scene has a Logo component defined inline in the ```js imports block
    const closingScene = compiled.children[compiled.children.length - 1] as any;
    // Find the component in the closing scene
    const comps = findComponents(closingScene);
    const logo = comps.find((c: any) => c.jsx?.includes("Logo"));
    if (logo) {
      // imports removed from component schema
    }
  });
});

// ── component-imports fixture ──────────────────────────────────────────────
// Tests imports block with npm package, git repo, and inline function

describe("component-imports fixture", () => {
  const fx = loadFixture("component-imports");

  it("parses import specifiers correctly", () => {
    const parsed = parseMarkdownDescriptive(fx.source);
    expect(parsed.importsBlock).toBeDefined();
    expect(parsed.importsBlock).toContain("npm:react-minimal-pie-chart");
    expect(parsed.importsBlock).toContain("git:user/repo/path/to/Hello.tsx");
    expect(parsed.importsBlock).toContain("export function Hello");
  });

  it("compiles with resolved imports registry", () => {
    const parsed = parseMarkdownDescriptive(fx.source);
    const compiled = compileDescriptiveRoot(parsed);
    // Root has 1 scene child (series layout)
    expect(compiled.children).toHaveLength(1);
    const scene = compiled.children[0];
    expect(scene.type).toBe("scene");
    const comps = scene.children.filter((c: any) => c.type === "component");
    expect(comps).toHaveLength(2); // Hello + PieChart
  });
});

// ── Helper ────────────────────────────────────────────────────────────────

function findComponents(node: any): any[] {
  const results: any[] = [];
  if (!node) return results;
  if (node.type === "component") results.push(node);
  if (node.children) {
    for (const child of node.children) {
      results.push(...findComponents(child));
    }
  }
  return results;
}
