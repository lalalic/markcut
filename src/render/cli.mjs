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
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
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
  render <file.json>                    Render a stream tree to MP4
    --aspect <16x9|9x16|1x1|all>       Aspect ratio (default: 16x9)
    --output <path>                     Output path (default: out/video-{aspect}.mp4)
    --template <id>                     Use a template instead of raw stream tree
    --data <data.json>                  Data for template slots
    --verbose                           Show full per-frame progress (default: compact)

  templates                             List available templates
  preview <file.json>                   Open Remotion Studio with the stream tree
    --force-new                         Start a new Studio instance even if another is running
    --label                           Open player with label input overlay
    --edit                             Auto-reload player when JSON file changes (edit file, player refreshes)
    --port <num>                        Port for the player server (default: 3001)
`);
}

// Minimal template resolver (avoids importing TSX in Node)
function resolveTemplatePlaceholders(tree, data) {
  if (typeof tree === "string") {
    if (/^\$\{[^}]+\}$/.test(tree)) {
      const key = tree.slice(2, -1);
      return data[key] !== undefined ? data[key] : tree;
    }
    return tree.replace(/\$\{([^}]+)\}/g, (_, key) => {
      const val = data[key];
      return val !== undefined ? String(val) : `\${${key}}`;
    });
  }
  if (Array.isArray(tree)) return tree.map((item) => resolveTemplatePlaceholders(item, data));
  if (tree !== null && typeof tree === "object") {
    const result = {};
    for (const [k, v] of Object.entries(tree)) {
      result[k] = resolveTemplatePlaceholders(v, data);
    }
    return result;
  }
  return tree;
}

function loadTemplate(id) {
  const paths = [
    join(ROOT, "src", "templates", "marketing", `${id}.json`),
    join(ROOT, "src", "templates", "demo", `${id}.json`),
    join(ROOT, "src", "templates", "social", `${id}.json`),
    join(ROOT, "src", "templates", "personal", `${id}.json`),
  ];
  for (const p of paths) {
    if (existsSync(p)) return JSON.parse(readFileSync(p, "utf-8"));
  }
  throw new Error(`Template "${id}" not found. Searched: ${paths.join(", ")}`);
}

function parseArgs(argv) {
  const args = { command: "", file: "", aspect: "16x9", output: "", template: "", data: "", forceNew: false, verbose: false, label: false, chat: false, port: 3001 };
  let i = 2;
  if (argv[i]) args.command = argv[i++];
  if (argv[i] && !argv[i].startsWith("--")) args.file = argv[i++];
  while (i < argv.length) {
    const flag = argv[i++];
    if (flag === "--aspect" && argv[i]) args.aspect = argv[i++];
    else if (flag === "--output" && argv[i]) args.output = argv[i++];
    else if (flag === "--template" && argv[i]) args.template = argv[i++];
    else if (flag === "--data" && argv[i]) args.data = argv[i++];
    else if (flag === "--force-new") args.forceNew = true;
    else if (flag === "--verbose") args.verbose = true;
    else if (flag === "--label") args.label = true;
    else if (flag === "--edit") args.edit = true;
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

  if (args.command === "templates") {
    const dir = join(ROOT, "src", "templates");
    console.log("\nAvailable templates:\n");
    for (const category of ["marketing", "demo", "social", "personal"]) {
      const catDir = join(dir, category);
      if (!existsSync(catDir)) continue;
      for (const f of readdirSync(catDir)) {
        if (!f.endsWith(".json")) continue;
        const t = JSON.parse(readFileSync(join(catDir, f), "utf-8"));
        console.log(`  ${t.id.padEnd(20)} ${t.name} — ${t.description}`);
      }
    }
    console.log("");
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
      const modeFlags = "";
      const editFlag = args.edit ? "--edit" : "";
      const portFlag = `--port=${args.port || 3001}`;
      const fileFlag = args.file || join(ROOT, "video.json");
      const port = args.port || 3001;
      const serverArgs = [playerServer, resolve(fileFlag), modeFlags, editFlag, `--port=${port}`].filter(Boolean);
      console.log(`\n▶ Starting player${args.label ? " (label mode)" : ""}${args.edit ? " (edit mode)" : ""} at http://localhost:${port}\n`);
      const child = spawn("node", serverArgs, { cwd: ROOT, stdio: "inherit" });
      // Auto-open browser after short delay
      setTimeout(() => {
        try {
          execSync(`open http://localhost:${port}`, { stdio: "ignore" });
        } catch {}
      }, 1000);
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

    if (args.template) {
      const tmpl = loadTemplate(args.template);
      const data = args.data ? JSON.parse(readFileSync(resolve(args.data), "utf-8")) : {};

      if (tmpl.markdown) {
        // Descriptive markdown template: resolve placeholders in the string,
        // then parse and compile via the pipeline bundle
        const resolvedMd = tmpl.markdown.replace(/\$\{([^}]+)\}/g, (_, key) => {
          const val = data[key];
          return val !== undefined ? String(val) : `\${${key}}`;
        });
        const { compileDescriptiveRoot, parseMarkdownDescriptive } = await import("../player/pipeline.mjs");
        const descriptive = parseMarkdownDescriptive(resolvedMd, { mode: "compatible" });
        streamTree = compileDescriptiveRoot(descriptive, { mode: "draft" });
      } else {
        streamTree = resolveTemplatePlaceholders(tmpl.streamTree, data);
      }
    } else if (args.file) {
      const raw = JSON.parse(readFileSync(resolve(args.file), "utf-8"));
      streamTree = raw.root ?? raw;
    } else {
      console.error("Error: provide a stream tree file or --template <id>");
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

  console.error(`Unknown command: ${args.command}`);
  usage();
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
