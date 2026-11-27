import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { queueCommand, queueArgv } from "../src/queue-cli.mjs";
describe("global queue CLI template", () => {
  it("queues by default and allows explicit opt-out", () => {
    expect(queueCommand("echo one", {})).toContain("queue-worker.mjs' run --queue media-ai");
    expect(queueCommand("echo one", {MARKCUT_QUEUE_ENABLED:"0"})).toBe("echo one");
  });
  it("wraps a shell command with a recursion guard", () => {
    const env = { MARKCUT_QUEUE_CLI_TEMPLATE: "node queue.mjs run --queue media-ai -- /bin/sh -c {command}" };
    const result = queueCommand('echo "a b"', env);
    expect(result).toContain("MARKCUT_QUEUE_ACTIVE=1");
    expect(result).toContain("node queue.mjs run --queue media-ai");
    expect(queueCommand("echo no nested", {...env, MARKCUT_QUEUE_ACTIVE:"1"})).toBe("echo no nested");
  });
  it("rejects unusable templates", () => expect(() => queueCommand("echo 1", {MARKCUT_QUEUE_CLI_TEMPLATE:"invalid"})).toThrow(/\{command\}/));
  it("handles spawned CLI argv without escaping loss", () => {
    const r=queueArgv("python",["file with spaces", "quoted'word"],{MARKCUT_QUEUE_CLI_TEMPLATE:"queue run -- /bin/sh -c {command}"});
    expect(r.command).toBe("/bin/sh");expect(r.argv[1]).toContain("MARKCUT_QUEUE_ACTIVE");
  });
  it("preserves cancellation but removes queue time limits for inference", () => {
    const unlimited = queueCommand("echo infer", {}, {timeoutMs: 0});
    expect(unlimited).toContain("run --queue media-ai --timeout 0 --");
    expect(queueCommand("echo normal", {})).not.toContain("--timeout 0");
    const template = "queue run --timeout {timeout} -- /bin/sh -c {command}";
    expect(queueCommand("echo infer", {MARKCUT_QUEUE_CLI_TEMPLATE: template}, {timeoutMs: 0}))
      .toContain("--timeout 0 --");
    expect(queueCommand("echo infer", {MARKCUT_QUEUE_CLI_TEMPLATE: "queue -- {command}"}, {timeoutMs: 0}))
      .toContain("queue --");
    expect(() => queueCommand("echo infer", {}, {timeoutMs: -1})).toThrow(/Invalid queue timeout/);
    expect(() => queueArgv('node', ['script'], {MARKCUT_QUEUE_ENABLED:'0'}, {timeoutMs: -1})).toThrow(/Invalid queue timeout/);
  });
  it("executes an unbounded queue job and preserves its durable completion", () => {
    const queueHome = mkdtempSync(join(tmpdir(), "markcut-queue-deadline-test-"));
    const worker = resolve(import.meta.dirname, "../src/queue-worker.mjs");
    let workerPid = 0;
    try {
      const output = execFileSync(process.execPath, [worker, "run", "--queue", "media-ai",
        "--timeout", "0", "--", process.execPath, "-e",
        'setTimeout(() => process.stdout.write("QUEUE_DONE"), 200)'], {
        env: {...process.env, MARKCUT_QUEUE_HOME: queueHome}, encoding: "utf8", timeout: 12000,
      });
      expect(output).toContain("QUEUE_DONE");
      const inspect = execFileSync(process.execPath, ["-e",
        'const {DatabaseSync} = require("node:sqlite"); const db = new DatabaseSync(process.argv[1], {readOnly: true}); console.log(JSON.stringify(db.prepare("SELECT timeout, status, code FROM jobs LIMIT 1").get())); db.close();',
        join(queueHome, "queue.sqlite")], {encoding: "utf8"});
      expect(JSON.parse(inspect)).toMatchObject({timeout: 0, status: "completed", code: 0});
    } finally {
      const pidFile = join(queueHome, "worker.lock", "pid");
      if (existsSync(pidFile)) workerPid = Number(readFileSync(pidFile, "utf8"));
      if (workerPid > 1) {
        try { process.kill(workerPid, "SIGTERM"); } catch { /* already stopped */ }
      }
      rmSync(queueHome, {recursive: true, force: true});
    }
  });
  it("queues argv by default", () => {
    const r = queueArgv("/bin/echo", ["one two"], {});
    expect(r.command).toBe("/bin/sh");
    expect(r.argv[1]).toContain("queue-worker.mjs");
  });
});
