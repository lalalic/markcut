import { afterEach, describe, expect, it } from "vitest";
import { chmodSync, mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync, execFileSync } from "node:child_process";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const HELPER = join(ROOT, "src", "vision", "default-infer.mjs");
const tempDirs: string[] = [];

function tempBin() {
  const dir = mkdtempSync(join(tmpdir(), "markcut-vision-test-"));
  tempDirs.push(dir);
  return dir;
}

function script(dir: string, name: string, body: string) {
  const path = join(dir, name);
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
}

function runHelper(bin: string) {
  return spawnSync(process.execPath, [HELPER, "--prompt", "describe", "/tmp/a.jpg"], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}:/bin:/usr/bin`,
      MARKCUT_CHATGPT_BROWSER_INFER_CLI: "",
      MARKCUT_CODEX_VISION_PROFILES: "zai,default",
      // This suite tests fallback order, not queue supervision. Keep it independent
      // of the host's long-lived media-ai worker version.
      MARKCUT_QUEUE_ENABLED: "0",
    },
  });
}

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    const pidPath=join(dir,'queue','worker.lock','pid');
    if(existsSync(pidPath)) {
      const pid=Number(readFileSync(pidPath,'utf8'));
      if(pid>1)try{process.kill(pid,'SIGTERM');}catch{}
      await new Promise(resolve=>setTimeout(resolve,200));
    }
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("default vision inference priority", () => {
  it("uses Browser ChatGPT first", () => {
    const bin = tempBin();
    script(bin, "chatgpt-browser-infer", 'echo browser-result');
    script(bin, "codex", 'echo codex-should-not-run >&2; exit 9');
    script(bin, "uvx", 'echo local-should-not-run >&2; exit 9');
    const r = runHelper(bin);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe("browser-result");
  });

  it("falls back to Codex after Browser ChatGPT failure", () => {
    const bin = tempBin();
    script(bin, "chatgpt-browser-infer", 'exit 2');
    script(bin, "codex", 'out=""; while [ "$#" -gt 0 ]; do if [ "$1" = "-o" ]; then out="$2"; shift 2; else shift; fi; done; echo codex-result > "$out"');
    script(bin, "uvx", 'echo local-should-not-run >&2; exit 9');
    const r = runHelper(bin);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe("codex-result");
  });

  it("uses local VLM only after Browser ChatGPT and Codex fail", () => {
    const bin = tempBin();
    script(bin, "chatgpt-browser-infer", 'exit 2');
    script(bin, "codex", 'exit 3');
    script(bin, "uvx", 'echo local-result');
    const r = runHelper(bin);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe("local-result");
  });

  it("records no inference deadline in the real queue and exits after result", async () => {
    const bin = tempBin();
    const queueHome=join(bin,'queue');
    script(bin,'chatgpt-browser-infer','echo browser-result');
    const result=spawnSync(process.execPath,[HELPER,'--prompt','describe','/tmp/a.jpg'],{
      encoding:'utf8',timeout:14000,
      env:{...process.env,PATH:`${bin}:/bin:/usr/bin`,MARKCUT_CHATGPT_BROWSER_INFER_CLI:'',MARKCUT_QUEUE_HOME:queueHome,MARKCUT_QUEUE_ENABLED:'1'},
    });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('browser-result');
    const code='const {DatabaseSync}=require("node:sqlite");const db=new DatabaseSync(process.argv[1],{readOnly:true});console.log(JSON.stringify(db.prepare("SELECT status,timeout FROM jobs LIMIT 1").get()));db.close()';
    const row=JSON.parse(execFileSync(process.execPath,['-e',code,join(queueHome,'queue.sqlite')],{encoding:'utf8'}));
    expect(row).toMatchObject({status:'completed',timeout:0});
  });
  it("config defaults ITT to the policy helper and VTT to frame-based ITT", () => {
    const code = 'import("./src/config.mjs").then(m => console.log(JSON.stringify({itt:m.DEFAULT_ITT_CLI,vtt:m.DEFAULT_VTT_CLI})))';
    const env = { ...process.env } as Record<string, string>;
    delete env.MARKCUT_ITT_CLI;
    delete env.MARKCUT_VTT_CLI;
    const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], { cwd: ROOT, encoding: "utf8", env });
    expect(r.status).toBe(0);
    const value = JSON.parse(r.stdout.trim());
    expect(value.itt).toContain("default-infer.mjs");
    expect(value.vtt).toBe("");
  });
});
