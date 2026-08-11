import { describe, expect, it } from "vitest";
import {
  DslError,
  LAYOUT_VALUES,
  TRANSITION_VALUES,
  isQuoted,
  unquote,
  splitTokens,
  parseNumberMaybe,
  parseWaypoints,
  parseProps,
  parseOnSpec,
  parseEffects,
  parseKeyValueTokens,
} from "../src/descriptive/dsl";

describe("dsl — string helpers", () => {
  it("isQuoted detects double-quoted tokens", () => {
    expect(isQuoted('"hello"')).toBe(true);
    expect(isQuoted('""')).toBe(true);
    expect(isQuoted("hello")).toBe(false);
    expect(isQuoted('"unterminated')).toBe(false);
    expect(isQuoted('"')).toBe(false);
  });

  it("unquote strips surrounding double quotes", () => {
    expect(unquote('"hello"')).toBe("hello");
    expect(unquote("hello")).toBe("hello");
    expect(unquote('""')).toBe("");
  });
});

describe("dsl — splitTokens", () => {
  it("splits on whitespace", () => {
    expect(splitTokens("a b c")).toEqual(["a", "b", "c"]);
  });

  it("keeps quoted spans together", () => {
    expect(splitTokens('a "b c" d')).toEqual(["a", '"b c"', "d"]);
  });

  it("keeps curly-brace groups together", () => {
    expect(splitTokens('subtitle:{fontSize:"20px"}')).toEqual(['subtitle:{fontSize:"20px"}']);
  });

  it("keeps bracket groups together", () => {
    expect(splitTokens("effects:[fadeIn, bounceIn]")).toEqual(["effects:[fadeIn, bounceIn]"]);
  });

  it("keeps paren groups together", () => {
    expect(splitTokens("on:(start, slide1.current=1)")).toEqual(["on:(start, slide1.current=1)"]);
  });

  it("handles nested brackets", () => {
    expect(splitTokens("a:[1,[2,3]] b")).toEqual(["a:[1,[2,3]]", "b"]);
  });

  it("collapses runs of whitespace", () => {
    expect(splitTokens("a    b\tc")).toEqual(["a", "b", "c"]);
  });

  it("returns empty array for blank input", () => {
    expect(splitTokens("   ")).toEqual([]);
  });
});

describe("dsl — parseNumberMaybe", () => {
  it("parses integers", () => {
    expect(parseNumberMaybe("42")).toBe(42);
  });

  it("parses floats", () => {
    expect(parseNumberMaybe("3.14")).toBe(3.14);
  });

  it("parses negative numbers", () => {
    expect(parseNumberMaybe("-5")).toBe(-5);
  });

  it("parses booleans", () => {
    expect(parseNumberMaybe("true")).toBe(true);
    expect(parseNumberMaybe("false")).toBe(false);
  });

  it("returns strings unchanged when not numeric", () => {
    expect(parseNumberMaybe("hello")).toBe("hello");
    expect(parseNumberMaybe("20px")).toBe("20px");
  });
});

describe("dsl — parseWaypoints", () => {
  it("parses multiple semicolon-separated waypoints", () => {
    expect(parseWaypoints('[40.7,-74.0,"NYC"; 34.05,-118.25,"LA"]')).toEqual([
      { lat: 40.7, lng: -74.0, label: "NYC" },
      { lat: 34.05, lng: -118.25, label: "LA" },
    ]);
  });

  it("parses waypoints without labels", () => {
    expect(parseWaypoints("[40.7,-74.0]")).toEqual([{ lat: 40.7, lng: -74.0, label: undefined }]);
  });

  it("parses waypoint media as a 4th field", () => {
    expect(parseWaypoints('[40.7,-74.0,"NYC","photo1.jpg"; 34.05,-118.25,"LA","clip.mp4"]')).toEqual([
      { lat: 40.7, lng: -74.0, label: "NYC", media: "photo1.jpg" },
      { lat: 34.05, lng: -118.25, label: "LA", media: "clip.mp4" },
    ]);
  });

  it("parses waypoint media without a label", () => {
    expect(parseWaypoints('[40.7,-74.0,"","img.jpg"]')).toEqual([
      { lat: 40.7, lng: -74.0, label: undefined, media: "img.jpg" },
    ]);
  });

  it("returns empty array for non-bracket input", () => {
    expect(parseWaypoints("not a list")).toEqual([]);
  });

  it("returns empty array for empty brackets", () => {
    expect(parseWaypoints("[]")).toEqual([]);
  });
});

