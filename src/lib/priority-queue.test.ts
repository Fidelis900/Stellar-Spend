import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  TransactionPriorityQueue,
  TransactionPriority,
  DeliveryRetryQueue,
  getTransactionQueue,
  getDeliveryRetryQueue,
  calculatePriorityFee,
  inferPriorityFromAmount,
} from './priority-queue';

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    withContext: vi.fn().mockReturnThis(),
  },
}));

vi.mock('@/lib/webhook/retry-scheduler', () => ({
  calculateBackoff: vi.fn((attempt: number) => 1000 * Math.pow(2, attempt - 1)),
  hasRemainingAttempts: vi.fn((record: any) => record.attemptCount < record.maxAttempts),
}));

describe('TransactionPriorityQueue', () => {
  beforeEach(() => {
    const q = getTransactionQueue();
    while (q.dequeue()) {}
  });

  it('enqueues and dequeues in priority order', () => {
    const q = new TransactionPriorityQueue();
    q.enqueue({
      id: '1',
      priority: TransactionPriority.LOW,
      amount: '10',
      currency: 'USDC',
      feeMethod: 'stablecoin',
      payload: {},
    });
    q.enqueue({
      id: '2',
      priority: TransactionPriority.URGENT,
      amount: '10000',
      currency: 'USDC',
      feeMethod: 'stablecoin',
      payload: {},
    });
    q.enqueue({
      id: '3',
      priority: TransactionPriority.NORMAL,
      amount: '100',
      currency: 'USDC',
      feeMethod: 'stablecoin',
      payload: {},
    });

    expect(q.dequeue()!.id).toBe('2');
    expect(q.dequeue()!.id).toBe('3');
    expect(q.dequeue()!.id).toBe('1');
    expect(q.dequeue()).toBeUndefined();
  });

  it('tracks metrics', () => {
    const q = new TransactionPriorityQueue();
    q.enqueue({
      id: '1',
      priority: TransactionPriority.HIGH,
      amount: '1000',
      currency: 'USDC',
      feeMethod: 'native',
      payload: {},
    });
    q.enqueue({
      id: '2',
      priority: TransactionPriority.LOW,
      amount: '10',
      currency: 'USDC',
      feeMethod: 'native',
      payload: {},
    });

    const metrics = q.getMetrics();
    expect(metrics.totalEnqueued).toBe(2);
    expect(metrics.queueDepth).toBe(2);

    q.dequeue();
    expect(q.getMetrics().totalProcessed).toBe(1);
  });

  it('removes a transaction by id', () => {
    const q = new TransactionPriorityQueue();
    q.enqueue({
      id: 'remove-me',
      priority: TransactionPriority.NORMAL,
      amount: '50',
      currency: 'USDC',
      feeMethod: 'stablecoin',
      payload: {},
    });
    expect(q.remove('remove-me')).toBe(true);
    expect(q.size()).toBe(0);
    expect(q.remove('nonexistent')).toBe(false);
  });

  it('overrides priority', () => {
    const q = new TransactionPriorityQueue();
    q.enqueue({
      id: 'tx-1',
      priority: TransactionPriority.LOW,
      amount: '10',
      currency: 'USDC',
      feeMethod: 'stablecoin',
      payload: {},
    });
    expect(q.overridePriority('tx-1', TransactionPriority.URGENT)).toBe(true);
    expect(q.dequeue()!.id).toBe('tx-1');
  });

  it('records failures', () => {
    const q = new TransactionPriorityQueue();
    q.recordFailure();
    expect(q.getMetrics().totalFailed).toBe(1);
  });
});

