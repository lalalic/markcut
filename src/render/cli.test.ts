import { describe, expect, it } from "vitest";
import { parseArgs } from "./cli.mjs";

describe("parseArgs", () => {
  it("supports render without an aspect flag", () => {
    const args = parseArgs(["node", "markcut", "render", "input.md", "--output", "out/video.mp4"]);

    expect(args.command).toBe("render");
    expect(args.file).toBe("input.md");
    expect(args.output).toBe("out/video.mp4");
    expect(args).not.toHaveProperty("aspect");
  });
});
