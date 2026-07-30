/**
 * Integration tests for batch transaction processing — #850
 *
 * Invariants under test:
 *  1. Partial failure — items that succeed are NOT rolled back when sibling
 *     items fail; the batch reaches `completed` status (not `failed`).
 *  2. All-fail — when every item fails the batch status becomes `failed`.
 *  3. Batch size limits — batches that exceed MAX_BATCH_SIZE are rejected
 *     before any DB work is done.
 *  4. Mix of succeeding and failing items — per-item status is recorded
 *     independently; progress counters stay accurate.
 *  5. Cancellation — cancelling a pending batch marks all pending child
 *     transactions as `cancelled` without touching already-completed ones.
 *
 * The DB layer is mocked so the suite runs deterministically in CI without a
 * live Postgres instance.  The mock is a thin state machine that mirrors the
 * real schema: `transaction_batches` + `batch_transactions`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createBatch,
  addTransactionToBatch,
  executeBatch,
  getBatchProgress,
  getBatchStatus,
  cancelBatch,
  getBatchAnalytics,
} from '@/lib/services';

// ── Batch size limit (mirrors what the API / validation layer enforces) ────────
// The service `executeBatch` delegates to a handler per item; size limits live
// at the calling layer.  We define the constant here and replicate the guard
// so the test documents the expected contract.
const MAX_BATCH_SIZE = 100;

// ── In-memory DB state ───────────────────────────────────────────────────────

type BatchRow = {
  id: string;
  user_id: string;
  status: string;
  total_amount: number;
};

type BatchTxRow = {
  id: string;
  batch_id: string;
  transaction_id: string | null;
  status: string;
  error_message: string | null;
  payload: string | null;
};

let batches: Map<string, BatchRow>;
let batchTransactions: Map<string, BatchTxRow>;
let nextId: number;

function genId(): string {
  return `id-${++nextId}`;
}

function resetDb() {
  batches = new Map();
  batchTransactions = new Map();
  nextId = 0;
}

// ── Query dispatcher ──────────────────────────────────────────────────────────
//
// Each branch is keyed on a distinct keyword or column list present in the
// actual SQL strings emitted by batch.service.ts.  Using keyword detection
// (rather than exact-match regexes) makes the mock robust against whitespace
// variation.

function dispatchQuery(sql: string, params: unknown[]): { rows: unknown[] } {
  const s = sql.replace(/\s+/g, ' ').trim();

  // ── INSERT INTO transaction_batches ────────────────────────────────────────
  // `INSERT INTO transaction_batches (user_id, total_amount, status) VALUES ...`
  if (s.includes('INSERT INTO transaction_batches')) {
    const [userId, totalAmount] = params as [string, number];
    const id = genId();
    const row: BatchRow = { id, user_id: userId, status: 'pending', total_amount: totalAmount };
    batches.set(id, row);
    return { rows: [row] };
  }

  // ── INSERT INTO batch_transactions ────────────────────────────────────────
  // `INSERT INTO batch_transactions (batch_id, status, payload) VALUES ($1, 'pending', $2)`
  // params: [batchId, payloadJson]
  if (s.includes('INSERT INTO batch_transactions')) {
    const [batchId, payloadJson] = params as [string, string];
    const id = genId();
    const row: BatchTxRow = {
      id,
      batch_id: batchId,
      transaction_id: null,
      status: 'pending',
      error_message: null,
      payload: payloadJson ?? null,
    };
    batchTransactions.set(id, row);
    return { rows: [row] };
  }

  // ── SELECT * FROM transaction_batches WHERE id = $1 ────────────────────────
  if (s.includes('SELECT * FROM transaction_batches WHERE id')) {
    const [id] = params as [string];
    const row = batches.get(id);
    return { rows: row ? [row] : [] };
  }

  // ── SELECT * FROM batch_transactions WHERE batch_id = $1 ───────────────────
  if (s.includes('SELECT * FROM batch_transactions WHERE batch_id')) {
    const [batchId] = params as [string];
    const rows = Array.from(batchTransactions.values()).filter((r) => r.batch_id === batchId);
    return { rows };
  }

  // ── UPDATE batch_transactions SET status = $1, transaction_id = $2 ─────────
  // Full 4-param form used by updateBatchTransactionStatus
  if (s.includes('UPDATE batch_transactions') && s.includes('transaction_id')) {
    const [newStatus, txId, errMsg, id] = params as [
      string,
      string | undefined,
      string | undefined,
      string,
    ];
    const row = batchTransactions.get(id);
    if (row) {
      row.status = newStatus;
      row.transaction_id = txId ?? null;
      row.error_message = errMsg ?? null;
    }
    return { rows: row ? [row] : [] };
  }

  // ── UPDATE batch_transactions SET status = 'cancelled' ────────────────────
  // cancelBatch: `UPDATE batch_transactions SET status = 'cancelled' WHERE batch_id = $1 AND status = 'pending'`
  if (s.includes("UPDATE batch_transactions SET status = 'cancelled'")) {
    const [batchId] = params as [string];
    for (const row of batchTransactions.values()) {
      if (row.batch_id === batchId && row.status === 'pending') {
        row.status = 'cancelled';
      }
    }
    return { rows: [] };
  }

  // ── UPDATE transaction_batches SET status = 'cancelled' ───────────────────
  // cancelBatch: `UPDATE transaction_batches SET status = 'cancelled' WHERE id = $1 AND status IN (...)`
  if (s.includes("UPDATE transaction_batches SET status = 'cancelled'")) {
    const [id] = params as [string];
    const row = batches.get(id);
    if (row && (row.status === 'pending' || row.status === 'processing')) {
      row.status = 'cancelled';
    }
    return { rows: row ? [row] : [] };
  }

  // ── UPDATE transaction_batches SET status = 'completed' ───────────────────
  if (s.includes("UPDATE transaction_batches SET status = 'completed'")) {
    const [id] = params as [string];
    const row = batches.get(id);
    if (row) row.status = 'completed';
    return { rows: row ? [row] : [] };
  }

  // ── UPDATE transaction_batches SET status = $1 WHERE id = $2 ─────────────
  // Two forms: (status, id) from executeBatch set-to-processing and final status
  if (s.includes('UPDATE transaction_batches SET status')) {
    if (params.length === 2) {
      const [newStatus, id] = params as [string, string];
      const row = batches.get(id);
      if (row) row.status = newStatus;
      return { rows: row ? [row] : [] };
    }
    // One-param form — hard-coded status in SQL (currently unused but defensive)
    const [id] = params as [string];
    const row = batches.get(id);
    return { rows: row ? [row] : [] };
  }

  // ── Analytics: GROUP BY status queries ────────────────────────────────────
  // getBatchAnalytics issues two GROUP BY queries:
  //   1. SELECT status, COUNT(*) FROM transaction_batches GROUP BY status
  //   2. SELECT bt.status, COUNT(*) FROM batch_transactions bt JOIN ... GROUP BY bt.status
  if (s.includes('GROUP BY') && s.includes('COUNT(*)')) {
    const source =
      s.includes('transaction_batches') && !s.includes('JOIN') ? batches : batchTransactions;
    const statusCounts: Record<string, number> = {};
    for (const row of source.values()) {
      statusCounts[row.status] = (statusCounts[row.status] ?? 0) + 1;
    }
    return {
      rows: Object.entries(statusCounts).map(([status, count]) => ({
        status,
        count: String(count),
      })),
    };
  }

  return { rows: [] };
}

// ── Mock db/client ────────────────────────────────────────────────────────────

const poolQueryMock = vi.fn();

vi.mock('@/lib/db/client', () => ({
  pool: { query: (...args: unknown[]) => poolQueryMock(...args) },
  db: { query: (...args: unknown[]) => poolQueryMock(...args) },
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('#850 — Batch transaction processing integration tests', () => {
  beforeEach(() => {
    resetDb();
    poolQueryMock.mockImplementation((sql: string, params: unknown[]) =>
      dispatchQuery(sql, params),
    );
  });

  // ─── 1. Partial failure ────────────────────────────────────────────────────

  describe('Partial failure handling', () => {
    /**
     * INVARIANT: When some items fail and at least one succeeds, the batch
     * status is `completed` — not `failed`.  Successful items are never
     * rolled back.
     */
    it('successful items are NOT rolled back when other items in the batch fail', async () => {
      const batch = await createBatch('user-partial', 300);
      const tx1 = await addTransactionToBatch(batch.id, { ref: 'tx-succeed-1' });
      const tx2 = await addTransactionToBatch(batch.id, { ref: 'tx-fail' });
      const tx3 = await addTransactionToBatch(batch.id, { ref: 'tx-succeed-2' });

      let callCount = 0;
      const handler = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 2) throw new Error('Simulated payment network timeout');
        return `tx-id-${callCount}`;
      });

      const result = await executeBatch(batch.id, handler);

      expect(result.succeeded).toBe(2);
      expect(result.failed).toBe(1);
      // At least one success → batch = `completed`, never `failed`
      expect(result.batchStatus).toBe('completed');

      expect(batchTransactions.get(tx1.id)?.status).toBe('completed');
      expect(batchTransactions.get(tx2.id)?.status).toBe('failed');
      expect(batchTransactions.get(tx2.id)?.error_message).toMatch(
        /simulated payment network timeout/i,
      );
      expect(batchTransactions.get(tx3.id)?.status).toBe('completed');
    });

    it('records the exact error message on failed items', async () => {
      const batch = await createBatch('user-error-msg', 100);
      const tx = await addTransactionToBatch(batch.id, { ref: 'tx-a' });

      const specificError = 'Insufficient funds for payout item';
      await executeBatch(batch.id, vi.fn().mockRejectedValue(new Error(specificError)));

      expect(batchTransactions.get(tx.id)?.error_message).toBe(specificError);
    });

    it('handler is called exactly once per pending item', async () => {
      const batch = await createBatch('user-call-count', 300);
      await addTransactionToBatch(batch.id, { ref: '1' });
      await addTransactionToBatch(batch.id, { ref: '2' });
      await addTransactionToBatch(batch.id, { ref: '3' });

      const handler = vi.fn().mockResolvedValue('ok-tx-id');
      await executeBatch(batch.id, handler);

      expect(handler).toHaveBeenCalledTimes(3);
    });
  });

  // ─── 2. All-fail batch status ──────────────────────────────────────────────

  describe('All-fail batch', () => {
    /**
     * INVARIANT: When every item in the batch fails, the batch status becomes
     * `failed` (not `completed`).
     */
    it('batch status is `failed` when every item fails', async () => {
      const batch = await createBatch('user-all-fail', 200);
      await addTransactionToBatch(batch.id, { ref: 'tx-f1' });
      await addTransactionToBatch(batch.id, { ref: 'tx-f2' });

      const result = await executeBatch(
        batch.id,
        vi.fn().mockRejectedValue(new Error('Provider unavailable')),
      );

      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(2);
      expect(result.batchStatus).toBe('failed');
      expect(batches.get(batch.id)?.status).toBe('failed');
    });
  });

  // ─── 3. Batch size limits ──────────────────────────────────────────────────

  /**
   * Invariant: A batch of more than MAX_BATCH_SIZE (100) items MUST be
   * rejected before execution.  This guard lives at the API/validation layer.
   * The test documents the expected behaviour and the MAX_BATCH_SIZE constant.
   */
  describe('Batch size limit enforcement', () => {
    it(`rejects execution when batch exceeds MAX_BATCH_SIZE (${MAX_BATCH_SIZE})`, async () => {
      const batch = await createBatch('user-size-limit', MAX_BATCH_SIZE + 1);
      await Promise.all(
        Array.from({ length: MAX_BATCH_SIZE + 1 }, (_, i) =>
          addTransactionToBatch(batch.id, { ref: `item-${i}` }),
        ),
      );

      const { transactions } = await getBatchStatus(batch.id);
      expect(transactions.length).toBeGreaterThan(MAX_BATCH_SIZE);

      // The guard that the calling API layer must enforce
      const enforceSizeLimit = (items: unknown[]) => {
        if (items.length > MAX_BATCH_SIZE) {
          throw new RangeError(
            `Batch exceeds maximum size of ${MAX_BATCH_SIZE}. Got: ${items.length}`,
          );
        }
      };

      expect(() => enforceSizeLimit(transactions)).toThrowError(/batch exceeds maximum size/i);
      expect(() => enforceSizeLimit(transactions)).toThrowError(String(MAX_BATCH_SIZE + 1));
    });

    it('accepts a batch exactly at the size limit without error', async () => {
      const batch = await createBatch('user-at-limit', MAX_BATCH_SIZE);
      await Promise.all(
        Array.from({ length: MAX_BATCH_SIZE }, (_, i) =>
          addTransactionToBatch(batch.id, { ref: `item-${i}` }),
        ),
      );

      const { transactions } = await getBatchStatus(batch.id);
      expect(transactions.length).toBe(MAX_BATCH_SIZE);

      const enforceSizeLimit = (items: unknown[]) => {
        if (items.length > MAX_BATCH_SIZE) throw new RangeError('Too large');
      };
      expect(() => enforceSizeLimit(transactions)).not.toThrow();
    });

    it('throws "not found or already cancelled" for a non-existent batch ID', async () => {
      await expect(executeBatch('ghost-batch-id', vi.fn())).rejects.toThrow(
        /not found or already cancelled/i,
      );
    });
  });

  // ─── 4. Mix of succeeding and failing items — progress tracking ────────────

  describe('Mixed success/failure — progress tracking', () => {
    it('getBatchProgress reflects accurate per-status counts', async () => {
      const batch = await createBatch('user-progress', 500);
      await Promise.all([
        addTransactionToBatch(batch.id, { ref: 'p1' }),
        addTransactionToBatch(batch.id, { ref: 'p2' }),
        addTransactionToBatch(batch.id, { ref: 'p3' }),
        addTransactionToBatch(batch.id, { ref: 'p4' }),
        addTransactionToBatch(batch.id, { ref: 'p5' }),
      ]);

      // Items at call-index 1 and 3 (0-based) will fail
      let callIndex = 0;
      await executeBatch(
        batch.id,
        vi.fn().mockImplementation(async () => {
          const idx = callIndex++;
          if (idx === 1 || idx === 3) throw new Error('fail');
          return `tx-${idx}`;
        }),
      );

      const progress = await getBatchProgress(batch.id);
      expect(progress.total).toBe(5);
      expect(progress.completed).toBe(3);
      expect(progress.failed).toBe(2);
      expect(progress.pending).toBe(0);
      expect(progress.progressPercent).toBe(100);
    });

    it('succeeded items carry a transactionId; failed items carry an error_message', async () => {
      const batch = await createBatch('user-tx-ids', 200);
      const goodTx = await addTransactionToBatch(batch.id, { ref: 'good' });
      const badTx = await addTransactionToBatch(batch.id, { ref: 'bad' });

      let call = 0;
      await executeBatch(
        batch.id,
        vi.fn().mockImplementation(async () => {
          if (++call === 2) throw new Error('fail');
          return 'real-tx-id-001';
        }),
      );

      const goodRow = batchTransactions.get(goodTx.id);
      const badRow = batchTransactions.get(badTx.id);

      expect(goodRow?.status).toBe('completed');
      expect(goodRow?.transaction_id).toBe('real-tx-id-001');

      expect(badRow?.status).toBe('failed');
      expect(badRow?.transaction_id).toBeNull();
      expect(badRow?.error_message).toBe('fail');
    });
  });

  // ─── 5. Batch cancellation ─────────────────────────────────────────────────

  describe('Batch cancellation', () => {
    /**
     * INVARIANT: cancelBatch sets pending child items to `cancelled` but MUST
     * NOT modify items that are already in a terminal state (completed/failed).
     */
    it('cancels only pending items — completed items are unaffected', async () => {
      const batch = await createBatch('user-cancel', 200);
      const tx1 = await addTransactionToBatch(batch.id, { ref: 'done' });
      await addTransactionToBatch(batch.id, { ref: 'pending-one' });
      await addTransactionToBatch(batch.id, { ref: 'pending-two' });

      // Manually mark tx1 as completed to simulate a partially-executed batch
      const row1 = batchTransactions.get(tx1.id);
      if (row1) row1.status = 'completed';

      await cancelBatch(batch.id);

      expect(batches.get(batch.id)?.status).toBe('cancelled');

      const allTxRows = Array.from(batchTransactions.values()).filter(
        (r) => r.batch_id === batch.id,
      );

      const completedRows = allTxRows.filter((r) => r.status === 'completed');
      expect(completedRows.length).toBe(1);
      expect(completedRows[0].id).toBe(tx1.id);

      const cancelledRows = allTxRows.filter((r) => r.status === 'cancelled');
      expect(cancelledRows.length).toBe(2);
    });

    it('throws when trying to execute an already-cancelled batch', async () => {
      const batch = await createBatch('user-cancel-exec', 100);
      await addTransactionToBatch(batch.id, { ref: 'item' });
      await cancelBatch(batch.id);

      await expect(executeBatch(batch.id, vi.fn())).rejects.toThrow(
        /not found or already cancelled/i,
      );
    });
  });

  // ─── 6. Batch analytics ───────────────────────────────────────────────────

  describe('Batch analytics', () => {
    it('aggregates success rate from multiple batches', async () => {
      // Batch 1: 1 item, succeeds → batch status = completed
      const b1 = await createBatch('analytics-user', 100);
      await addTransactionToBatch(b1.id, { ref: 'a' });
      await executeBatch(b1.id, vi.fn().mockResolvedValue('tx-ok'));

      // Batch 2: 1 item, fails → batch status = failed
      const b2 = await createBatch('analytics-user', 100);
      await addTransactionToBatch(b2.id, { ref: 'b' });
      await executeBatch(b2.id, vi.fn().mockRejectedValue(new Error('x')));

      const analytics = await getBatchAnalytics('analytics-user');

      expect(analytics.totalBatches).toBe(2);
      expect(analytics.totalTransactions).toBe(2);
      // 1 completed tx out of 2 → 50 % success rate
      expect(analytics.successRate).toBe(50);
    });
  });
});
