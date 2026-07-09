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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "../..");

const ASPECTS = {
  "16x9": { width: 1920, height: 1080 },
  "9x16": { width: 1080, height: 1920 },
  "1x1": { width: 1080, height: 1080 },
};

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

Commands:

  compile <file> --output <path>        Parse + compile → stream tree JSON (sync, no I/O)

  verify <file>                         Parse + validate descriptive file
    --cli                             Check required CLI tools are installed

  resolve <file> --output <path>        Run async pipeline: TTS, STT, media durations
    --script-output-dir <dir>           Directory for generated TTS/STT files
    --media-output-dir <dir>            Directory for generated TTI/TTV media files
    --compile                          Also compile to stream tree after resolving

  render <file.json|.md>                Resolve + compile + render to MP4
    --aspect <16x9|9x16|1x1|all>       Aspect ratio (default: 16x9)
    --output <path>                     Output path (default: out/video-{aspect}.mp4)
    --verbose                           Show full per-frame progress (default: compact)

  preview <file.json|.md>               Open player with live preview
    --edit                             Auto-reload on file change
    --label                           Open label input overlay
    --no-browser                      Skip opening browser automatically
    --port <num>                        Port for the player server (default: 3001)
`);
}

function parseArgs(argv) {
  const args = { command: "", file: "", aspect: "16x9", output: "", forceNew: false, verbose: false, label: false, edit: false, noBrowser: false, chat: false, port: 3001, compile: false, cli: false, scriptOutputDir: "", mediaOutputDir: "" };
  let i = 2;
  if (argv[i]) args.command = argv[i++];
  if (argv[i] && !argv[i].startsWith("--")) args.file = argv[i++];
  while (i < argv.length) {
    const flag = argv[i++];
    if (flag === "--aspect" && argv[i]) args.aspect = argv[i++];
    else if (flag === "--output" && argv[i]) args.output = argv[i++];
    else if (flag === "--script-output-dir" && argv[i]) args.scriptOutputDir = argv[i++];
    else if (flag === "--media-output-dir" && argv[i]) args.mediaOutputDir = argv[i++];
    else if (flag === "--cli") args.cli = true;
    else if (flag === "--compile") args.compile = true;
    else if (flag === "--force-new") args.forceNew = true;
    else if (flag === "--verbose") args.verbose = true;
    else if (flag === "--label") args.label = true;
    else if (flag === "--edit") args.edit = true;
    else if (flag === "--no-browser") args.noBrowser = true;
    else if (flag === "--port" && argv[i]) args.port = parseInt(argv[i], 10);
    else if (flag.startsWith("--port=")) args.port = parseInt(flag.split("=")[1], 10);
  }
  return args;
}

/**
 * Render one aspect ratio with compact progress output.
 *
 * In compact mode (default), "Rendered X/Y" lines are shown only every
 * PROGRESS_INTERVAL frames and at the final frame, drastically reducing
 * token consumption when output is captured by an LLM agent.
 *
 * Use --verbose to see every frame line (original behavior).
 */
function renderOne(streamTree, aspect, outputPath, verbose) {
  const dims = ASPECTS[aspect];
  if (!dims) throw new Error(`Unknown aspect: ${aspect}`);

  const adapted = { ...streamTree, width: dims.width, height: dims.height };
  const tmpProps = join(ROOT, ".tmp", `render-${aspect}.json`);
  mkdirSync(dirname(tmpProps), { recursive: true });
  writeFileSync(tmpProps, JSON.stringify({ root: adapted }));

  mkdirSync(dirname(outputPath), { recursive: true });

  console.log(`\n▶ Rendering ${aspect} → ${outputPath}`);

  return new Promise((resolvePromise, reject) => {
    const proc = spawn("npx", ["remotion", "render", "Root", outputPath, "--props", tmpProps, "--config", "remotion.config.ts"], { cwd: ROOT, stdio: ["ignore", "inherit", "pipe"] });

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
  const args = parseArgs(process.argv);

  if (!args.command || args.command === "help" || args.command === "--help") {
    usage();
    process.exit(0);
  }

  if (args.command === "preview") {
    // Auto-detect: markdown files must use the player server (not Remotion Studio)
    const isMarkdown = args.file?.endsWith(".md");
    if (isMarkdown && !args.edit && !args.label) {
      args.edit = true;
    }

    if (args.label || args.edit) {
      const playerServer = args.label
        ? join(__dirname, "..", "player", "label-server.mjs")
        : join(__dirname, "..", "player", "server.mjs");
      if (!existsSync(playerServer)) {
        console.error("Player server not found at", playerServer);
        process.exit(1);
      }
      const modeFlags = args.noBrowser ? "--no-browser" : "";
      const editFlag = args.edit ? "--edit" : "";
      const portFlag = `--port=${args.port || 3001}`;
      const fileFlag = args.file || join(ROOT, "video.json");
      const port = args.port || 3001;
      const serverArgs = [playerServer, resolve(fileFlag), modeFlags, editFlag, `--port=${port}`].filter(Boolean);
      const child = spawn("node", serverArgs, { cwd: ROOT, stdio: ["ignore", "pipe", "inherit"] });
      let serverReady = false;
      let stdoutBuffer = "";
      // Forward stdout and open browser once server is ready
      if (child.stdout) {
        child.stdout.on("data", (chunk) => {
          process.stdout.write(chunk);
          if (!serverReady && !args.noBrowser) {
            stdoutBuffer += chunk.toString();
            if (stdoutBuffer.includes("Player ready") || stdoutBuffer.includes("Label Preview")) {
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

    if (args.file) {
      const filePath = resolve(args.file);
      const raw = readFileSync(filePath, "utf-8");

      if (filePath.endsWith(".md")) {
        // Markdown → resolve (TTS/STT) + compile → stream tree
        const { resolveAndCompileMarkdown } = await import("../player/pipeline.mjs");
        streamTree = await resolveAndCompileMarkdown(raw, { baseDir: dirname(filePath) });
      } else {
        const parsed = JSON.parse(raw);
        const root = parsed.root ?? parsed;
        // Check if descriptive JSON
        const { isDescriptiveRoot, resolveAndCompile } = await import("../player/pipeline.mjs");
        if (isDescriptiveRoot(root)) {
          streamTree = await resolveAndCompile(root, { baseDir: dirname(filePath) });
        } else {
          streamTree = root;
        }
      }
    } else {
      console.error("Error: provide a stream tree file (.json or .md)");
      process.exit(1);
    }

    const aspects = args.aspect === "all" ? Object.keys(ASPECTS) : [args.aspect];

    for (const aspect of aspects) {
      const output = args.output && aspects.length === 1
        ? resolve(args.output)
        : join(ROOT, "out", `video-${aspect}.mp4`);
      await renderOne(streamTree, aspect, output, args.verbose);
    }

    console.log("\n✅ All renders complete.");
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

    const { compileDescriptiveRoot, parseMarkdownDescriptive, parseImportsBlock } = await import("../player/pipeline.mjs");

    try {
      let descriptive, needsTti, needsTtv;
      if (isMarkdown) {
        descriptive = parseMarkdownDescriptive(raw);
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
        (descriptive.imports ?? [])
          .map((e) => e.name)
          .concat(
            descriptive.importsBlock
              ? parseImportsBlock(descriptive.importsBlock).map((e) => e.name)
              : [],
          ),
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

      // ── Check 2: CLI tool availability (--cli flag) ────────────────────
      if (args.cli) {
        function extractCmd(configStr) {
          if (!configStr) return null;
          return configStr.trim().split(/\s+/)[0] || null;
        }

        const pipelineConfigs = [
          { type: "TTS", config: descriptive.tts, defaultCmd: "edge-tts", needsCheck: hasScript(descriptive) },
          { type: "STT", config: descriptive.stt, defaultCmd: "whisper", needsCheck: hasScript(descriptive) },
          { type: "TTI", config: descriptive.tti, defaultCmd: "pi", needsCheck: needsTti },
          { type: "TTV", config: descriptive.ttv, defaultCmd: "pi", needsCheck: needsTtv },
        ];

        const checked = new Set();
        for (const p of pipelineConfigs) {
          if (!p.needsCheck) continue;
          const cmd = extractCmd(p.config) || p.defaultCmd;
          if (checked.has(cmd)) continue;
          checked.add(cmd);
          const { execSync } = await import("node:child_process");
          try {
            execSync(`which ${cmd}`, { stdio: "ignore" });
          } catch {
            const hints = {
              "pi": " (pip install pi-sdk)",
              "edge-tts": " (pip install edge-tts)",
              "whisper": " (pip install openai-whisper)",
            };
            errors.push(`CLI tool "${cmd}" not found${hints[cmd] || ""}. Required by ${p.type}`);
          }
        }
      }

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

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
