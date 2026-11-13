import { describe, it, expect } from "vitest";
import { parseMarkdownDescriptive } from "./markdown";
import { compileDescriptiveRoot } from "./compiler";
import { root as rootSchema } from "../schema/index";
import { model3dAngle } from "../types/Model3D";

const doc = `# video
width:640 height:640 fps:30 layout:series
## Toy
- model3d src:assets/toy.glb duration:6 motion:turntable turns:1 rotation:[0,30,0] camera:{"position":[0,1,5],"fov":34} background:#eeeeee`;

describe("model3d native stream", () => {
  it("parses Markdown through compiler and strict Zod stream schema", () => {
    const descriptive = parseMarkdownDescriptive(doc);
    const input = (descriptive.children[0] as any).children[0];
    expect(input).toMatchObject({ type: "model3d", src: "assets/toy.glb", motion: "turntable", duration: 6, rotation: [0, 30, 0] });
    const compiled = compileDescriptiveRoot(descriptive);
    const parsed = rootSchema.parse(compiled);
    const model = (parsed.children[0] as any).children[0];
    expect(model).toMatchObject({ type: "model3d", src: "assets/toy.glb", motion: "turntable", turns: 1, durationInSeconds: 6, camera: { position: [0, 1, 5], fov: 34 } });
  });

  it("works with defaults and rejects USDZ, broken vectors and unknown motion", () => {
    const parsed = rootSchema.parse(compileDescriptiveRoot(parseMarkdownDescriptive('# video\n## Static\n- model3d src:toy.glb')));
    const model = (parsed.children[0] as any).children[0];
    expect(model).toMatchObject({ motion: "none", turns: 1, autoFit: true, rotation: [0, 0, 0], durationInSeconds: 4 });
    expect(() => rootSchema.parse(compileDescriptiveRoot(parseMarkdownDescriptive('# video\n- model3d src:toy.usdz duration:2')))).toThrow(/glb|gltf/i);
    expect(() => rootSchema.parse(compileDescriptiveRoot(parseMarkdownDescriptive('# video\n- model3d src:toy.glb rotation:[0,20]')))).toThrow();
    expect(() => rootSchema.parse(compileDescriptiveRoot(parseMarkdownDescriptive('# video\n- model3d src:toy.glb motion:fly')))).toThrow();
  });

  it("never accumulates rotation between seeks", () => {
    expect(model3dAngle(0, 121, 1)).toBe(0);
    expect(model3dAngle(60, 121, 1)).toBeCloseTo(Math.PI);
    expect(model3dAngle(120, 121, 1)).toBeCloseTo(Math.PI * 2);
    expect(model3dAngle(60, 121, 1)).toBeCloseTo(Math.PI);
  });
});
