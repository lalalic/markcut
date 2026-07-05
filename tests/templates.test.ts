import { describe, it, expect } from "vitest";
import { parseMarkdownDescriptive } from "../src/descriptive/markdown";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const templates = [
  "courseware",
  "product-ad",
  "movie-review",
  "audiobook",
  "story-video",
  "travel-log",
];

describe("templates parse correctly", () => {
  for (const name of templates) {
    it(`parses ${name} template`, () => {
      const fx = readFileSync(resolve(__dirname, "..", "docs", "templates", `${name}.md`), "utf-8");
      const p = parseMarkdownDescriptive(fx);

      expect(p.width).toBeGreaterThan(0);
      expect(p.height).toBeGreaterThan(0);
      expect(p.layout).toBeDefined();
      // Templates always have scenes
      expect(p.children.length).toBeGreaterThan(0);
      // Every scene node should have children
      for (const scene of p.children) {
        expect(scene.type).toBe("scene");
        expect(scene.children.length).toBeGreaterThan(0);
      }
      // Templates define TTS CLI
      expect(p.tts).toBeDefined();
      if (p.tts) expect(typeof p.tts.cli).toBe("string");
    });
  }
});
