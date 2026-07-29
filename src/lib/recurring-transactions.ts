/**
 * Recurring transactions — schedule automatic periodic offramp payments.
 * Schedules are stored in localStorage; execution is triggered client-side.
 */

export type RecurringFrequency = 'daily' | 'weekly' | 'monthly';

export interface ExecutionHistoryRecord {
  timestamp: number;
  status: 'success' | 'failed';
  error?: string;
  retryAttempt: number;
}

export interface RetryConfig {
  maxRetries: number;
  retryIntervalMs: number;
  currentRetryCount: number;
  nextRetryAt?: number;
}

export interface RecurringSchedule {
  id: string;
  createdAt: number;
  userAddress: string;
  label: string;
  amount: string;
  currency: string;
  frequency: RecurringFrequency;
  beneficiary: {
    institution: string;
    accountIdentifier: string;
    accountName: string;
    currency: string;
  };
  /** Timestamp of next scheduled execution */
  nextRunAt: number;
  /** Whether the schedule is paused */
  paused: boolean;
  /** Number of successful executions */
  executionCount: number;
  /** Last execution result */
  lastResult?: { status: 'success' | 'failed'; error?: string; timestamp: number };
  /** Max executions (undefined = unlimited) */
  maxExecutions?: number;
  /** Retry configuration for failed executions */
  retryConfig?: RetryConfig;
  /** History of past executions (most recent first, capped at MAX_HISTORY) */
  executionHistory: ExecutionHistoryRecord[];
  /** Whether to emit notifications on execution */
  notificationsEnabled: boolean;
}

const STORAGE_KEY = 'stellar_spend_recurring';
const MAX_HISTORY_PER_SCHEDULE = 20;

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export function computeNextRunAt(from: number, frequency: RecurringFrequency): number {
  const d = new Date(from);
  switch (frequency) {
    case 'daily':
      d.setDate(d.getDate() + 1);
      break;
    case 'weekly':
      d.setDate(d.getDate() + 7);
      break;
    case 'monthly':
      d.setMonth(d.getMonth() + 1);
      break;
  }
  return d.getTime();
}

export function isDue(schedule: RecurringSchedule): boolean {
  if (schedule.paused) return false;
  if (schedule.maxExecutions !== undefined && schedule.executionCount >= schedule.maxExecutions)
    return false;
  if (schedule.retryConfig?.nextRetryAt) {
    return Date.now() >= schedule.retryConfig.nextRetryAt;
  }
  return Date.now() >= schedule.nextRunAt;
}

export function isPendingRetry(schedule: RecurringSchedule): boolean {
  if (!schedule.retryConfig) return false;
  if (schedule.retryConfig.currentRetryCount >= schedule.retryConfig.maxRetries) return false;
  return !!schedule.retryConfig.nextRetryAt && Date.now() >= schedule.retryConfig.nextRetryAt;
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

export class RecurringStorage {
  static getAll(): RecurringSchedule[] {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  static getByUser(userAddress: string): RecurringSchedule[] {
    return this.getAll().filter((s) => s.userAddress.toLowerCase() === userAddress.toLowerCase());
  }

  static save(schedule: RecurringSchedule): void {
    if (typeof window === 'undefined') return;
    const all = this.getAll().filter((s) => s.id !== schedule.id);
    all.unshift(schedule);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all.slice(0, 50)));
  }

  static pause(id: string): void {
    this._update(id, { paused: true });
  }

  static resume(id: string): void {
    this._update(id, { paused: false });
  }

  static delete(id: string): void {
    if (typeof window === 'undefined') return;
    const all = this.getAll().filter((s) => s.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  }

  static recordResult(id: string, result: { status: 'success' | 'failed'; error?: string }): void {
    if (typeof window === 'undefined') return;
    const all = this.getAll();
    const idx = all.findIndex((s) => s.id === id);
    if (idx === -1) return;
    const s = all[idx];
    const retryAttempt = s.retryConfig?.currentRetryCount ?? 0;
    s.lastResult = { ...result, timestamp: Date.now() };

    if (result.status === 'success') {
      s.executionCount += 1;
      s.nextRunAt = computeNextRunAt(Date.now(), s.frequency);
      if (s.retryConfig) {
        s.retryConfig.currentRetryCount = 0;
        s.retryConfig.nextRetryAt = undefined;
      }
    }

    RecurringStorage.pushHistoryInPlace(s, {
      timestamp: Date.now(),
      status: result.status,
      error: result.error,
      retryAttempt,
    });

    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  }

  /** Push a history record onto an in-memory schedule object (mutates). */
  static pushHistoryInPlace(schedule: RecurringSchedule, record: ExecutionHistoryRecord): void {
    if (!schedule.executionHistory) schedule.executionHistory = [];
    schedule.executionHistory.unshift(record);
    if (schedule.executionHistory.length > MAX_HISTORY_PER_SCHEDULE) {
      schedule.executionHistory = schedule.executionHistory.slice(0, MAX_HISTORY_PER_SCHEDULE);
    }
  }

  static getHistory(id: string): ExecutionHistoryRecord[] {
    const schedule = this.getAll().find((s) => s.id === id);
    return schedule?.executionHistory ?? [];
  }

  /** Schedule the next retry attempt. Returns false if retries are exhausted. */
  static scheduleRetry(id: string): boolean {
    if (typeof window === 'undefined') return false;
    const all = this.getAll();
    const idx = all.findIndex((s) => s.id === id);
    if (idx === -1) return false;
    const s = all[idx];
    if (!s.retryConfig) return false;
    if (s.retryConfig.currentRetryCount >= s.retryConfig.maxRetries) return false;
    s.retryConfig.currentRetryCount += 1;
    s.retryConfig.nextRetryAt = Date.now() + s.retryConfig.retryIntervalMs;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    return true;
  }

  static clearRetry(id: string): void {
    if (typeof window === 'undefined') return;
    const all = this.getAll();
    const idx = all.findIndex((s) => s.id === id);
    if (idx === -1) return;
    const s = all[idx];
    if (s.retryConfig) {
      s.retryConfig.currentRetryCount = 0;
      s.retryConfig.nextRetryAt = undefined;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  }

  static getDueForRetry(): RecurringSchedule[] {
    return this.getAll().filter(isPendingRetry);
  }

  static generateId(): string {
    return `rec_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  }

  private static _update(id: string, patch: Partial<RecurringSchedule>): void {
    if (typeof window === 'undefined') return;
    const all = this.getAll();
    const idx = all.findIndex((s) => s.id === id);
    if (idx === -1) return;
    all[idx] = { ...all[idx], ...patch };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  }
}

// ---------------------------------------------------------------------------
// Notification helper
// ---------------------------------------------------------------------------

export interface RecurringNotificationEvent {
  scheduleId: string;
  userAddress: string;
  label: string;
  status: 'success' | 'failed';
  executionCount: number;
  error?: string;
  timestamp: number;
}

export function buildRecurringNotification(
  schedule: RecurringSchedule,
  status: 'success' | 'failed',
  error?: string,
): RecurringNotificationEvent {
  return {
    scheduleId: schedule.id,
    userAddress: schedule.userAddress,
    label: schedule.label,
    status,
    executionCount: schedule.executionCount,
    error,
    timestamp: Date.now(),
  };
}
