/**
 * Player bundle entry. For embedding in React apps.
 *
 * Usage:
 *   import { RemotionEngine, builtinComponents, resolveTheme } from "markcut/player";
 *   import { Player } from "@remotion/player";
 *
 *   <Player
 *     component={RemotionEngine}
 *     inputProps={{ root: streamTree, compose: { components: builtinComponents } }}
 *     ...
 *   />
 */
export { RemotionEngine, type RemotionEngineProps } from "./lite.entry";
export { builtinComponents } from "./components";
export * from "./components";
export { resolveTheme, useTheme, ThemeProvider, themePresets, themeSchema } from "./themes";
export type { Theme, SpringConfig } from "./themes";
export { templates, getTemplate, listTemplates, resolveTemplate, validateSlots, applyDefaults } from "./templates";
export type { TemplateMeta, TemplateSlot } from "./templates";
export { getDurationInSeconds } from "./utils";
export * from "./schema";
export { ASPECTS, adaptAspect, type AspectKey } from "./render/pipeline";
