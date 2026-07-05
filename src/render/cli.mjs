#!/usr/bin/env node
/**
 * CLI entry point for the Remotion engine.
 *
 * Usage:
 *   node render/cli.mjs render <stream.json> [--aspect 16x9|9x16|1x1|all] [--output out.mp4]
 *   node render/cli.mjs render --template <id> --data <data.json> [--aspect all]
 *   node render/cli.mjs templates  — list available templates
 *   node render/cli.mjs preview <stream.json> [--force-new]  — open Remotion Studio
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

function usage() {
  console.log(`
markcut CLI

Commands:
  render <file.json|.md>                Render a stream tree or markdown to MP4
    --aspect <16x9|9x16|1x1|all>       Aspect ratio (default: 16x9)
    --output <path>                     Output path (default: out/video-{aspect}.mp4)
    --verbose                           Show full per-frame progress (default: compact)

  preview <file.json|.md>               Open player with live preview
    --edit                             Auto-reload on file change
    --label                           Open label input overlay
    --no-browser                      Skip opening browser automatically
    --port <num>                        Port for the player server (default: 3001)

  verify <file.json|.md>                Parse and validate a descriptive file without rendering
    --strict                           Use strict mode parsing (error on unknowns)
`);
}

function parseArgs(argv) {
  const args = { command: "", file: "", aspect: "16x9", output: "", forceNew: false, verbose: false, label: false, edit: false, noBrowser: false, strict: false, chat: false, port: 3001 };
  let i = 2;
  if (argv[i]) args.command = argv[i++];
  if (argv[i] && !argv[i].startsWith("--")) args.file = argv[i++];
  while (i < argv.length) {
    const flag = argv[i++];
    if (flag === "--aspect" && argv[i]) args.aspect = argv[i++];
    else if (flag === "--output" && argv[i]) args.output = argv[i++];
    else if (flag === "--strict") args.strict = true;
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
    // Custom player modes
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
      console.log(`\n▶ Starting player${args.label ? " (label mode)" : ""}${args.edit ? " (edit mode)" : ""} at http://localhost:${port}\n`);
      const child = spawn("node", serverArgs, { cwd: ROOT, stdio: "inherit" });
      // Auto-open browser after short delay (unless --no-browser)
      if (!args.noBrowser) {
        setTimeout(() => {
          try {
            execSync(`open http://localhost:${port}`, { stdio: "ignore" });
          } catch {}
        }, 1000);
      }
      child.on("exit", (code) => process.exit(code ?? 0));
      // Keep running until killed
      process.on("SIGINT", () => { child.kill(); process.exit(0); });
      process.on("SIGTERM", () => { child.kill(); process.exit(0); });
      return;
    }

    // Default: open Remotion Studio
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
        // Markdown descriptive → parse + compile
        const { compileDescriptiveRoot, parseMarkdownDescriptive } = await import("../player/pipeline.mjs");
        const descriptive = parseMarkdownDescriptive(raw, { mode: "compatible" });
        streamTree = compileDescriptiveRoot(descriptive, { mode: "draft" });
      } else {
        const parsed = JSON.parse(raw);
        const root = parsed.root ?? parsed;
        // Check if descriptive JSON
        const { isDescriptiveRoot, resolveAndCompile } = await import("../player/pipeline.mjs");
        if (isDescriptiveRoot(root)) {
          streamTree = await resolveAndCompile(root, { baseDir: dirname(filePath), mode: "draft" });
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

  if (args.command === "verify") {
    if (!args.file) {
      console.error("Error: provide a descriptive file (.json or .md)");
      process.exit(1);
    }

    const filePath = resolve(args.file);
    if (!existsSync(filePath)) {
      console.error(`Error: file not found: ${filePath}`);
      process.exit(1);
    }

    const raw = readFileSync(filePath, "utf-8");
    const isMarkdown = filePath.endsWith(".md");
    const mode = args.strict ? "strict" : "compatible";

    console.log(`\n📄 File: ${filePath}`);
    console.log(`📋 Format: ${isMarkdown ? "Markdown" : "JSON"}`);
    console.log(`⚙️  Mode: ${mode}\n`);

    const { compileDescriptiveRoot, parseMarkdownDescriptive, isDescriptiveRoot, resolveAndCompile } = await import("../player/pipeline.mjs");

    let descriptive;
    if (isMarkdown) {
      descriptive = parseMarkdownDescriptive(raw, { mode });
    } else {
      const parsed = JSON.parse(raw);
      const root = parsed.root ?? parsed;

      // Accept any object that can compile as descriptive root
      // If it fails, it might be a compiled stream tree
      try {
        // Quick sanity: compiled trees have `type: "root"` at top level
        // while descriptive roots have `children` but no `type` or `type` is something else
        if (root.type === "root" && root.isSeries !== undefined && !root.layout) {
          console.error("✗ This looks like a compiled stream tree (has type:'root' and isSeries).");
          console.error("  Use 'markcut render' to render a compiled tree.");
          process.exit(1);
        }
        descriptive = root;
        // Try compiling to validate it's a valid descriptive root
        compileDescriptiveRoot(descriptive, { mode: "draft" });
      } catch (compileErr) {
        // If compile fails but it has standard stream tree fields, suggest render
        if (root.type === "root" || root.type === "folder" || root.actions) {
          console.error("✗ This looks like a compiled stream tree (use 'render' instead of 'verify').");
        } else {
          console.error(`✗ Parse error: ${compileErr.message}`);
        }
        process.exit(1);
      }
    }

    console.log("── Descriptive Root ──────────────────────────────");
    console.log(JSON.stringify(descriptive, null, 2));

    try {
      const compiled = compileDescriptiveRoot(descriptive, { mode: "draft" });
      console.log("\n── Compiled Stream Tree ──────────────────────────");
      console.log(JSON.stringify(compiled, null, 2));

      console.log(`\n✅ Valid. Duration: ${compiled.durationInSeconds ?? "?"}s, Children: ${compiled.children?.length ?? 0}`);
      process.exit(0);
    } catch (err) {
      console.error(`\n❌ Compilation error: ${err.message}`);
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
