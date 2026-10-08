/** Local-only diagnostics log: a small ring buffer in chrome.storage.local. Nothing is sent anywhere. */
export interface LogEntry {
  t: number;
  level: 'info' | 'warn' | 'error';
  msg: string;
}

export const LOG_KEY = 'log';
export const MAX_ENTRIES = 100;
const MAX_LENGTH = 300;

let chain: Promise<unknown> = Promise.resolve();

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Append an entry. Never throws and never blocks the caller; writes are serialised. */
export function log(level: LogEntry['level'], msg: string, error?: unknown): void {
  const text = (error === undefined ? msg : `${msg}: ${describe(error)}`).slice(0, MAX_LENGTH);
  console[level === 'info' ? 'log' : level](`noleaker: ${text}`);
  chain = chain
    .then(async () => {
      const current = ((await chrome.storage.local.get(LOG_KEY))[LOG_KEY] ?? []) as LogEntry[];
      current.push({ t: Date.now(), level, msg: text });
      await chrome.storage.local.set({ [LOG_KEY]: current.slice(-MAX_ENTRIES) });
    })
    .catch(() => undefined);
}

export async function readLog(): Promise<LogEntry[]> {
  return ((await chrome.storage.local.get(LOG_KEY))[LOG_KEY] ?? []) as LogEntry[];
}

export async function clearLog(): Promise<void> {
  await chrome.storage.local.remove(LOG_KEY);
}

export function formatLog(entries: readonly LogEntry[]): string {
  return entries
    .map((e) => `${new Date(e.t).toISOString()} ${e.level.toUpperCase().padEnd(5)} ${e.msg}`)
    .join('\n');
}
