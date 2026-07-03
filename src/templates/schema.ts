import { z } from "zod";

export const templateSlot = z.object({
  name: z.string(),
  type: z.enum(["text", "image", "video", "number", "color", "boolean"]),
  label: z.string(),
  default: z.unknown().optional(),
  required: z.boolean().default(false),
  constraints: z
    .object({
      maxLength: z.number().optional(),
      aspectRatio: z.string().optional(),
      min: z.number().optional(),
      max: z.number().optional(),
    })
    .optional(),
});
export type TemplateSlot = z.infer<typeof templateSlot>;

export const templateMeta = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.enum(["marketing", "demo", "social", "presentation"]),
  aspects: z.array(z.enum(["16x9", "9x16", "1x1"])).default(["16x9"]),
  duration: z.number().describe("estimated seconds"),
  theme: z.string().default("cinematic"),
  slots: z.array(templateSlot),
  streamTree: z.unknown().optional().describe("compiled stream tree JSON with ${slot.name} placeholders"),
  markdown: z.string().optional().describe("descriptive markdown source with ${slot.name} placeholders"),
});
export type TemplateMeta = z.infer<typeof templateMeta>;

/**
 * Recursively resolve `${slotName}` placeholders in a stream tree.
 * Handles strings, arrays, and nested objects.
 */
export function resolveTemplate(
  streamTree: unknown,
  data: Record<string, unknown>,
): unknown {
  if (typeof streamTree === "string") {
    // Full placeholder replacement: "${headline}" → data.headline
    if (/^\$\{[^}]+\}$/.test(streamTree)) {
      const key = streamTree.slice(2, -1);
      return data[key] !== undefined ? data[key] : streamTree;
    }
    // Inline interpolation: "Hello ${name}" → "Hello World"
    return streamTree.replace(/\$\{([^}]+)\}/g, (_, key: string) => {
      const val = data[key];
      return val !== undefined ? String(val) : `\${${key}}`;
    });
  }

  if (Array.isArray(streamTree)) {
    return streamTree.map((item) => resolveTemplate(item, data));
  }

  if (streamTree !== null && typeof streamTree === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(streamTree as Record<string, unknown>)) {
      result[k] = resolveTemplate(v, data);
    }
    return result;
  }

  return streamTree;
}

/**
 * Validate that all required slots have values in data.
 * Returns array of missing slot names (empty = valid).
 */
export function validateSlots(
  slots: TemplateSlot[],
  data: Record<string, unknown>,
): string[] {
  return slots
    .filter((s) => s.required && data[s.name] === undefined)
    .map((s) => s.name);
}

/**
 * Apply defaults for slots not provided in data.
 */
export function applyDefaults(
  slots: TemplateSlot[],
  data: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...data };
  for (const slot of slots) {
    if (result[slot.name] === undefined && slot.default !== undefined) {
      result[slot.name] = slot.default;
    }
  }
  return result;
}
