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
    expect((result.children[0] as any).endAt).toBe(5);
    expect((result.children[0] as any).duration).toBeUndefined();
  });

  it("handles skip regex", async () => {
    const root: DescriptiveRoot = {
      layout: "series",
      children: [
        { type: "video", src: "nonexistent.mp4" },
        { type: "image", src: "photo.jpg" },
      ],
    };
    const result = await resolveMediaDurations(root, { skip: /\.jpg$/ });
    // .jpg skipped, .mp4 tried but file doesn't exist so duration stays undefined
    expect(result.children[0]!.duration).toBeUndefined();
    expect(result.children[1]!.duration).toBeUndefined();
  });

  it("does not mutate original tree", async () => {
    const root: DescriptiveRoot = {
      layout: "series",
      children: [
        { type: "video", src: "nonexistent.mp4", duration: 5 },
      ],
    };
    const originalChildren = root.children[0];
    const result = await resolveMediaDurations(root);
    expect(result).not.toBe(root);
    expect(root.children[0]).toBe(originalChildren);
  });
});
