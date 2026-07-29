export interface CacheEntry {
  status: string;
  raw: unknown;
  cachedAt: number; // Date.now()
  isTerminal: boolean;
}

const TTL_MS = 3000; // 3 seconds for non-terminal entries
const TERMINAL_RETENTION_MS = 60_000; // 60 seconds minimum for terminal entries

// Module-level singleton cache — keyed by `${NODE_ENV}:${id}`
const cache = new Map<string, CacheEntry>();

function buildKey(id: string): string {
  return `${process.env.NODE_ENV ?? 'development'}:${id}`;
}

export function get(id: string): CacheEntry | undefined {
  return cache.get(buildKey(id));
}

export function set(id: string, entry: CacheEntry): void {
  cache.set(buildKey(id), entry);
}

/**
 * Returns true if the entry is still fresh and should be served from cache.
 * - Non-terminal: fresh if age < TTL_MS (3s)
 * - Terminal: retained for at least TERMINAL_RETENTION_MS (60s)
 */
export function isFresh(entry: CacheEntry): boolean {
  const age = Date.now() - entry.cachedAt;
  if (entry.isTerminal) {
    return age < TERMINAL_RETENTION_MS;
  }
  return age < TTL_MS;
}

export function clear(): void {
  cache.clear();
}
