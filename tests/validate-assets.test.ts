import { describe, it, expect } from "vitest";
import {
  classifyAssetPath,
  collectTreeAssets,
  validateAssetsRelative,
} from "../src/render/validate-assets.mjs";

const BASE = "/proj/md";

describe("classifyAssetPath", () => {
  it("allows remote URIs", () => {
    expect(classifyAssetPath("https://x/y.png")).toBe("remote");
    expect(classifyAssetPath("http://x/y.mp4")).toBe("remote");
    expect(classifyAssetPath("data:image/png;base64,AAA")).toBe("remote");
    expect(classifyAssetPath("blob:https://x/id")).toBe("remote");
    expect(classifyAssetPath("file:///tmp/a.png")).toBe("remote");
  });

  it("flags root-absolute and absolute paths", () => {
    expect(classifyAssetPath("/Users/me/a.png")).toBe("root-absolute");
    expect(classifyAssetPath("/a/b.png")).toBe("root-absolute");
  });

  it("flags .. escapes", () => {
    expect(classifyAssetPath("../x.png")).toBe("escapes");
    expect(classifyAssetPath("../../x.png")).toBe("escapes");
  });

  it("accepts source-folder-relative paths", () => {
    expect(classifyAssetPath("assets/x.png")).toBe("relative");
    expect(classifyAssetPath(".markcut/generated/tts/a.mp3")).toBe("relative");
    expect(classifyAssetPath("a/b/c.png")).toBe("relative");
  });

  it("treats non-.vtt subtitle src as inline text (not a path)", () => {
    expect(classifyAssetPath("Hello world", { subtitle: true })).toBe("text");
    expect(classifyAssetPath("00:00:00.000 --> 00:00:02.000\nhi", { subtitle: true })).toBe("text");
    expect(classifyAssetPath("subs.vtt", { subtitle: true })).toBe("relative");
    expect(classifyAssetPath("subs.vtt?lang=en", { subtitle: true })).toBe("relative");
  });
});

describe("validateAssetsRelative", () => {
  const tree = {
    type: "root",
    subtitle: { src: ".markcut/sub/subtitles.vtt" },
    children: [
      { id: "bg", type: "image", src: "assets/bg.png" },
      { id: "clip", type: "video", src: "/Users/me/abs.mp4" },
      { id: "walk", type: "audio", src: "a/../../escape.mp3" },
      { id: "m", type: "map", waypoints: [{ media: "../outside.png" }] },
      { id: "sub", type: "subtitle", src: "caption text" },
      { id: "inc", type: "include", src: "../other.md" },
    ],
  };

  it("returns no errors when all assets are baseDir-relative", () => {
    const ok = {
      type: "root",
      subtitle: { src: ".markcut/sub/subtitles.vtt" },
      children: [
        { id: "bg", type: "image", src: "assets/bg.png" },
        { id: "clip", type: "video", src: ".markcut/generated/media/photo_1920x1080.jpg" },
        { id: "a", type: "audio", src: "assets/tts/1.mp3" },
        { id: "m", type: "map", waypoints: [{ media: "assets/thumb.png" }] },
      ],
    };
    expect(validateAssetsRelative(ok, BASE)).toEqual([]);
  });

  it("flags absolute, root-absolute and escaping assets with node id + field", () => {
    const errors = validateAssetsRelative(tree, BASE);
    // clip (root-absolute), walk (nested ..), m.waypoints[0].media (..),
    // inc.src (..) — subtitle text + bg are fine.
    expect(errors).toHaveLength(4);
    const joined = errors.join("\n");
    expect(joined).toContain('node "clip" (type: video) — field src = "/Users/me/abs.mp4"');
    expect(joined).toContain('node "walk" (type: audio)');
    expect(joined).toContain("waypoints[0].media");
    expect(joined).toContain('node "inc" (type: include)');
    expect(joined).toContain("relative to the source folder");
  });

  it("skips include.src for descriptive trees (skipIncludeSrc)", () => {
    const errors = validateAssetsRelative(tree, BASE, { skipIncludeSrc: true });
    expect(errors).toHaveLength(3);
    expect(errors.join("\n")).not.toContain('node "inc"');
  });

  it("collects root.subtitle.src as an asset reference", () => {
    const refs = collectTreeAssets(tree);
    expect(refs.some((r) => r.field === "subtitle.src" && r.value === ".markcut/sub/subtitles.vtt")).toBe(true);
  });

  it("flags a bad root subtitle path", () => {
    const bad = { type: "root", subtitle: { src: "../shared/subs.vtt" }, children: [] };
    const errors = validateAssetsRelative(bad, BASE);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("subtitle.src");
  });

  it("is robust to empty trees", () => {
    expect(validateAssetsRelative({ type: "root" }, BASE)).toEqual([]);
    expect(validateAssetsRelative(null, BASE)).toEqual([]);
  });
});
