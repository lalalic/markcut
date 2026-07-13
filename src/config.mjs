/**
 * Default CLI templates and constants for the markcut pipeline.
 *
 * All CLIs support {input} / {prompt} / {output} placeholders as documented.
 * These can be overridden at runtime via --itt, --vtt, --stt, --tts, --agent flags,
 * or via MARKCUT_* environment variables.
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

// ── CLI templates ─────────────────────────────────────────────────────────

/**
 * Image-to-text (ITT) CLI.
 * Reads an image file and returns a text description.
 * Placeholders: {input}=image path(s), {prompt}=description prompt.
 * Override with MARKCUT_ITT env var.
 */
export const DEFAULT_ITT =
  process.env.MARKCUT_ITT ||
  'uvx --from mlx-vlm mlx_vlm.generate --model mlx-community/MiniCPM-V-4.6-bf16 --max-tokens 2048 --prompt "{prompt}" --image {input} --temperature 0.0 --thinking-mode disabled';

/**
 * Seconds between sampled video frames when using the default ITT-based VTT.
 * Override with MARKCUT_VTT_SAMPLE_INTERVAL env var.
 */
export const DEFAULT_VTT_SAMPLE_INTERVAL = Number(process.env.MARKCUT_VTT_SAMPLE_INTERVAL) || 5;

/**
 * Video-to-text (VTT) CLI — direct video model.
 * When set to null/empty, falls back to ITT via frame extraction.
 * Placeholders: {input}=video path, {prompt}=description prompt.
 * Override with MARKCUT_VTT env var.
 */
export const DEFAULT_VTT =
  process.env.MARKCUT_VTT ||
  'uvx --from mlx-vlm mlx_vlm.generate --model mlx-community/MiniCPM-V-4.6-bf16 --max-tokens 2048 --prompt "{prompt}" --video {input} --temperature 0.0 --processor-kwargs \'{"max_num_frames": 32, "stack_frames": 1, "max_slice_nums": 1, "use_image_id": false}\'';

/**
 * Speech-to-text (STT) CLI.
 * Extracts audio and generates VTT subtitles.
 * Placeholders: {input}=audio path, {output}=output directory.
 * Override with MARKCUT_STT env var.
 */
export const DEFAULT_STT =
  process.env.MARKCUT_STT ||
  'uvx --from openai-whisper whisper "{input}" --output_format vtt --output_dir "{output}"';

/**
 * Text-to-speech (TTS) CLI.
 * Generates audio from text.
 * Placeholders: {input}=text, {output}=audio file path.
 * Override with MARKCUT_TTS env var.
 */
export const DEFAULT_TTS =
  process.env.MARKCUT_TTS ||
  'uvx edge-tts --voice "en-US-GuyNeural" --text "{input}" --write-media "{output}"';

/**
 * Default agent CLI — general-purpose text LLM.
 * Used for text-only tasks like detect-scenes.
 * Placeholders: {prompt}=the prompt text.
 * Override with MARKCUT_AGENT env var.
 */
export const DEFAULT_AGENT = process.env.MARKCUT_AGENT || 'npx pi -p {prompt}';
