#!/usr/bin/env node
/**
 * CLI entry point for the Remotion engine.
 *
 * Pipeline:
 *   .md ──[parse]──▶ descriptive ──[resolve]──▶ resolved ──[compile]──▶ stream tree ──[render]──▶ MP4
 *                                        (TTS/STT/durations)
 */
import { execSync, spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_TTS_CLI, DEFAULT_STT_CLI, DEFAULT_TTI_CLI, DEFAULT_TTV_CLI,
  DEFAULT_ITT_CLI, DEFAULT_VTT_CLI, DEFAULT_AGENT_CLI, DEFAULT_EDIT_CLI,
  args,
} from "../config.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "../..");

/**
 * How many "Rendered X/Y" lines to skip before printing one.
 * E.g. 50 means print every 50th frame — for 1860 frames that's ~37 lines.
 */
const PROGRESS_INTERVAL = 50;

/** Print an error message to stderr. */
function emitError(msg) { console.error(`❌ ${msg}`); }

/** Print a warning message to stderr. */
function emitWarn(msg) { console.error(`⚠️  ${msg}`); }

/** Print a success message to stderr. */
function emitSuccess(msg) { console.error(`✅ ${msg}`); }

/** Print an info message (stderr, always visible). */
function emitInfo(msg) { console.error(msg); }

function usage() {
  console.log(`
markcut CLI — Markdown/JSON → video pipeline

npx @lalalic/markcut <command> [options]

global options:
  --dev                                Use development build (unminified React error messages)
  --show-clis                          Print all default CLI templates and exit

  --tti <template>                     Override default TTI CLI template
  --tts <template>                     Override default TTS CLI template
  --stt <template>                     Override default STT CLI template
  --ttv <template>                     Override default TTV CLI template
  --itt <template>                     Override default ITT CLI template
  --vtt <template>                     Override default VTT CLI template
  --agent <template>                   Override default agent CLI template
  --edit-cli <template>                Override default edit agent CLI template

  --help                               Show this help

Commands:

  verify <file>                         Parse + validate descriptive file

  preview <file.json|.md>               Open player with live preview
    --label                           Open label input overlay
    --storyboard                      Fast structure preview: replaces TTI/TTV prompt
                                    nodes with <StoryboardSlot> placeholders and
                                    script nodes with <StoryboardCaption> overlays.
                                    Skips slow generation (TTI/TTV/STT).
                                      Implies --edit so you can reshape the story.
    --no-browser                      Skip opening browser automatically
    --port <num>                        Port for the player server (default: 3001)

  render <file.json|.md>                Resolve + compile + render to MP4
    --output <path>                     Output path (default: out/video.mp4)
    --verbose                           Show full per-frame progress (default: compact)

  vision <folder>                      Full pipeline: extract → normalize → percept → segments
    --label                            Add interactive labeling step before AI pipeline
    --instruct "text"                   Background context about people/places (injected into prompts)
    --prompts-file <path>              Path to prompts markdown file (default: vision_prompts.md)
    --vtt-sample-interval <n>          Sample one video frame every N seconds (default: 5)
    --skip-stt                         Skip speech-to-text for videos
    --dry-run                          Show what would be processed without running AI
    --show-prompts                     Print the prompts file and exit
    --<prompt-name> "text"             Override any prompt template from vision_prompts.md
`);
}


/**
 * Render a stream tree to an MP4 video with compact progress output.
 *
 * In compact mode (default), "Rendered X/Y" lines are shown only every
 * PROGRESS_INTERVAL frames and at the final frame, drastically reducing
 * token consumption when output is captured by an LLM agent.
 *
 * Use --verbose to see every frame line (original behavior).
 */