describe("dsl — parseProps", () => {
  it("parses standard JSON objects", () => {
    expect(parseProps('{"a":1,"b":"x"}')).toEqual({ a: 1, b: "x" });
  });

  it("parses standard JSON arrays", () => {
    expect(parseProps("[1,2,3]")).toEqual([1, 2, 3]);
  });

  it("leniently parses unquoted keys", () => {
    expect(parseProps("{fontSize:20}")).toEqual({ fontSize: 20 });
  });

  it("leniently parses unquoted string values", () => {
    expect(parseProps('{name:John}')).toEqual({ name: "John" });
  });

  it("returns {} for non-object input", () => {
    expect(parseProps("hello")).toEqual({});
  });

  it("returns {} for unclosed object", () => {
    expect(parseProps("{a:1")).toEqual({});
  });

  it("parses tween() expressions into tagged specs", () => {
    expect(parseProps("{zoom:tween(6, 12)}")).toEqual({ zoom: { __tween: [6, 12] } });
  });

  it("parses tween() with easing", () => {
    expect(parseProps("{zoom:tween(6, 12, easeInOut)}")).toEqual({
      zoom: { __tween: [6, 12, "easeInOut"] },
    });
  });

  it("parses tween() nested inside objects and arrays", () => {
    expect(parseProps("{center:{lat:tween(37.0, 37.9), lng:120}, pov:{heading:tween(200, 320)}}")).toEqual({
      center: { lat: { __tween: [37.0, 37.9] }, lng: 120 },
      pov: { heading: { __tween: [200, 320] } },
    });
  });

  it("parses tween() with quoted string values (colors)", () => {
    expect(parseProps('{color:tween("#000000", "#FFFFFF", easeOut)}')).toEqual({
      color: { __tween: ["#000000", "#FFFFFF", "easeOut"] },
    });
  });

  it("keeps static numbers alongside tweens", () => {
    expect(parseProps("{zoom:tween(6, 12), tilt:45}")).toEqual({
      zoom: { __tween: [6, 12] },
      tilt: 45,
    });
  });
});

describe("dsl — parseOnSpec", () => {
  it("parses a two-argument on() spec", () => {
    expect(parseOnSpec("(start, slide1.current=1)")).toEqual({
      when: "start",
      state: "slide1.current=1",
    });
  });

  it("joins extra comma-separated state parts", () => {
    expect(parseOnSpec("(start, a=1, b=2)")).toEqual({
      when: "start",
      state: "a=1,b=2",
    });
  });

  it("returns undefined for non-paren input", () => {
    expect(parseOnSpec("start")).toBeUndefined();
  });

  it("returns undefined for single argument", () => {
    expect(parseOnSpec("(start)")).toBeUndefined();
  });

  it("returns undefined for empty parens", () => {
    expect(parseOnSpec("()")).toBeUndefined();
  });
});

describe("dsl — parseEffects", () => {
  it("parses a single effect", () => {
    expect(parseEffects("[fadeIn]")).toEqual(["fadeIn"]);
  });

  it("parses multiple comma-separated effects", () => {
    expect(parseEffects("[fadeIn, bounceIn]")).toEqual(["fadeIn", "bounceIn"]);
  });

  it("parses parameterized effects", () => {
    expect(parseEffects("[fadeIn(timingFunction:ease-out iterationCount:2)]")).toEqual([
      "fadeIn(timingFunction:ease-out iterationCount:2)",
    ]);
  });

  it("returns empty array for non-bracket input", () => {
    expect(parseEffects("fadeIn")).toEqual([]);
  });

  it("returns empty array for empty brackets", () => {
    expect(parseEffects("[]")).toEqual([]);
  });
});

