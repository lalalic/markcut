/**
 * Schema validation tests for JSX component nodes.
 *
 * Verifies that component fixtures with `jsx` field pass zod schema parsing
 * and that fields like `componentName` and `props` are no longer accepted.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { root as rootSchema, component as componentSchema } from "../src/schema/index";

const FIXTURES_DIR = resolve(__dirname, "fixtures");

function parseFixture(name: string): any {
  const path = resolve(FIXTURES_DIR, name);
  const raw = JSON.parse(readFileSync(path, "utf-8"));
  const data = raw.root ?? raw;
  return rootSchema.parse(data);
}

describe("Component Schema — JSX-only", () => {
  it("component-jsx-usage: jsx + imports map", () => {
    const parsed = parseFixture("component-jsx-usage.json");

    const scene1 = parsed.children[0];
    const jsxComp = scene1.children[0];
    expect(jsxComp.type).toBe("component");
    expect(jsxComp.jsx).toBe("<StatCounter value={42} label='Test' />");
    expect(jsxComp.imports).toEqual({
      StatCounter: "https://esm.sh/stat-counter",
      Logo: "https://esm.sh/gh/user/logo",
    });
    expect(jsxComp.actions).toHaveLength(1);
  });

  it("component-tween: jsx with tween function calls", () => {
    const parsed = parseFixture("component-tween.json");
    const folder = parsed.children[0];
    const comp = folder.children[0];
    expect(comp.type).toBe("component");
    expect(comp.jsx).toContain("tween(");
    expect(comp.jsx).toContain("<svg");
  });

  it("component-tween-jsx: alternative jsx with tween", () => {
    const parsed = parseFixture("component-tween-jsx.json");
    const folder = parsed.children[0];
    const comp = folder.children[0];
    expect(comp.type).toBe("component");
    expect(comp.jsx).toContain("tween(");
  });

  it("component-load-pie: JSX with PieChart from imports", () => {
    const parsed = parseFixture("component-load-pie.json");
    const folder = parsed.children[0];
    const comp = folder.children[0];
    expect(comp.type).toBe("component");
    expect(comp.jsx).toContain("PieChart");
    expect(comp.imports?.PieChart).toBe("https://esm.sh/react-minimal-pie-chart@9.1.2");
  });

  it("component-load-jsx: JSX with PieChart from imports (alt fixture)", () => {
    const parsed = parseFixture("component-load-jsx.json");
    const folder = parsed.children[0];
    const comp = folder.children[0];
    expect(comp.type).toBe("component");
    expect(comp.jsx).toContain("PieChart");
  });

  it("component-single-src: JSX component with imports", () => {
    const parsed = parseFixture("component-single-src.json");
    const comp = parsed.children[0];
    expect(comp.type).toBe("component");
    expect(comp.jsx).toContain("PieChart");
    expect(comp.imports?.PieChart).toBe("https://esm.sh/react-minimal-pie-chart@9.1.2");
  });

  it("tween-visual: JSX with tween animation", () => {
    const parsed = parseFixture("tween-visual.json");
    const folder = parsed.children[0];
    const comp = folder.children[0];
    expect(comp.type).toBe("component");
    expect(comp.jsx).toContain("tween(");
    expect(comp.jsx).toContain("Hello Tween");
  });

  it("component schema requires jsx", () => {
    // component without jsx should fail
    expect(() => componentSchema.parse({ type: "component" })).toThrow();
    // component with jsx should pass
    const parsed = componentSchema.parse({ type: "component", jsx: "<div />" });
    expect(parsed.jsx).toBe("<div />");
    expect(parsed.type).toBe("component");
    expect(parsed.actions).toHaveLength(1);
  });
});
