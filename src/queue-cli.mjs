/** Optional global queue CLI template for expensive Markcut operations. */
export function shellQuote(value) {
  return "'" + String(value).replace(/'/g, "'\\''") + "'";
}
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
const queueWorker = resolve(dirname(fileURLToPath(import.meta.url)), "queue-worker.mjs");
export function queueCommand(command, env = process.env) {
  const template = env.MARKCUT_QUEUE_CLI_TEMPLATE;
  if (env.MARKCUT_QUEUE_ACTIVE === "1" || env.MARKCUT_QUEUE_ENABLED === "0") return command;
  if (!template) {
    // Default: own SQLite worker, started on demand by the queue runner.
    return `${shellQuote(process.execPath)} ${shellQuote(queueWorker)} run --queue media-ai -- /bin/sh -c ${shellQuote(`MARKCUT_QUEUE_ACTIVE=1 ${command}`)}`;
  }
  if (!template.includes("{command}")) throw Error("MARKCUT_QUEUE_CLI_TEMPLATE must contain {command}");
  // The worker runs a shell to execute the original CLI without re-entering the queue.
  return template.replaceAll("{command}", shellQuote(`MARKCUT_QUEUE_ACTIVE=1 ${command}`));
}
export function queueArgv(command, argv, env = process.env) {
  const template = env.MARKCUT_QUEUE_CLI_TEMPLATE;
  if (env.MARKCUT_QUEUE_ACTIVE === "1" || env.MARKCUT_QUEUE_ENABLED === "0") return { command, argv };
  const cmd = [command, ...argv].map(shellQuote).join(" ");
  return { command: "/bin/sh", argv: ["-c", queueCommand(cmd, env)] };
}
