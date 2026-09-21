import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { parseArgs, prepareMedia, runVision } from "../src/vision/chatgpt-browser-cli.mjs";

const roots: string[] = [];
afterEach(() => { while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }); });
function temp() { const p = mkdtempSync(join(tmpdir(), "markcut-browser-test-")); roots.push(p); return p; }

function makeMock(root: string, { failVideo = false } = {}) {
  const path = join(root, "mock-infer.mjs");
  writeFileSync(path, `
const args=process.argv.slice(2);
const files=[];
let prompt='';
for(let i=0;i<args.length;i++){
  if(args[i]==='--prompt') prompt=args[++i];
  else if(args[i]==='--file') files.push(args[++i]);
}
if(!prompt.includes('Media context:')) process.exit(3);
if(!files.length) process.exit(4);
if(${failVideo ? "true" : "false"} && files.some(f=>f.endsWith('.mp4'))) process.exit(7);
process.stdout.write(JSON.stringify({prompt,files})+'\\n');
`);
  return `node ${JSON.stringify(path)}`;
}

it("parses Markcut template-style image arguments", () => {
  const root = temp(); const a = join(root, "a.jpg"); const b = join(root, "b.jpg"); writeFileSync(a, "a"); writeFileSync(b, "b");
  const args = parseArgs(["--mode", "image", "--prompt", "describe", "--input", `@${a}`, b]);
  expect(args.mode).toBe("image"); expect(args.inputs).toEqual([a, b]);
});

it("returns synchronous browser inference stdout", () => {
  const root = temp(); const image = join(root, "a.jpg"); writeFileSync(image, "image"); const launcher = makeMock(root);
  const env = { ...process.env, MARKCUT_CHATGPT_BROWSER_INFER_CLI: launcher } as NodeJS.ProcessEnv;
  const result = JSON.parse(runVision({ mode:"image", inputs:[image], prompt:"describe", timeoutMs:2000, maxFrames:8 }, env));
  expect(result.files).toEqual([image]);
  expect(result.prompt).toContain("Image: a.jpg");
});

it("extracts deterministic chronological video representation", () => {
  const root = temp(); const video = join(root, "clip.mp4"); const work = join(root, "work");
  execFileSync("ffmpeg", ["-y", "-f", "lavfi", "-i", "testsrc=s=64x64:d=2:r=4", "-c:v", "libx264", video], { stdio:"ignore" });
  const prepared = prepareMedia("video", [video], work, 4);
  expect(prepared.files).toHaveLength(1); expect(existsSync(prepared.files[0])).toBe(true);
  expect(prepared.context).toContain("chronological"); expect(prepared.context).toContain("Duration:");
  expect(prepared.context).toContain("frame-001.jpg"); expect(prepared.context).toContain("frame-002.jpg");
});

it("uses deterministic frame analysis for video by default", () => {
  const root = temp(); const video = join(root, "clip.mp4");
  execFileSync("ffmpeg", ["-y", "-f", "lavfi", "-i", "testsrc=s=64x64:d=2:r=4", "-c:v", "libx264", video], { stdio:"ignore" });
  const launcher = makeMock(root);
  const env = { ...process.env, MARKCUT_CHATGPT_BROWSER_INFER_CLI: launcher } as NodeJS.ProcessEnv;
  delete env.MARKCUT_CHATGPT_DIRECT_VIDEO;
  const result = JSON.parse(runVision({ mode:"video", inputs:[video], prompt:"describe chronology", timeoutMs:4000, maxFrames:4 }, env));
  expect(result.files).toHaveLength(1);
  expect(result.files[0]).toContain("contact-sheet.jpg");
  expect(result.prompt).toContain("Using deterministic frame analysis");
});

it("can opt into direct video and falls back to deterministic frames", () => {
  const root = temp(); const video = join(root, "clip.mp4");
  execFileSync("ffmpeg", ["-y", "-f", "lavfi", "-i", "testsrc=s=64x64:d=2:r=4", "-c:v", "libx264", video], { stdio:"ignore" });
  const launcher = makeMock(root, { failVideo: true });
  const env = { ...process.env, MARKCUT_CHATGPT_BROWSER_INFER_CLI: launcher, MARKCUT_CHATGPT_DIRECT_VIDEO: "1" } as NodeJS.ProcessEnv;
  const result = JSON.parse(runVision({ mode:"video", inputs:[video], prompt:"describe chronology", timeoutMs:4000, maxFrames:4 }, env));
  expect(result.files).toHaveLength(1);
  expect(result.files[0]).toContain("contact-sheet.jpg");
  expect(result.prompt).toContain("Direct video upload failed");
});

it("requests strict JSON validation when prompt requires JSON", () => {
  const root = temp(); const image = join(root, "a.jpg"); writeFileSync(image, "image");
  const path = join(root, "expect-json.mjs");
  writeFileSync(path, `
if(!process.argv.includes('--expect-json')) process.exit(9);
process.stdout.write('{"ok":true}\\n');
`);
  const env = { ...process.env, MARKCUT_CHATGPT_BROWSER_INFER_CLI: `node ${JSON.stringify(path)}` } as NodeJS.ProcessEnv;
  expect(runVision({ mode:"image", inputs:[image], prompt:"Return JSON only", timeoutMs:2000, maxFrames:8 }, env)).toBe('{"ok":true}');
});

it("returns nonzero from CLI when inference fails", () => {
  const root = temp(); const image = join(root, "a.jpg"); writeFileSync(image, "image");
  expect(() => execFileSync("node", ["src/vision/chatgpt-browser-cli.mjs", "--mode", "image", "--prompt", "x", "--input", image], { cwd: process.cwd(), env: { ...process.env, MARKCUT_CHATGPT_BROWSER_INFER_CLI: "exit 7" }, stdio:"pipe" })).toThrow();
});

describe("concurrency contract", () => {
  it("keeps per-invocation media state isolated", async () => {
    const root = temp(); const image = join(root, "a.jpg"); writeFileSync(image, "image"); const launcher = makeMock(root);
    const env = { ...process.env, MARKCUT_CHATGPT_BROWSER_INFER_CLI: launcher } as NodeJS.ProcessEnv;
    const results = await Promise.all(Array.from({ length: 4 }, (_, i) => Promise.resolve().then(() => runVision({ mode: "image", inputs: [image], prompt: `p${i}`, timeoutMs: 2000, maxFrames: 8 }, env))));
    expect(results.map((x) => JSON.parse(x).prompt)).toHaveLength(4);
  });
});
