import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { parseArgs, prepareMedia, runVision } from "../src/vision/chatgpt-browser-cli.mjs";

const roots: string[] = [];
afterEach(() => { while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }); });
function temp() { const p = mkdtempSync(join(tmpdir(), "markcut-browser-test-")); roots.push(p); return p; }
function makeMock(root: string) {
  const path = join(root, "mock-worker.mjs");
  writeFileSync(path, `import {readFileSync,writeFileSync} from 'node:fs';\nconst p=readFileSync(process.env.MARKCUT_CHATGPT_PROMPT_FILE,'utf8');\nif(!p.includes('Output:\\nfile\\n'+process.env.MARKCUT_CHATGPT_OUTPUT_FILE)) process.exit(3);\nconst files=JSON.parse(process.env.MARKCUT_CHATGPT_MEDIA_FILES_JSON);\nif(!files.length||files.some(f=>!readFileSync(f))) process.exit(4);\nwriteFileSync(process.env.MARKCUT_CHATGPT_OUTPUT_FILE,'mock answer');\n`);
  return `node ${JSON.stringify(path)}`;
}

it("parses Markcut template-style image arguments", () => {
  const root = temp(); const a = join(root, "a.jpg"); const b = join(root, "b.jpg"); writeFileSync(a, "a"); writeFileSync(b, "b");
  const args = parseArgs(["--mode", "image", "--prompt", "describe", "--input", `@${a}`, b]);
  expect(args.mode).toBe("image"); expect(args.inputs).toEqual([a, b]);
});

it("uses a unique file output per invocation and propagates result", () => {
  const root = temp(); const image = join(root, "a.jpg"); writeFileSync(image, "image"); const launcher = makeMock(root);
  const env = { ...process.env, MARKCUT_CHATGPT_BROWSER_WORKER_CLI: launcher } as NodeJS.ProcessEnv;
  expect(runVision({ mode:"image", inputs:[image], prompt:"describe", timeoutMs:2000, maxFrames:8 }, env)).toBe("mock answer");
  expect(runVision({ mode:"image", inputs:[image], prompt:"describe again", timeoutMs:2000, maxFrames:8 }, env)).toBe("mock answer");
});

it("extracts deterministic chronological video representation", () => {
  const root = temp(); const video = join(root, "clip.mp4"); const work = join(root, "work");
  execFileSync("ffmpeg", ["-y", "-f", "lavfi", "-i", "testsrc=s=64x64:d=2:r=4", "-c:v", "libx264", video], { stdio:"ignore" });
  const prepared = prepareMedia("video", [video], work, 4);
  expect(prepared.files).toHaveLength(1); expect(existsSync(prepared.files[0])).toBe(true);
  expect(prepared.context).toContain("chronological"); expect(prepared.context).toContain("Duration:");
});

it("returns nonzero from CLI when launcher fails", () => {
  const root = temp(); const image = join(root, "a.jpg"); writeFileSync(image, "image");
  expect(() => execFileSync("node", ["src/vision/chatgpt-browser-cli.mjs", "--mode", "image", "--prompt", "x", "--input", image], { cwd: process.cwd(), env: { ...process.env, MARKCUT_CHATGPT_BROWSER_WORKER_CLI: "exit 7" }, stdio:"pipe" })).toThrow();
});

describe("concurrency", () => {
  it("does not collide across simultaneous invocations", async () => {
    const root = temp(); const image = join(root, "a.jpg"); writeFileSync(image, "image"); const launcher = makeMock(root);
    const env = { ...process.env, MARKCUT_CHATGPT_BROWSER_WORKER_CLI: launcher } as NodeJS.ProcessEnv;
    const results = await Promise.all(Array.from({length:4}, (_, i) => Promise.resolve().then(() => runVision({ mode:"image", inputs:[image], prompt:`p${i}`, timeoutMs:2000, maxFrames:8 }, env))));
    expect(results).toEqual(["mock answer", "mock answer", "mock answer", "mock answer"]);
  });
});