describe("dsl — parseKeyValueTokens", () => {
  it("parses simple key:value pairs", () => {
    expect(parseKeyValueTokens(["src:a.mp4", "duration:2"])).toEqual({
      src: "a.mp4",
      duration: 2,
    });
  });

  it("coerces numeric and boolean values", () => {
    expect(parseKeyValueTokens(["duration:2", "loop:true", "volume:0.8"])).toEqual({
      duration: 2,
      loop: true,
      volume: 0.8,
    });
  });

  it("preserves raw string keys (jsx, prompt, instruction) verbatim", () => {
    expect(parseKeyValueTokens(['jsx:"<Foo/>"'])).toEqual({ jsx: "<Foo/>" });
    expect(parseKeyValueTokens(["instruction:hello world"])).toEqual({ instruction: "hello world" });
  });

  it("peeks next quoted token when value after colon is empty", () => {
    expect(parseKeyValueTokens(['instruction:', '"fast opener"'])).toEqual({
      instruction: "fast opener",
    });
  });

  it("parses inline object values as lenient JSON", () => {
    expect(parseKeyValueTokens(['subtitle:{fontSize:"20px"}'])).toEqual({
      subtitle: { fontSize: "20px" },
    });
  });

  it("dispatches on:(...) to parseOnSpec", () => {
    expect(parseKeyValueTokens(["on:(start, slide1.current=1)"])).toEqual({
      on: { when: "start", state: "slide1.current=1" },
    });
  });

  it("rejects the bare key(value) paren form (colon required)", () => {
    expect(() => parseKeyValueTokens(["on(start, slide1.current=1)"])).toThrow(DslError);
    expect(() => parseKeyValueTokens(["on(start, slide1.current=1)"])).toThrow(/unrecognized token/);
  });

  it("dispatches effects=[...] to parseEffects", () => {
    expect(parseKeyValueTokens(["effects:[fadeIn, bounceIn]"])).toEqual({
      effects: ["fadeIn", "bounceIn"],
    });
  });

  it("validates layout against the enum", () => {
    expect(parseKeyValueTokens(["layout:series"])).toEqual({ layout: "series" });
    expect(() => parseKeyValueTokens(["layout:bogus"])).toThrow(DslError);
    expect(() => parseKeyValueTokens(["layout:bogus"])).toThrow(/invalid layout value/);
  });

  it("validates transition against the enum", () => {
    expect(parseKeyValueTokens(["transition:fade"])).toEqual({ transition: "fade" });
    expect(() => parseKeyValueTokens(["transition:bogus"])).toThrow(/invalid transition value/);
  });

  it("parses merged transition:fade(0.5) into transition + transitionTime", () => {
    expect(parseKeyValueTokens(["transition:fade(0.5)"])).toEqual({
      transition: "fade",
      transitionTime: 0.5,
    });
  });

  it("throws DslError on unrecognized tokens", () => {
    expect(() => parseKeyValueTokens(["@@bogus@@"])).toThrow(DslError);
    expect(() => parseKeyValueTokens(["@@bogus@@"])).toThrow(/unrecognized token/);
  });

  it("includes line context in error messages when provided", () => {
    const ctx = { line: 8, lineText: "layout:bogus" };
    try {
      parseKeyValueTokens(["layout:bogus"], ctx);
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(DslError);
      const msg = (e as DslError).message;
      expect(msg).toContain("line 8");
      expect(msg).toContain("layout:bogus");
    }
  });

  it("includes token context in error messages", () => {
    try {
      parseKeyValueTokens(["layout:bogus"], { line: 1 });
      expect.fail("should have thrown");
    } catch (e) {
      expect((e as DslError).message).toContain('near "layout:bogus"');
    }
  });
});

describe("dsl — DslError", () => {
  it("formats a message with line and token context", () => {
    const err = new DslError("bad value", { line: 5, token: "foo", lineText: "foo bar" });
    expect(err.message).toContain("bad value");
    expect(err.message).toContain("line 5");
    expect(err.message).toContain('near "foo"');
    expect(err.message).toContain("foo bar");
    expect(err.name).toBe("DslError");
  });

  it("formats a message without context", () => {
    const err = new DslError("something broke");
    expect(err.message).toBe("something broke");
  });
});

describe("dsl — exported constants", () => {
  it("LAYOUT_VALUES contains the four layout types", () => {
    expect(LAYOUT_VALUES.has("series")).toBe(true);
    expect(LAYOUT_VALUES.has("parallel")).toBe(true);
    expect(LAYOUT_VALUES.has("transitionSeries")).toBe(true);
    expect(LAYOUT_VALUES.has("transition")).toBe(true);
  });

  it("TRANSITION_VALUES contains the five transition types", () => {
    expect(TRANSITION_VALUES.has("fade")).toBe(true);
    expect(TRANSITION_VALUES.has("slide")).toBe(true);
    expect(TRANSITION_VALUES.has("wipe")).toBe(true);
    expect(TRANSITION_VALUES.has("flip")).toBe(true);
    expect(TRANSITION_VALUES.has("clockWipe")).toBe(true);
  });
});
