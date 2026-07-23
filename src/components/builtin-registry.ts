/**
 * Lightweight name registry for built-in components.
 *
 * This file is imported by the compiler (Node.js) and must NOT import any
 * React/remotion dependencies. It only exports string names used for
 * compile-time registration (warnUnregisteredComponents bypass).
 *
 * When adding a new built-in component:
 *   1. Create the component file in src/components/
 *   2. Export it from src/components/index.ts (barrel)
 *   3. Add its name to BUILTIN_COMPONENT_NAMES in THIS file
 *   4. Rebuild bundles — done
 */
export const BUILTIN_COMPONENT_NAMES: readonly string[] = [
  "StoryboardSlot",
  "StoryboardCaption",
  "StoryboardInfo",
  "Markdown",
  "Mermaid",
];
