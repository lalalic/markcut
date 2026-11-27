/** Optional global queue CLI template for expensive Markcut operations. */
export function shellQuote(value) {
  return "'" + String(value).replace(/'/g, "'\\''") + "'";
}
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
const queueWorker = resolve(dirname(fileURLToPath(import.meta.url)), "queue-worker.mjs");
export function queueCommand(command, env = process.env, { timeoutMs } = {}) {
  if (timeoutMs !== undefined && (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0))
    throw Error('Invalid queue timeout');
  const template = env.MARKCUT_QUEUE_CLI_TEMPLATE;
  if (env.MARKCUT_QUEUE_ACTIVE === "1" || env.MARKCUT_QUEUE_ENABLED === "0") return command;
  if (!template) {
    // Default: own SQLite worker, started on demand by the queue runner.
    return `${shellQuote(process.execPath)} ${shellQuote(queueWorker)} run --queue media-ai${timeoutMs === undefined ? '' : ` --timeout ${timeoutMs}`} -- /bin/sh -c ${shellQuote(`MARKCUT_QUEUE_ACTIVE=1 ${command}`)}`;
  }
  if (!template.includes("{command}")) throw Error("MARKCUT_QUEUE_CLI_TEMPLATE must contain {command}");
  // Legacy custom queue templates may not expose a timeout knob. Preserve their
  // existing command contract; only templates with {timeout} can forward the
  // deadline policy to their own queue implementation.
  if (timeoutMs === 0 && !template.includes("{timeout}"))
    console.warn("Markcut: custom queue template cannot disable its own deadline without {timeout}");
  // The worker runs a shell to execute the original CLI without re-entering the queue.
  return template.replaceAll("{timeout}", String(timeoutMs ?? 300000))
    .replaceAll("{command}", shellQuote(`MARKCUT_QUEUE_ACTIVE=1 ${command}`));
}
export function queueArgv(command, argv, env = process.env, options = {}) {
  const { timeoutMs } = options;
  if (timeoutMs !== undefined && (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0))
    throw Error('Invalid queue timeout');
  const template = env.MARKCUT_QUEUE_CLI_TEMPLATE;
  if (env.MARKCUT_QUEUE_ACTIVE === "1" || env.MARKCUT_QUEUE_ENABLED === "0") return { command, argv };
  const cmd = [command, ...argv].map(shellQuote).join(" ");
  return { command: "/bin/sh", argv: ["-c", queueCommand(cmd, env, options)] };
}