function renderOne(streamTree, outputPath, verbose) {
  const tmpProps = join(ROOT, ".tmp", "render-stream.json");
  mkdirSync(dirname(tmpProps), { recursive: true });
  writeFileSync(tmpProps, JSON.stringify({ root: streamTree }));

  mkdirSync(dirname(outputPath), { recursive: true });

console.log(`\n▶ Rendering → ${outputPath}`);

  return new Promise((resolvePromise, reject) => {
    // Pass NODE_ENV=development to get unminified React error messages (--dev flag)
    const spawnOpts = { cwd: ROOT, stdio: ["ignore", "inherit", "pipe"] };
    // args is imported from config.mjs — check dev flag there
    if (args.dev) {
      spawnOpts.env = { ...process.env, NODE_ENV: "development" };
    }
    const proc = spawn("npx", ["remotion", "render", "Root", outputPath, "--props", tmpProps, "--config", "remotion.config.ts"], spawnOpts);

    let lastLoggedFrame = 0;
    let totalFrames = 0;
    let lineBuffer = "";

    // Parse "Rendered X/Y, time remaining: ..." or "Rendered X/Y" lines
    const progressRe = /^Rendered\s+(\d+)\/(\d+)/;

    proc.stderr.on("data", (chunk) => {
      lineBuffer += chunk.toString();
      const lines = lineBuffer.split("\n");
      // Keep the last (potentially incomplete) segment in the buffer
      lineBuffer = lines.pop() || "";
      for (const line of lines) {
        if (!line) continue;

        const match = line.match(progressRe);
        if (match) {
          const currentFrame = parseInt(match[1], 10);
          totalFrames = parseInt(match[2], 10);

          if (verbose) {
            // Original behavior: print every line
            console.error(line);
          } else {
            // Compact mode: print only at intervals + completion
            const isComplete = currentFrame >= totalFrames;
            const intervalElapsed = currentFrame - lastLoggedFrame >= PROGRESS_INTERVAL;
            const isStarting = currentFrame === 0 || (lastLoggedFrame === 0 && currentFrame > 0);

            if (isComplete || intervalElapsed || isStarting) {
              // Show a compact progress line
              const pct = totalFrames > 0 ? ` (${Math.round((currentFrame / totalFrames) * 100)}%)` : "";
              console.error(`  Rendered ${currentFrame}/${totalFrames}${pct}`);
              lastLoggedFrame = currentFrame;
            }
          }
        } else {
          // Non-progress line — always print (bundle progress, errors, metadata)
          console.error(line);
        }
      }
    });

    proc.on("error", (err) => {
      reject(err);
    });

    proc.on("exit", (code) => {
      // Flush any remaining line in the buffer (non-progress lines only)
      if (lineBuffer && !lineBuffer.match(progressRe)) {
        console.error(lineBuffer);
      }
      if (code === 0) {
        console.log(`✓ ${outputPath}`);
        resolvePromise();
      } else {
        reject(new Error(`Remotion exited with code ${code}`));
      }
    });
  });
}

