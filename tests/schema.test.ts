/**
 * Unit tests for the stream-tree schema.
 *
 * Fast (no rendering). Guards against silent data loss from zod's default
 * `.strip()` behavior — specifically the `root.imports` component-registry
 * field that the player server sets after bundling frontmatter imports.
 */
import { describe, it, expect } from "vitest";
import { root, component } from "../src/schema/index";

describe("root.imports — component registry passthrough", () => {
  it("preserves a string bundle URL through root.parse()", () => {
    // This is what the player server sets after bundling frontmatter imports.
    const parsed = root.parse({
      type: "root",
      imports: "http://localhost:3001/.component-cache/abc123.js",
      children: [],
    });
    expect(parsed.imports).toBe("http://localhost:3001/.component-cache/abc123.js");
  });

  it("preserves an inline component map (programmatic API)", () => {
    const Hello = () => null;
    const parsed = root.parse({
      type: "root",
      imports: { Hello, BarChart: () => null },
      children: [],
    });
    expect(parsed.imports).toBeDefined();
    expect(Object.keys(parsed.imports as object).sort()).toEqual(["BarChart", "Hello"]);
  });

  it("defaults imports to undefined when absent", () => {
    const parsed = root.parse({ type: "root", children: [] });
    expect(parsed.imports).toBeUndefined();
  });
});

describe("component node", () => {
  it("requires a jsx usage expression", () => {
    const c = component.parse({
      type: "component",
      jsx: "<BarChart data={[{value: 1}]} />",
      start: 0,
      end: 2,
    });
    expect(c.type).toBe("component");
    expect(c.jsx).toContain("BarChart");
  });

  it("carries data bindings for the JSX scope", () => {
    const c = component.parse({
      type: "component",
      jsx: "<Hello name={who} />",
      data: { who: "World" },
      start: 0,
      end: 1,
    });
    expect(c.data).toEqual({ who: "World" });
  });

  it("rejects a component without jsx", () => {
    expect(() =>
      component.parse({
        type: "component",
        start: 0,
        end: 1,
      }),
    ).toThrow();
  });
});
