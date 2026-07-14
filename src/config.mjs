/**
 * Default CLI templates and constants for the markcut pipeline.
 *
 * All CLIs support {input} / {prompt} / {output} placeholders as documented.
 * These can be overridden at runtime via --itt, --vtt, --stt, --tts, --agent flags,
 * or via MARKCUT_*_CLI environment variables.
 *
 * @module
 */

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
 * Image-to-text (ITT) CLI.
 * Reads an image file and returns a text description.
 * Placeholders: {input}=image path(s), {prompt}=description prompt.
 * Override with MARKCUT_ITT_CLI env var.
 */
export const DEFAULT_ITT_CLI =
  process.env.MARKCUT_ITT_CLI ||
  'uvx --from mlx-vlm mlx_vlm.generate --model mlx-community/MiniCPM-V-4.6-bf16 --max-tokens 2048 --prompt "{prompt}" --image {input} --temperature 0.0 --thinking-mode disabled';

/**
 * Seconds between sampled video frames when using the default ITT-based VTT.
 */
export const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || "";

export const DEFAULT_VTT_SAMPLE_INTERVAL = Number(process.env.MARKCUT_VTT_SAMPLE_INTERVAL) || 5;

/**
 * Video-to-text (VTT) CLI — direct video model.
 * When set to null/empty, falls back to ITT via frame extraction.
 * Placeholders: {input}=video path, {prompt}=description prompt.
 * Override with MARKCUT_VTT_CLI env var.
 */
export const DEFAULT_VTT_CLI =
  process.env.MARKCUT_VTT_CLI ||
  'uvx --from mlx-vlm mlx_vlm.generate --model mlx-community/MiniCPM-V-4.6-bf16 --max-tokens 2048 --prompt "{prompt}" --video {input} --temperature 0.0 --processor-kwargs \'{"max_num_frames": 32, "stack_frames": 1, "max_slice_nums": 1, "use_image_id": false}\'';

/**
 * Speech-to-text (STT) CLI.
 * Extracts audio and generates VTT subtitles.
 * Placeholders: {input}=audio path, {output}=output directory.
 * Override with MARKCUT_STT_CLI env var.
 * Used by both vision and render pipelines.
 */
export const DEFAULT_STT_CLI =
  process.env.MARKCUT_STT_CLI ||
  'uvx --from openai-whisper whisper "{input}" --output_format vtt --output_dir "{output}"';

/**
 * Text-to-speech (TTS) CLI.
 * Generates audio from text.
 * Placeholders: {input}=text, {output}=audio file path.
 * Override with MARKCUT_TTS_CLI env var.
 * Used by both vision and render pipelines.
 */
export const DEFAULT_TTS_CLI =
  process.env.MARKCUT_TTS_CLI ||
  'uvx edge-tts --voice "en-US-GuyNeural" --text "{input}" --write-media "{output}"';

/**
 * Default agent CLI — general-purpose text LLM.
 * Used for text-only tasks like detect-scenes and editing.
 * Placeholders:
 *   {systemprompt} = system prompt (role, instructions, knowledge)
 *   {prompt}       = user prompt (current context + edit request)
 *   {sessionid}    = unique session ID for conversation continuity
 * Override with MARKCUT_AGENT_CLI env var.
 */
export const DEFAULT_AGENT_CLI = process.env.MARKCUT_AGENT_CLI || 'npx pi --session-id {sessionid} --system-prompt {systemprompt} -p {prompt}';

// ── Render-only pipeline CLI templates ─────────────────────────────────────
// These are specific to the render pipeline (no vision pipeline equivalent).

export const DEFAULT_TTI_CLI =
  process.env.MARKCUT_TTI_CLI ||
  'uvx --from mflux mflux-generate-flux2 --model flux2-klein-4b --steps 5 --prompt "{input}" --output "{output}"';
export const DEFAULT_TTV_CLI = process.env.MARKCUT_TTV_CLI || '';
