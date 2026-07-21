/**
 * Default CLI templates and constants for the markcut pipeline.
 *
 * All CLIs support {input} / {prompt} / {output} placeholders as documented.
 * These can be overridden at runtime via --itt, --vtt, --stt, --tts, --agent flags,
 * or via MARKCUT_*_CLI environment variables.
 *
 * @module
 */


export const args=(function parseArgs(argv) {
  const CLI_OVERRIDE_FLAGS = {
    "--itt": "itt",
    "--vtt": "vtt",
    "--stt": "stt",
    "--tts": "tts",
    "--agent": "agent",
    "--edit-cli": "editCli",
    "--tti": "tti",
    "--ttv": "ttv"
  };
  const args = { command: "", file: "", output: "", forceNew: false, verbose: false, dev: false, label: false, edit: false, noBrowser: false, chat: false, port: 3001, compile: false, cli: false, showClis: false, scriptOutputDir: "", mediaOutputDir: "", variant: [], cliOverrides: {} };
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
    else if (flag === "--no-browser") args.noBrowser = true;
    else if (flag === "--port" && argv[i]) args.port = parseInt(argv[i], 10);
    else if (flag.startsWith("--port=")) args.port = parseInt(flag.split("=")[1], 10);
    else if (flag === "--variant" && argv[i]) args.variant.push(argv[i++]);
    else if (flag.startsWith("--variant=")) args.variant.push(flag.split("=")[1]);
    else if (CLI_OVERRIDE_FLAGS[flag] && argv[i]) {
      const key = CLI_OVERRIDE_FLAGS[flag];
      args.cliOverrides[key] = argv[i++];
    }
  }
  return args;
})(process.argv);


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


/** Speech-to-text CLI. Override via --stt flag or MARKCUT_STT_CLI env var. */
export const DEFAULT_STT_CLI = args.cliOverrides.stt || process.env.MARKCUT_STT_CLI || 'uvx --from openai-whisper whisper "{input}" --output_format vtt --output_dir "{output}"';
/** Text-to-speech CLI. Override via --tts flag or MARKCUT_TTS_CLI env var. */
export const DEFAULT_TTS_CLI = args.cliOverrides.tts || process.env.MARKCUT_TTS_CLI || 'uvx edge-tts --voice "en-US-GuyNeural" --text "{input}" --write-media "{output}"';
/** Default agent CLI. Override via --agent flag or MARKCUT_AGENT_CLI env var. */
export const DEFAULT_AGENT_CLI = args.cliOverrides.agent || process.env.MARKCUT_AGENT_CLI || 'npx pi -p {prompt}';
/** Default edit agent CLI. Override via --edit-cli flag or MARKCUT_EDIT_CLI env var. */
export const DEFAULT_EDIT_CLI = args.cliOverrides.editCli || process.env.MARKCUT_EDIT_CLI || 'npx pi --session-id {sessionid} --system-prompt {systemprompt} -p {prompt}';
/** Text-to-image CLI. Override via --tti flag or MARKCUT_TTI_CLI env var. */
export const DEFAULT_TTI_CLI = args.cliOverrides.tti || process.env.MARKCUT_TTI_CLI || 'uvx --from mflux mflux-generate-flux2 --model flux2-klein-4b --steps 2 --prompt "{input}" --output "{output}" --seed {seed}';
/** Text-to-video CLI. Override via --ttv flag or MARKCUT_TTV_CLI env var. */
export const DEFAULT_TTV_CLI = args.cliOverrides.ttv || process.env.MARKCUT_TTV_CLI || '';
/** Image-to-text CLI. Override via --itt flag or MARKCUT_ITT_CLI env var. */
export const DEFAULT_ITT_CLI = args.cliOverrides.itt || process.env.MARKCUT_ITT_CLI || 'uvx --from mlx-vlm mlx_vlm.generate --model mlx-community/MiniCPM-V-4.6-bf16 --max-tokens 2048 --prompt "{prompt}" --image {input} --temperature 0.0 --thinking-mode disabled';;
/** Video-to-text CLI. Override via --vtt flag or MARKCUT_VTT_CLI env var. */
export const DEFAULT_VTT_CLI = args.cliOverrides.vtt || process.env.MARKCUT_VTT_CLI || 'uvx --from mlx-vlm mlx_vlm.generate --model mlx-community/MiniCPM-V-4.6-bf16 --max-tokens 2048 --prompt "{prompt}" --video {input} --temperature 0.0 --processor-kwargs \'{"max_num_frames": 32, "stack_frames": 1, "max_slice_nums": 1, "use_image_id": false}\'';
