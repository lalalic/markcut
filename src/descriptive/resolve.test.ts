import { describe, expect, it } from "vitest";
import { resolveMediaDurations } from "./resolve";
import type { DescriptiveRoot } from "./compiler";

describe("resolveMediaDurations", () => {
  it("returns clone without mutating original", async () => {
    const root: DescriptiveRoot = {
      layout: "series",
      children: [
        { type: "video", src: "nonexistent.mp4", duration: 5 },
      ],
    };
    const result = await resolveMediaDurations(root);
    expect(result).not.toBe(root);
    expect(result.children[0]!.duration).toBe(5);
  });

  it("skips nodes that already have duration", async () => {
    const root: DescriptiveRoot = {
      layout: "series",
      children: [
        { type: "video", src: "anything.mp4", duration: 7 },
      ],
    };
    const result = await resolveMediaDurations(root);
    expect(result.children[0]!.duration).toBe(7);
  });

  it("skips nodes that already have endAt", async () => {
    const root: DescriptiveRoot = {
      layout: "series",
      children: [
        { type: "video", src: "anything.mp4", startFrom: 2, endAt: 5 },
      ],
    };
    const result = await resolveMediaDurations(root);
    expect(result.children[0]!.endAt).toBe(5);
    expect(result.children[0]!.duration).toBeUndefined();
  });
});
