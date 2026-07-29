import { calculateBackoff, hasRemainingAttempts } from './webhook/retry-scheduler';
import type { DeliveryRecord } from './webhook/types';
import { logger } from './logger';

export enum TransactionPriority {
  LOW = 1,
  NORMAL = 2,
  HIGH = 3,
  URGENT = 4,
}

export interface QueuedTransaction {
  id: string;
  priority: TransactionPriority;
  amount: string;
  currency: string;
  feeMethod: 'stablecoin' | 'native';
  payload: Record<string, unknown>;
  enqueuedAt: number;
  attempts: number;
}

export interface PriorityFeeMultiplier {
  [TransactionPriority.LOW]: number;
  [TransactionPriority.NORMAL]: number;
  [TransactionPriority.HIGH]: number;
  [TransactionPriority.URGENT]: number;
}

const FEE_MULTIPLIERS: PriorityFeeMultiplier = {
  [TransactionPriority.LOW]: 0.8,
  [TransactionPriority.NORMAL]: 1.0,
  [TransactionPriority.HIGH]: 1.2,
  [TransactionPriority.URGENT]: 1.5,
};

export interface QueueMetrics {
  totalEnqueued: number;
  totalProcessed: number;
  totalFailed: number;
  queueDepth: number;
  avgWaitMs: number;
  byPriority: Record<TransactionPriority, number>;
}

export interface DeliveryRetryState {
  deliveryId: string;
  destinationUrl: string;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: number;
  lastError?: string;
  enqueuedAt: number;
}

export interface DeliveryRetryMetrics {
  activeRetries: number;
  totalRetried: number;
  totalExhausted: number;
  byDestination: Record<string, number>;
  dlqDepth: number;
  dlqThresholdBreached: boolean;
}

export class TransactionPriorityQueue {
  private heap: QueuedTransaction[] = [];
  private metrics: QueueMetrics = {
    totalEnqueued: 0,
    totalProcessed: 0,
    totalFailed: 0,
    queueDepth: 0,
    avgWaitMs: 0,
    byPriority: {
      [TransactionPriority.LOW]: 0,
      [TransactionPriority.NORMAL]: 0,
      [TransactionPriority.HIGH]: 0,
      [TransactionPriority.URGENT]: 0,
    },
  };
  private waitTimes: number[] = [];

  remove(id: string): boolean {
    const idx = this.heap.findIndex((t) => t.id === id);
    if (idx === -1) return false;
    this.heap.splice(idx, 1);
    for (let i = Math.floor(this.heap.length / 2) - 1; i >= 0; i--) {
      this.sinkDown(i);
    }
    this.metrics.queueDepth = this.heap.length;
    return true;
  }

  overridePriority(id: string, newPriority: TransactionPriority): boolean {
    const tx = this.heap.find((t) => t.id === id);
    if (!tx) return false;
    tx.priority = newPriority;
    for (let i = Math.floor(this.heap.length / 2) - 1; i >= 0; i--) {
      this.sinkDown(i);
    }
    for (let i = this.heap.length - 1; i > 0; i--) {
      this.bubbleUp(i);
    }
    return true;
  }

  getAll(): ReadonlyArray<QueuedTransaction> {
    return [...this.heap].sort((a, b) => (this.compare(a, b) ? -1 : this.compare(b, a) ? 1 : 0));
  }

  enqueue(tx: Omit<QueuedTransaction, 'enqueuedAt' | 'attempts'>): void {
    const item: QueuedTransaction = { ...tx, enqueuedAt: Date.now(), attempts: 0 };
    this.heap.push(item);
    this.bubbleUp(this.heap.length - 1);
    this.metrics.totalEnqueued++;
    this.metrics.queueDepth = this.heap.length;
    this.metrics.byPriority[tx.priority]++;
  }

  dequeue(): QueuedTransaction | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.sinkDown(0);
    }
    this.metrics.totalProcessed++;
    this.metrics.queueDepth = this.heap.length;
    const waitMs = Date.now() - top.enqueuedAt;
    this.waitTimes.push(waitMs);
    if (this.waitTimes.length > 100) this.waitTimes.shift();
    this.metrics.avgWaitMs = this.waitTimes.reduce((a, b) => a + b, 0) / this.waitTimes.length;
    return top;
  }

  peek(): QueuedTransaction | undefined {
    return this.heap[0];
  }

  size(): number {
    return this.heap.length;
  }

  getMetrics(): QueueMetrics {
    return { ...this.metrics };
  }

  recordFailure(): void {
    this.metrics.totalFailed++;
  }

  private compare(a: QueuedTransaction, b: QueuedTransaction): boolean {
    if (a.priority !== b.priority) return a.priority > b.priority;
    return a.enqueuedAt < b.enqueuedAt;
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (this.compare(this.heap[i], this.heap[parent])) {
        [this.heap[i], this.heap[parent]] = [this.heap[parent], this.heap[i]];
        i = parent;
      } else break;
    }
  }

  private sinkDown(i: number): void {
    const n = this.heap.length;
    while (true) {
      let largest = i;
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      if (l < n && this.compare(this.heap[l], this.heap[largest])) largest = l;
      if (r < n && this.compare(this.heap[r], this.heap[largest])) largest = r;
      if (largest === i) break;
      [this.heap[i], this.heap[largest]] = [this.heap[largest], this.heap[i]];
      i = largest;
    }
  }
}