describe('DeliveryRetryQueue', () => {
  let retryQueue: DeliveryRetryQueue;

  beforeEach(() => {
    retryQueue = new DeliveryRetryQueue();
  });

  it('starts empty', () => {
    const metrics = retryQueue.getMetrics();
    expect(metrics.activeRetries).toBe(0);
    expect(metrics.totalRetried).toBe(0);
    expect(metrics.totalExhausted).toBe(0);
  });

  it('adds a delivery record for retry', () => {
    const record = {
      id: 'del-1',
      destinationUrl: 'https://example.com/webhook',
      payload: { headers: {}, body: '{}', source: 'paycrest' },
      status: 'pending' as const,
      attemptCount: 1,
      maxAttempts: 5,
      attempts: [{ attemptNumber: 1, timestamp: new Date().toISOString(), durationMs: 100 }],
      nextAttemptAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    retryQueue.push(record);
    const metrics = retryQueue.getMetrics();
    expect(metrics.activeRetries).toBe(1);
    expect(metrics.totalRetried).toBe(1);
  });

  it('returns due retries on poll', () => {
    const record = {
      id: 'del-2',
      destinationUrl: 'https://example.com/webhook',
      payload: { headers: {}, body: '{}', source: 'paycrest' },
      status: 'pending' as const,
      attemptCount: 1,
      maxAttempts: 5,
      attempts: [{ attemptNumber: 1, timestamp: new Date().toISOString(), durationMs: 100 }],
      nextAttemptAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    retryQueue.push(record);
    const due = retryQueue.poll();
    expect(due.length).toBe(1);
    expect(due[0].deliveryId).toBe('del-2');
    expect(retryQueue.getMetrics().activeRetries).toBe(0);
  });

  it('removes a delivery from retry tracking', () => {
    const record = {
      id: 'del-3',
      destinationUrl: 'https://example.com/webhook',
      payload: { headers: {}, body: '{}', source: 'paycrest' },
      status: 'pending' as const,
      attemptCount: 2,
      maxAttempts: 5,
      attempts: [
        { attemptNumber: 1, timestamp: new Date().toISOString(), durationMs: 100 },
        { attemptNumber: 2, timestamp: new Date().toISOString(), durationMs: 200 },
      ],
      nextAttemptAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    retryQueue.push(record);
    expect(retryQueue.remove('del-3')).toBe(true);
    expect(retryQueue.getMetrics().activeRetries).toBe(0);
  });

  it('tracks DLQ depth and threshold breach', () => {
    retryQueue.setDlqThreshold(3);
    retryQueue.updateDlqDepth(5);
    const metrics = retryQueue.getMetrics();
    expect(metrics.dlqDepth).toBe(5);
    expect(metrics.dlqThresholdBreached).toBe(true);
  });

  it('does not breach threshold below limit', () => {
    retryQueue.updateDlqDepth(2);
    expect(retryQueue.getMetrics().dlqThresholdBreached).toBe(false);
  });

  it('tracks by-destination metrics', () => {
    const record1 = {
      id: 'del-a1',
      destinationUrl: 'https://hook1.example.com',
      payload: { headers: {}, body: '{}', source: 'test' },
      status: 'pending' as const,
      attemptCount: 1,
      maxAttempts: 5,
      attempts: [],
      nextAttemptAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const record2 = {
      id: 'del-a2',
      destinationUrl: 'https://hook1.example.com',
      payload: { headers: {}, body: '{}', source: 'test' },
      status: 'pending' as const,
      attemptCount: 2,
      maxAttempts: 5,
      attempts: [],
      nextAttemptAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    retryQueue.push(record1);
    retryQueue.push(record2);
    expect(retryQueue.getMetrics().byDestination['https://hook1.example.com']).toBe(2);
  });

  it('clears all retries', () => {
    const record = {
      id: 'del-clear',
      destinationUrl: 'https://example.com/webhook',
      payload: { headers: {}, body: '{}', source: 'test' },
      status: 'pending' as const,
      attemptCount: 1,
      maxAttempts: 5,
      attempts: [],
      nextAttemptAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    retryQueue.push(record);
    retryQueue.clear();
    expect(retryQueue.getMetrics().activeRetries).toBe(0);
  });
});

describe('calculatePriorityFee', () => {
  it('applies fee multiplier for URGENT', () => {
    expect(calculatePriorityFee('100', TransactionPriority.URGENT)).toBe('150.000000');
  });

  it('applies fee multiplier for LOW', () => {
    expect(calculatePriorityFee('100', TransactionPriority.LOW)).toBe('80.000000');
  });

  it('returns original string for NaN input', () => {
    expect(calculatePriorityFee('abc', TransactionPriority.NORMAL)).toBe('abc');
  });
});

describe('inferPriorityFromAmount', () => {
  it('returns URGENT for >= 10000', () =>
    expect(inferPriorityFromAmount('10000')).toBe(TransactionPriority.URGENT));
  it('returns HIGH for >= 1000', () =>
    expect(inferPriorityFromAmount('1000')).toBe(TransactionPriority.HIGH));
  it('returns NORMAL for >= 100', () =>
    expect(inferPriorityFromAmount('100')).toBe(TransactionPriority.NORMAL));
  it('returns LOW for < 100', () =>
    expect(inferPriorityFromAmount('10')).toBe(TransactionPriority.LOW));
  it('returns NORMAL for NaN', () =>
    expect(inferPriorityFromAmount('abc')).toBe(TransactionPriority.NORMAL));
});
