import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { TemplateMeta } from "./schema";
export { resolveTemplate, validateSlots, applyDefaults, templateMeta, templateSlot } from "./schema";
export type { TemplateMeta, TemplateSlot } from "./schema";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Marketing
import productHero from "./marketing/product-hero.json";
import featureShowcase from "./marketing/feature-showcase.json";
import beforeAfter from "./marketing/before-after.json";
import socialClip from "./marketing/social-clip.json";
import cinematicIntro from "./marketing/cinematic-intro.json";
// Demo
import demoWalkthrough from "./demo/demo-walkthrough.json";
// Social
import announcement from "./social/announcement.json";
import glowUp from "./social/glow-up.json";
import quoteCard from "./social/quote-card.json";
import roastList from "./social/roast-list.json";
import statReveal from "./social/stat-reveal.json";
import top5Countdown from "./social/top5-countdown.json";
import yearRecap from "./social/year-recap.json";
import beatDrop from "./social/beat-drop.json";
// Presentation
import journeyMap from "./presentation/journey-map.json";

/** Load descriptive markdown content for a template, if a .md file exists. */
function loadMarkdown(category: string, id: string): string | undefined {
  try {
    const path = join(__dirname, category, `${id}.md`);
    return readFileSync(path, "utf-8");
  } catch {
    return undefined;
  }
}

/** Helper to attach markdown to a template import. */
function tmpl(id: string, category: string, json: any): TemplateMeta {
  return {
    ...(json as any),
    markdown: loadMarkdown(category, id),
  } as unknown as TemplateMeta;
}

export const templates: Record<string, TemplateMeta> = {
  // Marketing
  "product-hero": tmpl("product-hero", "marketing", productHero),
  "feature-showcase": tmpl("feature-showcase", "marketing", featureShowcase),
  "before-after": tmpl("before-after", "marketing", beforeAfter),
  "social-clip": tmpl("social-clip", "marketing", socialClip),
  "cinematic-intro": tmpl("cinematic-intro", "marketing", cinematicIntro),
  // Demo
  "demo-walkthrough": tmpl("demo-walkthrough", "demo", demoWalkthrough),
  // Social
  "announcement": tmpl("announcement", "social", announcement),
  "glow-up": tmpl("glow-up", "social", glowUp),
  "quote-card": tmpl("quote-card", "social", quoteCard),
  "roast-list": tmpl("roast-list", "social", roastList),
  "stat-reveal": tmpl("stat-reveal", "social", statReveal),
  "top5-countdown": tmpl("top5-countdown", "social", top5Countdown),
  "year-recap": tmpl("year-recap", "social", yearRecap),
  "beat-drop": tmpl("beat-drop", "social", beatDrop),
  // Presentation
  "journey-map": tmpl("journey-map", "presentation", journeyMap),
};

/**
 * Get a template by ID. Throws if not found.
 */
export function getTemplate(id: string): TemplateMeta {
  const t = templates[id];
  if (!t) throw new Error(`Template "${id}" not found. Available: ${Object.keys(templates).join(", ")}`);
  return t;
}

/**
 * List all available templates.
 */
export function listTemplates(): Array<{ id: string; name: string; category: string; description: string }> {
  return Object.entries(templates).map(([id, t]) => ({
    id,
    name: t.name,
    category: t.category,
    description: t.description,
  }));
}
