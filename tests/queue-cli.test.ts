import { describe, expect, it } from "vitest";
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
  it("queues argv by default", () => {
    const r = queueArgv("/bin/echo", ["one two"], {});
    expect(r.command).toBe("/bin/sh");
    expect(r.argv[1]).toContain("queue-worker.mjs");
  });
});
