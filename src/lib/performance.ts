/**
 * In-process performance metrics store.
 * Tracks API response times and DB query durations using a fixed-size
 * circular buffer. Computes p50/p95/p99 percentiles on demand.
 * No external dependencies — works in the Next.js Node.js runtime.
 */

const BUFFER_SIZE = 500;

export interface TimingEntry {
  route: string;
  method: string;
  durationMs: number;
  statusCode: number;
  timestamp: number;
}

export interface QueryEntry {
  query: string; // first 80 chars, no values
  durationMs: number;
  timestamp: number;
}

export interface VitalEntry {
  name: string;
  value: number;
  rating: string;
  url: string;
  timestamp: number;
}

export interface PercentileStats {
  p50: number;
  p95: number;
  p99: number;
  avg: number;
  min: number;
  max: number;
  count: number;
}

// ── Circular buffer ───────────────────────────────────────────────────────────

class CircularBuffer<T> {
  private buf: T[] = [];
  private pos = 0;
  private full = false;

  constructor(private readonly size: number) {}

  push(item: T): void {
    this.buf[this.pos] = item;
    this.pos = (this.pos + 1) % this.size;
    if (this.pos === 0) this.full = true;
  }

  all(): T[] {
    return this.full ? this.buf.slice() : this.buf.slice(0, this.pos);
  }

  get length(): number {
    return this.full ? this.size : this.pos;
  }
}

// ── Stores (module-level singletons, survive across requests in same process) ─

const apiTimings = new CircularBuffer<TimingEntry>(BUFFER_SIZE);
const dbTimings = new CircularBuffer<QueryEntry>(BUFFER_SIZE);
const vitals = new CircularBuffer<VitalEntry>(BUFFER_SIZE);

// ── Record helpers ────────────────────────────────────────────────────────────

export function recordApiTiming(entry: TimingEntry): void {
  apiTimings.push(entry);
}

export function recordDbQuery(entry: QueryEntry): void {
  dbTimings.push(entry);
}

export function recordVital(entry: VitalEntry): void {
  vitals.push(entry);
}

// ── Percentile computation ────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function stats(durations: number[]): PercentileStats {
  if (durations.length === 0) {
    return { p50: 0, p95: 0, p99: 0, avg: 0, min: 0, max: 0, count: 0 };
  }
  const sorted = [...durations].sort((a, b) => a - b);
  const sum = sorted.reduce((s, v) => s + v, 0);
  return {
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    avg: Math.round(sum / sorted.length),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    count: sorted.length,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface ApiMetrics {
  overall: PercentileStats;
  byRoute: Record<string, PercentileStats>;
  slowest: TimingEntry[];
  errorRate: number; // fraction 0–1
}

export interface DbMetrics {
  overall: PercentileStats;
  slowest: QueryEntry[];
}

export function getApiMetrics(): ApiMetrics {
  const entries = apiTimings.all();
  const durations = entries.map((e) => e.durationMs);

  // Group by "METHOD /route"
  const byRoute: Record<string, number[]> = {};
  for (const e of entries) {
    const key = `${e.method} ${e.route}`;
    (byRoute[key] ??= []).push(e.durationMs);
  }

  const errors = entries.filter((e) => e.statusCode >= 500).length;

  return {
    overall: stats(durations),
    byRoute: Object.fromEntries(Object.entries(byRoute).map(([k, v]) => [k, stats(v)])),
    slowest: [...entries].sort((a, b) => b.durationMs - a.durationMs).slice(0, 10),
    errorRate: entries.length > 0 ? errors / entries.length : 0,
  };
}

export function getDbMetrics(): DbMetrics {
  const entries = dbTimings.all();
  return {
    overall: stats(entries.map((e) => e.durationMs)),
    slowest: [...entries].sort((a, b) => b.durationMs - a.durationMs).slice(0, 10),
  };
}

// ── Web Vitals ────────────────────────────────────────────────────────────────

export interface VitalsMetrics {
  byName: Record<
    string,
    { avg: number; p75: number; count: number; ratings: Record<string, number> }
  >;
}

export function getVitalsMetrics(): VitalsMetrics {
  const entries = vitals.all();
  const byName: Record<string, VitalEntry[]> = {};
  for (const e of entries) {
    (byName[e.name] ??= []).push(e);
  }

  return {
    byName: Object.fromEntries(
      Object.entries(byName).map(([name, items]) => {
        const sorted = [...items].sort((a, b) => a.value - b.value);
        const sum = sorted.reduce((s, v) => s + v.value, 0);
        const ratings: Record<string, number> = {};
        for (const item of items) ratings[item.rating] = (ratings[item.rating] ?? 0) + 1;
        return [
          name,
          {
            avg: Math.round(sum / sorted.length),
            p75: percentile(
              sorted.map((v) => v.value),
              75,
            ),
            count: sorted.length,
            ratings,
          },
        ];
      }),
    ),
  };
}

// ── Funnel event store ────────────────────────────────────────────────────────

export interface FunnelEvent {
  action: string;
  sessionId?: string;
  timestamp: number;
}

const funnelEvents = new CircularBuffer<FunnelEvent>(2000);

export function recordFunnelEvent(event: FunnelEvent): void {
  funnelEvents.push(event);
}

/** Returns a count of each funnel step recorded since the process started. */
export function getFunnelCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of funnelEvents.all()) {
    counts[e.action] = (counts[e.action] ?? 0) + 1;
  }
  return counts;
}

// ── Threshold alerts ──────────────────────────────────────────────────────────

export const PERF_THRESHOLDS = {
  apiP95WarnMs: 2000,
  apiP95CriticalMs: 5000,
  dbP95WarnMs: 500,
  dbP95CriticalMs: 2000,
} as const;

export type PerfAlertLevel = 'ok' | 'warn' | 'critical';

export interface PerfAlerts {
  apiLatency: PerfAlertLevel;
  dbLatency: PerfAlertLevel;
}

export function getPerfAlerts(): PerfAlerts {
  const api = getApiMetrics().overall;
  const db = getDbMetrics().overall;

  const apiLevel: PerfAlertLevel =
    api.p95 >= PERF_THRESHOLDS.apiP95CriticalMs
      ? 'critical'
      : api.p95 >= PERF_THRESHOLDS.apiP95WarnMs
        ? 'warn'
        : 'ok';

  const dbLevel: PerfAlertLevel =
    db.p95 >= PERF_THRESHOLDS.dbP95CriticalMs
      ? 'critical'
      : db.p95 >= PERF_THRESHOLDS.dbP95WarnMs
        ? 'warn'
        : 'ok';

  return { apiLatency: apiLevel, dbLatency: dbLevel };
}