export function calculatePriorityFee(baseFee: string, priority: TransactionPriority): string {
  const base = parseFloat(baseFee);
  if (isNaN(base)) return baseFee;
  const adjusted = base * FEE_MULTIPLIERS[priority];
  return adjusted.toFixed(6);
}

export function inferPriorityFromAmount(amountUsdc: string): TransactionPriority {
  const amount = parseFloat(amountUsdc);
  if (isNaN(amount)) return TransactionPriority.NORMAL;
  if (amount >= 10000) return TransactionPriority.URGENT;
  if (amount >= 1000) return TransactionPriority.HIGH;
  if (amount >= 100) return TransactionPriority.NORMAL;
  return TransactionPriority.LOW;
}

let _queue: TransactionPriorityQueue | null = null;

export function getTransactionQueue(): TransactionPriorityQueue {
  if (!_queue) _queue = new TransactionPriorityQueue();
  return _queue;
}

export class DeliveryRetryQueue {
  private retries: Map<string, DeliveryRetryState> = new Map();
  private metrics: DeliveryRetryMetrics = {
    activeRetries: 0,
    totalRetried: 0,
    totalExhausted: 0,
    byDestination: {},
    dlqDepth: 0,
    dlqThresholdBreached: false,
  };
  private dlqThreshold = 10;

  setDlqThreshold(threshold: number): void {
    this.dlqThreshold = threshold;
  }

  push(record: DeliveryRecord): void {
    if (!hasRemainingAttempts(record)) {
      this.metrics.totalExhausted++;
      logger.warn('delivery_retry.exhausted', {
        deliveryId: record.id,
        destinationUrl: record.destinationUrl,
      });
      return;
    }

    const delayMs = calculateBackoff(record.attemptCount);
    const nextAttemptAt = Date.now() + delayMs;

    const state: DeliveryRetryState = {
      deliveryId: record.id,
      destinationUrl: record.destinationUrl,
      attemptCount: record.attemptCount,
      maxAttempts: record.maxAttempts,
      nextAttemptAt,
      lastError:
        record.attempts.length > 0
          ? record.attempts[record.attempts.length - 1].errorType
          : undefined,
      enqueuedAt: Date.now(),
    };

    this.retries.set(record.id, state);
    this.metrics.activeRetries = this.retries.size;
    this.metrics.totalRetried++;
    this.metrics.byDestination[record.destinationUrl] =
      (this.metrics.byDestination[record.destinationUrl] ?? 0) + 1;
  }

  poll(): DeliveryRetryState[] {
    const now = Date.now();
    const due: DeliveryRetryState[] = [];
    for (const [id, state] of this.retries) {
      if (state.nextAttemptAt <= now) {
        due.push(state);
        this.retries.delete(id);
      }
    }
    this.metrics.activeRetries = this.retries.size;
    return due;
  }

  remove(deliveryId: string): boolean {
    const removed = this.retries.delete(deliveryId);
    this.metrics.activeRetries = this.retries.size;
    return removed;
  }

  updateDlqDepth(depth: number): void {
    this.metrics.dlqDepth = depth;
    this.metrics.dlqThresholdBreached = depth >= this.dlqThreshold;
    if (this.metrics.dlqThresholdBreached) {
      logger.warn('dlq.threshold_breached', { depth, threshold: this.dlqThreshold });
    }
  }

  getMetrics(): DeliveryRetryMetrics {
    return { ...this.metrics };
  }

  clear(): void {
    this.retries.clear();
    this.metrics.activeRetries = 0;
  }
}

let _deliveryRetryQueue: DeliveryRetryQueue | null = null;

export function getDeliveryRetryQueue(): DeliveryRetryQueue {
  if (!_deliveryRetryQueue) _deliveryRetryQueue = new DeliveryRetryQueue();
  return _deliveryRetryQueue;
}
