import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { parseMarkdownDescriptive } from "../src/descriptive/markdown";
import { compileDescriptiveRoot } from "../src/descriptive/compiler";

const catalogPath = resolve(__dirname, "../docs/motion-capabilities.json");
const examplePath = resolve(__dirname, "../examples/motion-capabilities-9x16.md");
const capabilitySchema = z.object({
  name: z.string().min(1),
  category: z.enum(["cinematic-shot", "caption-motion", "data-motion"]),
  source: z.string().url(),
  version: z.string().min(1),
  license: z.string().min(1),
  aspectRatios: z.array(z.enum(["9:16", "16:9", "1:1"])).min(1),
  propsSchema: z.object({
    type: z.literal("object"),
    required: z.array(z.string()),
    properties: z.record(z.string(), z.object({ type: z.string() }).passthrough()),
  }),
  renderMode: z.enum(["native-component", "generated-asset"]),
  preview: z.string().min(1),
  verified: z.boolean(),
  provenance: z.string().min(1),
});

describe("motion capability catalog and vertical examples", () => {
  const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));

  it("records provenance, schemas, aspect ratios, render mode, previews, and verification", () => {
    expect(catalog.version).toBe(1);
    const capabilities = z.array(capabilitySchema).parse(catalog.capabilities);
    expect(capabilities).toHaveLength(6);
    expect(capabilities.every((item) => item.verified)).toBe(true);
    expect(capabilities.every((item) => item.aspectRatios.includes("9:16"))).toBe(true);
    expect(capabilities.every((item) => item.propsSchema.required.every((key) => key in item.propsSchema.properties))).toBe(true);
    expect(new Set(capabilities.map((item) => item.category))).toEqual(
      new Set(["cinematic-shot", "caption-motion", "data-motion"]),
    );
    expect(capabilities.map((item) => item.name)).toEqual([
      "CinematicPush",
      "TiltedPanelGlide",
      "LayeredCardReveal",
      "KineticCaption",
      "BarChartReveal",
      "MetricCountUp",
    ]);
    expect(catalog.notIntegrated[0]).toMatchObject({
      name: "srt-whiteboard-animation",
      version: expect.stringContaining("v1.0.0"),
      license: "MIT",
    });
    expect(catalog.notIntegrated.find((item: any) => item.name === "hyperframes-3d-motion-catalog-pieces")?.reason).toContain("GSAP");
  });

  it("resolves motion catalog and guide links from the installed Markcut skill", () => {
    const skillPath = resolve(__dirname, "../skills/markcut/SKILL.md");
    const source = readFileSync(skillPath, "utf8");
    const motionLinks = [...source.matchAll(/\]\(([^)]+motion-capabilities[^)]*)\)/g)];
    expect(motionLinks).toHaveLength(3);
    for (const [, relativePath] of motionLinks) {
      expect(relativePath).toBeDefined();
      expect(existsSync(resolve(skillPath, "..", relativePath!))).toBe(true);
    }
  });

  it("parses and compiles six independent 9:16 native component examples", () => {
    const source = readFileSync(examplePath, "utf8");
    const parsed = parseMarkdownDescriptive(source);
    const compiled = compileDescriptiveRoot(parsed);
    const nodes = [compiled as any];
    const components: any[] = [];
    while (nodes.length) {
      const node = nodes.pop()!;
      if (node.type === "component") components.push(node);
      if (node.children) nodes.push(...node.children);
    }

    expect(compiled.width).toBe(1080);
    expect(compiled.height).toBe(1920);
    expect(compiled.fps).toBe(30);
    expect(components).toHaveLength(6);
    for (const item of catalog.capabilities) {
      expect(parsed.importsBlock).toContain(`export function ${item.name}`);
      expect(components.some((node) => node.jsx.includes(`<${item.name} `))).toBe(true);
    }
  });
});
