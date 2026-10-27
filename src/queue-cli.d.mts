export function queueCommand(command: string, env?: NodeJS.ProcessEnv): string;
export function queueArgv(command: string, argv: string[], env?: NodeJS.ProcessEnv): { command: string; argv: string[] };
export function shellQuote(value: string): string;