async function main() {
  if (!args.command || args.command === "help" || args.command === "--help") {
    usage();
    process.exit(0);
  }

  // --show-clis works as a command or a flag
  if (args.showClis || args.command === "--show-clis") {
    console.log(`Default CLI 
tti=${DEFAULT_TTI_CLI}

ttv=${DEFAULT_TTV_CLI || "(empty — falls back to TTI + ffmpeg to produce a 3s MP4)"}

tts=${DEFAULT_TTS_CLI}

stt=${DEFAULT_STT_CLI}

itt=${DEFAULT_ITT_CLI}

vtt=${DEFAULT_VTT_CLI || "(empty — uses ITT via frame extraction)"}

agent=${DEFAULT_AGENT_CLI}

edit=${DEFAULT_EDIT_CLI}`);
    process.exit(0);
  }

  if (args.command === "vision") {
    const { main: visionMain } = await import("../vision/cli.mjs");
    await visionMain(process.argv);
    process.exit(0);
  }

  if (args.command === "preview") {
    // --storyboard implies --edit: show story structure fast (prompts as
    // placeholder components) and let user chat to reshape before generation.
    if (args.storyboard) args.edit = true;

    // Auto-detect: markdown files must use the player server (not Remotion Studio)
    const isMarkdown = args.file?.endsWith(".md");
    if (isMarkdown && !args.edit && !args.label) {
      args.edit = true;
    }

    if (args.label || args.edit) {
      const playerServer = join(__dirname, "..", "player", "server.mjs");
      if (!existsSync(playerServer)) {
        console.error("Player server not found at", playerServer);
        process.exit(1);
      }
      const labelFlag = args.label ? "--label" : "";
      const editFlag = args.edit ? "--edit" : "";
      const storyboardFlag = args.storyboard ? "--storyboard" : "";
      const portFlag = `--port=${args.port || 3001}`;
      const fileFlag = args.file || join(ROOT, "video.json");
      const port = args.port || 3001;
      // Pass variant flags to the server
      const variantFlags = args.variant.map(v => `--variant=${v}`);
      const serverArgs = [playerServer, resolve(fileFlag), labelFlag, editFlag, storyboardFlag, portFlag, ...variantFlags].filter(Boolean);
      const child = spawn("node", serverArgs, { cwd: ROOT, stdio: ["ignore", "pipe", "inherit"] });
      let serverReady = false;
      let stdoutBuffer = "";
      // Forward stdout and open browser once server is ready
      if (child.stdout) {
        child.stdout.on("data", (chunk) => {
          process.stdout.write(chunk);
          if (!serverReady && !args.noBrowser) {
            stdoutBuffer += chunk.toString();
            if (stdoutBuffer.includes("Player ready")) {
              serverReady = true;

              try {
                execSync(`open http://localhost:${port}`, { stdio: "ignore" });
              } catch {}
            }
          }
        });
      }
      child.on("exit", (code) => process.exit(code ?? 0));
      // Keep running until killed
      process.on("SIGINT", () => { child.kill(); process.exit(0); });
      process.on("SIGTERM", () => { child.kill(); process.exit(0); });
      return;
    }

    // Default: open Remotion Studio (JSON files only)
    const propsFlag = args.file ? `--props="${resolve(args.file)}"` : "";
    const forceNewFlag = args.forceNew ? "--force-new" : "";
    const cmd = `npx remotion studio --config=remotion.config.ts ${propsFlag} ${forceNewFlag}`;
    execSync(cmd, { cwd: ROOT, stdio: "inherit" });
    process.exit(0);
  }

  if (args.command === "render") {
    let streamTree;
    let rawInput = "";

    if (args.file) {
      const filePath = resolve(args.file);
      const raw = readFileSync(filePath, "utf-8");
      rawInput = raw;

      // Helper: all generated artifacts live under .markcut/generated/
      function generatedDir(filePath, sub) {
        return join(dirname(filePath), ".markcut", "generated", sub);
      }

      // Helper: per-variant output directory for subtitles and variant-specific artifacts
      function variantDir(filePath) {
        const base = dirname(filePath);
        const basename = filePath.split("/").pop().replace(/\.[^.]+$/, "");
        const variantLabel = args.variant && args.variant.length > 0 ? args.variant.join("-") : "";
        return variantLabel
          ? join(base, ".markcut", basename, variantLabel)
          : join(base, ".markcut", basename);
      }

      // Helper: resolve variants from the parsed descriptive root
      async function resolveWithVariants(descriptive, options) {
        const { resolveVariantOverrides, compileDescriptiveRoot, resolveAll } = await import("../player/pipeline.mjs");
        const { parseMarkdownVariants } = await import("../player/pipeline.mjs");

        let resolved = descriptive;

        // If variants are specified, apply variant-prefixed overrides
        if (args.variant && args.variant.length > 0) {
          // Also apply root config overrides from variant sections
          const parsed = parseMarkdownVariants(raw);
          const variantRoot = parsed.variants.get(args.variant[0]);
          if (variantRoot) {
            // Merge variant root config into base (tts, stt, width, height, etc.)
            const { variant, children: _, ...configOverrides } = variantRoot;
            resolved = { ...resolved, ...configOverrides };
          }
          // Apply leaf-level variant overrides (zh-src → src, etc.)
          resolved = resolveVariantOverrides(resolved, args.variant);
        }

        const final = await resolveAll(resolved, options);
        return compileDescriptiveRoot(final);
      }

      if (filePath.endsWith(".md")) {
        const { parseMarkdownVariants } = await import("../player/pipeline.mjs");
        const fileDir = dirname(filePath);
        const parsed = parseMarkdownVariants(raw);
        streamTree = await resolveWithVariants(parsed.base, {
          sourcePath: filePath,
          baseDir: fileDir,
          scriptOutputDir: generatedDir(filePath, "tts"),
          mediaOutputDir: generatedDir(filePath, "media"),
          includeOutputDir: generatedDir(filePath, "includes"),
          subtitleOutputDir: variantDir(filePath),
        });
      } else {
        const parsed = JSON.parse(raw);
        const root = parsed.root ?? parsed;
        const { isDescriptiveRoot, resolveAndCompile } = await import("../player/pipeline.mjs");
        if (isDescriptiveRoot(root)) {
          const fileDir = dirname(filePath);
          streamTree = await resolveAndCompile(root, {
            sourcePath: filePath,
            baseDir: fileDir,
            scriptOutputDir: generatedDir(filePath, "tts"),
            mediaOutputDir: generatedDir(filePath, "media"),
            includeOutputDir: generatedDir(filePath, "includes"),
            subtitleOutputDir: variantDir(filePath),
          });
        } else {
          streamTree = root;
        }
      }
    } else {
      console.error("Error: provide a stream tree file (.json or .md)");
      process.exit(1);
    }

    // Bundle the ```js imports``` component block (the preview server does this
    // post-compile; the render CLI must do it too, otherwise jsx components are
    // unregistered and slides render as unstyled raw text).
    if (!streamTree.imports) {
      const fenceMatch = rawInput.match(/^(```|~~~)\s*js imports\s*\n([\s\S]*?)^\1\s*$/m);
      const rawSource = fenceMatch ? fenceMatch[2] : (streamTree.importsBlock ?? null);
      if (rawSource && rawSource.trim()) {
        const { parseImportsBlock, extractDependencySpecs } = await import("../player/pipeline.mjs");
        const { bundleFromEntries } = await import("../player/bundler.mjs");
        const entries = parseImportsBlock(rawSource);
        const extraSpecs = extractDependencySpecs(rawSource);
        const bundleDir = join(ROOT, ".tmp", "component-bundle");
        mkdirSync(bundleDir, { recursive: true });
        const bundle = await bundleFromEntries(entries, extraSpecs, rawSource, bundleDir);
        if (bundle.url) {
          streamTree.imports = join(bundleDir, bundle.url.split("/").pop());
          console.log(`  \u2705 components \u2192 ${bundle.exports.join(", ")}`);
        }
      }
    }

    const output = args.output ? resolve(args.output) : join(ROOT, "out", "video.mp4");
    await renderOne(streamTree, output, args.verbose);

    console.log("\n✅ Render complete.");
    process.exit(0);
  }

/** Check if any audio node in the tree has a script field (needs TTS). */
function hasScript(root) {
  let found = false;
  function walk(nodes) {
    for (const n of nodes) {
      if (n.type === "audio" && n.script) { found = true; return; }
      if (n.children) walk(n.children);
    }
  }
  walk(root.children);
  return found;
}

  if (args.command === "verify") {
    const errors = [];
    const warnings = [];

    if (!args.file) {
      emitError("No input file provided. Usage: markcut verify <file.json|.md>");
      process.exit(1);
    }

    const filePath = resolve(args.file);
    if (!existsSync(filePath)) {
      emitError(`File not found: ${filePath}`);
      process.exit(1);
    }

    const raw = readFileSync(filePath, "utf-8");
    const isMarkdown = filePath.endsWith(".md");

    emitInfo(`File: ${filePath}`);
    emitInfo(`Format: ${isMarkdown ? "Markdown" : "JSON"}`);

    const { compileDescriptiveRoot, parseMarkdownDescriptive, parseMarkdownVariants, parseImportsBlock } = await import("../player/pipeline.mjs");

    try {
      let descriptive, needsTti, needsTtv;
      if (isMarkdown) {
        descriptive = parseMarkdownDescriptive(raw);

        // Check if content accidentally went into a variant section
        // (happens when root heading is e.g. "# My Movie" instead of "# video")
        const hasChildren = (descriptive.children?.length ?? 0) > 0;
        if (!hasChildren) {
          const variantResult = parseMarkdownVariants(raw);
          const variantNames = [...variantResult.variants.keys()];
          const variantChildren = variantNames.filter(n => (variantResult.variants.get(n)?.children?.length ?? 0) > 0);
          if (variantChildren.length > 0) {
            warnings.push(
              `No scenes found in the main section (use '# video' as the root heading). ` +
              `Content appears in variant section(s): ${variantChildren.join(", ")}`,
            );
          }
        }
      } else {
        const parsed = JSON.parse(raw);
        const root = parsed.root ?? parsed;

        if (root.type === "root" && root.isSeries !== undefined && !root.layout) {
          emitError("This looks like a compiled stream tree, not a descriptive file. Use 'markcut render' to render a compiled tree.");
          process.exit(1);
        }
        descriptive = root;
      }

      // ── Check 1: JSX components referenced in imports ──────────────────
      const importedNames = new Set(
        descriptive.importsBlock
          ? parseImportsBlock(descriptive.importsBlock).map((e) => e.name)
          : [],
      );

      function walk(nodes) {
        for (const n of nodes) {
          if (n.type === "component" && n.jsx) {
            const tagRe = /<\s*([A-Z][a-zA-Z0-9_.]*)/g;
            let m;
            while ((m = tagRe.exec(n.jsx)) !== null) {
              const tag = m[1];
              if (!importedNames.has(tag)) {
                errors.push(`Component "${tag}" used in jsx but not found in imports`);
              }
            }
          }
          if (n.children) walk(n.children);
        }
      }
      walk(descriptive.children);

      // ── Check media prompt needs ────────────────────────────────────────
      needsTti = false;
      needsTtv = false;
      function walkMedia(nodes) {
        for (const n of nodes) {
          if (n.type === "image" && n.prompt && !n.src) needsTti = true;
          if (n.type === "video" && n.prompt && !n.src) needsTtv = true;
          if (n.children) walkMedia(n.children);
        }
      }
      walkMedia(descriptive.children);

      // ── Results ─────────────────────────────────────────────────────────
      for (const w of warnings) emitWarn(w);
      if (errors.length > 0) {
        for (const e of errors) emitError(e);
        process.exit(1);
      }

      // Compile to validate
      const compiled = compileDescriptiveRoot(descriptive);
      emitSuccess(`Valid. Duration: ~${compiled.durationInSeconds ?? "?"}s, Scenes: ${compiled.children?.length ?? 0}`);
      process.exit(0);

    } catch (err) {
      emitError(err.message);
      process.exit(1);
    }
  }

  if (args.command === "resolve") {
    if (!args.file) {
      emitError("No input file provided. Usage: markcut resolve <file.json|.md> --output <path>");
      process.exit(1);
    }
    if (!args.output) {
      emitError("--output path is required. Usage: markcut resolve <file> --output <path>");
      process.exit(1);
    }

    const filePath = resolve(args.file);
    if (!existsSync(filePath)) {
      emitError(`File not found: ${filePath}`);
      process.exit(1);
    }

    const raw = readFileSync(filePath, "utf-8");
    const isMarkdown = filePath.endsWith(".md");

    emitInfo(`Resolving: ${filePath}`);

    const { resolveAndCompile, resolveAndCompileMarkdown, compileDescriptiveRoot, parseMarkdownDescriptive } = await import("../player/pipeline.mjs");

    const baseDir = dirname(filePath);
    const baseOpts = {
      sourcePath: filePath,
      baseDir,
      scriptOutputDir: args.scriptOutputDir || join(baseDir, "assets", "tts"),
      mediaOutputDir: args.mediaOutputDir || join(baseDir, "assets", "media"),
    };

    try {
      let result;
      let isCompiled = false;

      if (isMarkdown) {
        if (args.compile) {
          result = await resolveAndCompileMarkdown(raw, baseOpts);
          isCompiled = true;
        } else {
          const descriptive = parseMarkdownDescriptive(raw);
          const { resolveAll } = await import("../player/pipeline.mjs");
          result = await resolveAll(descriptive, baseOpts);
        }
      } else {
        const parsed = JSON.parse(raw);
        const root = parsed.root ?? parsed;
        const { isDescriptiveRoot } = await import("../player/pipeline.mjs");

        if (root.type === "root" && root.isSeries !== undefined && !root.layout) {
          result = root;
          isCompiled = true;
        } else if (isDescriptiveRoot(root)) {
          if (args.compile) {
            result = await resolveAndCompile(root, baseOpts);
            isCompiled = true;
          } else {
            const { resolveAll } = await import("../player/pipeline.mjs");
            result = await resolveAll(root, baseOpts);
          }
        } else {
          result = root;
        }
      }

      const output = resolve(args.output);
      mkdirSync(dirname(output), { recursive: true });
      writeFileSync(output, JSON.stringify(result, null, 2));
      emitSuccess(`Resolved → ${output}`);
      process.exit(0);
    } catch (err) {
      emitError(`Resolve failed: ${err.message}`);
      process.exit(1);
    }
  }

  if (args.command === "compile") {
    if (!args.file) {
      emitError("No input file provided. Usage: markcut compile <file.json|.md> --output <path>");
      process.exit(1);
    }
    if (!args.output) {
      emitError("--output path is required. Usage: markcut compile <file> --output <path>");
      process.exit(1);
    }

    const filePath = resolve(args.file);
    if (!existsSync(filePath)) {
      emitError(`File not found: ${filePath}`);
      process.exit(1);
    }

    const raw = readFileSync(filePath, "utf-8");
    const isMarkdown = filePath.endsWith(".md");

    emitInfo(`Compiling: ${filePath}`);

    const { compileDescriptiveRoot, parseMarkdownDescriptive } = await import("../player/pipeline.mjs");

    try {
      let descriptive;
      if (isMarkdown) {
        descriptive = parseMarkdownDescriptive(raw);
      } else {
        const parsed = JSON.parse(raw);
        const root = parsed.root ?? parsed;
        if (root.type === "root" && root.isSeries !== undefined && !root.layout) {
          emitError("Input is already a compiled stream tree. Use --output to save, or pass a descriptive file.");
          process.exit(1);
        }
        descriptive = root;
      }

      const compiled = compileDescriptiveRoot(descriptive);
      const output = resolve(args.output);
      mkdirSync(dirname(output), { recursive: true });
      writeFileSync(output, JSON.stringify(compiled, null, 2));
      emitSuccess(`Compiled → ${output}`);
      process.exit(0);
    } catch (err) {
      emitError(`Compile failed: ${err.message}`);
      process.exit(1);
    }
  }

  console.error(`Unknown command: ${args.command}`);
  usage();
  process.exit(1);
}

if (process.argv[1] && process.argv[1].endsWith("cli.mjs")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
