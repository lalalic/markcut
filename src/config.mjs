import { extractProfileArgument, readCliProfile, profileCacheKey, DEFAULT_PROFILE_PATH, expandProfileTemplate } from "./cli-profile.mjs";

/**
 * Default CLI templates and constants for the markcut pipeline.
 *
 * CLIs support {input}, {prompt}, {output}. Image/video hooks also support
 * {prompt_quoted}, a shell-quoted prompt. Use it without surrounding quotes
 * for untrusted project context.
 * These can be overridden at runtime via --itt, --vtt, --stt, --tts, --agent flags,
 * or via MARKCUT_*_CLI environment variables.
 *
 * @module
 */


const selection = extractProfileArgument(process.argv.slice(2));
export const PROFILE_PATH = selection.profilePath;
const profile = readCliProfile(PROFILE_PATH);
const defaults = readCliProfile(DEFAULT_PROFILE_PATH);
export const args=(function parseArgs(argv) {
  const args = { command: "", file: "", output: "", forceNew: false, verbose: false, dev: false, label: false, edit: false, storyboard: false, noBrowser: false, chat: false, port: 3001, compile: false, cli: false, showClis: false, scriptOutputDir: "", mediaOutputDir: "", variant: [], cliOverrides: selection.cliOverrides };
  let i = 2;
  if (argv[i]) args.command = argv[i++];
  if (argv[i] && !argv[i].startsWith("--")) args.file = argv[i++];
  while (i < argv.length) {
    const flag = argv[i++];
    if (flag === "--output" && argv[i]) args.output = argv[i++];
    else if (flag === "--script-output-dir" && argv[i]) args.scriptOutputDir = argv[i++];
    else if (flag === "--media-output-dir" && argv[i]) args.mediaOutputDir = argv[i++];
    else if (flag === "--cli") args.cli = true;
    else if (flag === "--show-clis") args.showClis = true;
    else if (flag === "--compile") args.compile = true;
    else if (flag === "--force-new") args.forceNew = true;
    else if (flag === "--verbose") args.verbose = true;
    else if (flag === "--dev") args.dev = true;
    else if (flag === "--label") args.label = true;
    else if (flag === "--edit") args.edit = true;
    else if (flag === "--storyboard") args.storyboard = true;
    else if (flag === "--no-browser") args.noBrowser = true;
    else if (flag === "--port" && argv[i]) args.port = parseInt(argv[i], 10);
    else if (flag.startsWith("--port=")) args.port = parseInt(flag.split("=")[1], 10);
    else if (flag === "--variant" && argv[i]) args.variant.push(argv[i++]);
    else if (flag.startsWith("--variant=")) args.variant.push(flag.split("=")[1]);
  }
  return args;
})([...process.argv.slice(0,2), ...selection.argv]);

// Explicit caller profile fields win over authored provider templates.
// Unspecified fields retain legacy behavior; direct flags win over a selected profile.
export const PROFILE_CLI_OVERRIDES = Object.fromEntries(Object.entries({...profile, ...args.cliOverrides}).map(([key,value])=>[key,expandProfileTemplate(value)]));
function cli(key, env) {
  return PROFILE_CLI_OVERRIDES[key] ?? expandProfileTemplate(process.env[env] || defaults[key]);
}


// ── Media type sets ───────────────────────────────────────────────────────

export const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tiff", ".heic", ".avif"]);
export const VIDEO_EXTS = new Set([".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v", ".wmv"]);

// ── Normalization limits ──────────────────────────────────────────────────

/** Longest side in px for normalized images. */
export const MAX_IMAGE_DIMENSION = Number(process.env.MARKCUT_MAX_IMAGE_DIMENSION) || 384;
/** Max seconds for normalized video clip. */
export const MAX_VIDEO_DURATION = Number(process.env.MARKCUT_MAX_VIDEO_DURATION) || 60;
/** Max height/width for normalized video. */
export const MAX_VIDEO_DIMENSION = Number(process.env.MARKCUT_MAX_VIDEO_DIMENSION) || 360;

// ── Vision pipeline CLI templates ─────────────────────────────────────────

/**
 * Image-to-text (ITT) CLI placeholder (now defined below via export let).
 */

/**
 * Seconds between sampled video frames when using the default ITT-based VTT.
 */
export const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || "";

export const DEFAULT_VTT_SAMPLE_INTERVAL = Number(process.env.MARKCUT_VTT_SAMPLE_INTERVAL) || 5;

/**
 * Video-to-text (VTT) CLI placeholder (now defined below via export let).
 */


// Fallback templates are owned by profiles/default.json; environment and caller
// selections override them without editing the shipped file.
export const DEFAULT_STT_CLI = cli("stt", "MARKCUT_STT_CLI");
export const DEFAULT_TTS_CLI = cli("tts", "MARKCUT_TTS_CLI");
export const DEFAULT_AGENT_CLI = cli("agent", "MARKCUT_AGENT_CLI");
export const DEFAULT_EDIT_CLI = cli("editCli", "MARKCUT_EDIT_CLI");
export const DEFAULT_TTI_CLI = cli("tti", "MARKCUT_TTI_CLI");
export const DEFAULT_TTV_CLI = cli("ttv", "MARKCUT_TTV_CLI");
export const DEFAULT_ITT_CLI = cli("itt", "MARKCUT_ITT_CLI");
export const DEFAULT_VTT_CLI = cli("vtt", "MARKCUT_VTT_CLI");

// Explicit caller configuration includes the override mask, since an authored
// template can differ even when an explicit value equals a fallback value.
export const PROFILE_CACHE_KEY = PROFILE_PATH || Object.keys(PROFILE_CLI_OVERRIDES).length ? profileCacheKey({tts:DEFAULT_TTS_CLI, stt:DEFAULT_STT_CLI, itt:DEFAULT_ITT_CLI, vtt:DEFAULT_VTT_CLI, tti:DEFAULT_TTI_CLI, ttv:DEFAULT_TTV_CLI, agent:DEFAULT_AGENT_CLI, editCli:DEFAULT_EDIT_CLI}, PROFILE_CLI_OVERRIDES) : "";
