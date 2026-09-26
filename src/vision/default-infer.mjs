#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { accessSync, constants, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const LOCAL_MODEL = process.env.MARKCUT_LOCAL_VISION_MODEL || "mlx-community/MiniCPM-V-4.6-bf16";

function parseArgs(argv) {
  let prompt = "";
  const inputs = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--prompt") prompt = argv[++i] || "";
    else if (arg === "--input") inputs.push(argv[++i]);
    else if (arg && !arg.startsWith("--")) inputs.push(arg.startsWith("@") ? arg.slice(1) : arg);
  }
  return { prompt, inputs: inputs.filter(Boolean) };
}

function which(name) {
  if (!name) return "";
  const candidates = name.includes("/") ? [name] : (process.env.PATH || "").split(":").filter(Boolean).map(dir => join(dir, name));
  for (const candidate of candidates) {
    try { accessSync(candidate, constants.X_OK); return candidate; } catch {}
  }
  return "";
}

function run(command, args, options = {}) {
  const r = spawnSync(command, args, { encoding: "utf8", timeout: options.timeout || 600_000, env: process.env });
  return { ok: r.status === 0, stdout: (r.stdout || "").trim(), stderr: (r.stderr || "").trim(), status: r.status };
}

function tryBrowser(prompt, inputs) {
  const explicit = process.env.MARKCUT_CHATGPT_BROWSER_INFER_CLI || "";
  const command = explicit || which("chatgpt-browser-infer");
  if (!command) return { ok: false, reason: "browser-infer-unavailable" };
  const args = ["--prompt", prompt];
  for (const input of inputs) args.push("--file", input);
  const r = run(command, args, { timeout: Number(process.env.MARKCUT_CHATGPT_VISION_TIMEOUT_MS) || 600_000 });
  return r.ok && r.stdout ? { ok: true, output: r.stdout } : { ok: false, reason: r.stderr || `browser-infer-exit-${r.status}` };
}

function tryCodex(prompt, inputs) {
  const codex = which("codex");
  if (!codex) return { ok: false, reason: "codex-unavailable" };
  const profiles = (process.env.MARKCUT_CODEX_VISION_PROFILES || "zai,default").split(",").map(s => s.trim()).filter(Boolean);
  const errors = [];
  for (const profile of profiles) {
    const dir = mkdtempSync(join(tmpdir(), "markcut-codex-vision-"));
    const output = join(dir, "result.txt");
    const args = ["exec", "--ephemeral", "--skip-git-repo-check"];
    if (profile !== "default") args.push("-p", profile);
    if (inputs.length) args.push("-i", ...inputs);
    args.push("-o", output, prompt);
    const r = run(codex, args, { timeout: Number(process.env.MARKCUT_CODEX_VISION_TIMEOUT_MS) || 600_000 });
    let text = "";
    if (existsSync(output)) text = readFileSync(output, "utf8").trim();
    rmSync(dir, { recursive: true, force: true });
    if (r.ok && text) return { ok: true, output: text };
    errors.push(`${profile}:${r.stderr || `exit-${r.status}`}`);
  }
  return { ok: false, reason: errors.join("; ") || "codex-failed" };
}

function tryLocal(prompt, inputs) {
  const uvx = which("uvx");
  if (!uvx) return { ok: false, reason: "uvx-unavailable" };
  const args = ["--from", "mlx-vlm", "mlx_vlm.generate", "--model", LOCAL_MODEL, "--max-tokens", "2048", "--prompt", prompt, "--image", ...inputs, "--temperature", "0.0", "--thinking-mode", "disabled"];
  const r = run(uvx, args, { timeout: Number(process.env.MARKCUT_LOCAL_VISION_TIMEOUT_MS) || 600_000 });
  return r.ok && r.stdout ? { ok: true, output: r.stdout } : { ok: false, reason: r.stderr || `local-vlm-exit-${r.status}` };
}

export function infer({ prompt, inputs }) {
  if (!prompt) throw new Error("--prompt is required");
  if (!inputs?.length) throw new Error("at least one image input is required");

  const attempts = [
    ["browser-chatgpt", () => tryBrowser(prompt, inputs)],
    ["codex", () => tryCodex(prompt, inputs)],
    ["local-vlm", () => tryLocal(prompt, inputs)],
  ];
  const failures = [];
  for (const [name, fn] of attempts) {
    const result = fn();
    if (result.ok) return result.output;
    failures.push(`${name}: ${result.reason}`);
  }
  throw new Error(`all vision backends failed (${failures.join(" | ")})`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const { prompt, inputs } = parseArgs(process.argv.slice(2));
    process.stdout.write(infer({ prompt, inputs }) + "\n");
  } catch (error) {
    process.stderr.write(`${error?.message || error}\n`);
    process.exit(1);
  }
}
