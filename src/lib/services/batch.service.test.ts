import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock database pool before importing service
vi.mock('@/lib/db/client', () => ({
  pool: {
    query: vi.fn(),
  },
}));

import { pool as db } from '@/lib/db';
import {
  createBatch,
  addTransactionToBatch,
  updateBatchTransactionStatus,
  getBatchStatus,
  getBatchProgress,
  completeBatch,
  cancelBatch,
  executeBatch,
  getBatchAnalytics,
} from './batch.service';

describe('Batch Transaction Processing Service - Partial Failures & Analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Batch Creation & Transaction Enqueueing', () => {
    it('should create a new transaction batch', async () => {
      const mockBatchRow = {
        id: 'batch-uuid-1',
        user_id: 'user-batch-1',
        total_amount: 1000.0,
        status: 'pending',
      };

      (db.query as any).mockResolvedValueOnce({ rows: [mockBatchRow] });

      const batch = await createBatch('user-batch-1', 1000.0);

      expect(batch).toEqual(mockBatchRow);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO transaction_batches'),
        ['user-batch-1', 1000.0],
      );
    });

    it('should add individual transaction items to batch', async () => {
      const mockTxData = { amount: 250, recipient: '0x123' };
      const mockBatchTxRow = {
        id: 'batch-tx-1',
        batch_id: 'batch-uuid-1',
        status: 'pending',
        payload: JSON.stringify(mockTxData),
      };

      (db.query as any).mockResolvedValueOnce({ rows: [mockBatchTxRow] });

      const added = await addTransactionToBatch('batch-uuid-1', mockTxData);

      expect(added).toEqual(mockBatchTxRow);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO batch_transactions'),
        ['batch-uuid-1', 'pending', JSON.stringify(mockTxData)],
      );
    });
  });

  describe('Partial-Failure Execution Workflow (Issue #850)', () => {
    const mockBatchId = 'batch-partial-100';

    it('should process batch with PARTIAL FAILURES: some items succeed, some fail', async () => {
      const mockBatchHeader = { id: mockBatchId, user_id: 'user-1', status: 'pending' };
      const mockTx1 = {
        id: 'btx-1',
        batch_id: mockBatchId,
        status: 'pending',
        payload: { amount: 100 },
      };
      const mockTx2 = {
        id: 'btx-2',
        batch_id: mockBatchId,
        status: 'pending',
        payload: { amount: 200 },
      };
      const mockTx3 = {
        id: 'btx-3',
        batch_id: mockBatchId,
        status: 'pending',
        payload: { amount: 300 },
      };

      (db.query as any)
        // getBatchStatus queries
        .mockResolvedValueOnce({ rows: [mockBatchHeader] })
        .mockResolvedValueOnce({ rows: [mockTx1, mockTx2, mockTx3] })
        // update batch to processing
        .mockResolvedValueOnce({ rowCount: 1 })
        // tx1: processing -> completed
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1 })
        // tx2: processing -> failed (handler throws error)
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1 })
        // tx3: processing -> completed
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1 })
        // final batch status update
        .mockResolvedValueOnce({ rowCount: 1 });

      const handler = vi.fn().mockImplementation(async (payload: any) => {
        if (payload.amount === 200) {
          throw new Error('Insufficient funds on ledger');
        }
        return `tx-hash-${payload.amount}`;
      });

      const result = await executeBatch(mockBatchId, handler);

      expect(result.succeeded).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.batchStatus).toBe('completed'); // Completed as long as at least 1 succeeds

      // Verify item tx2 status update recorded error message
      expect(db.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE batch_transactions'), [
        'failed',
        undefined,
        'Insufficient funds on ledger',
        'btx-2',
      ]);
    });

    it('should set batchStatus to failed if ALL items in batch fail execution', async () => {
      const mockBatchHeader = { id: mockBatchId, user_id: 'user-1', status: 'pending' };
      const mockTx1 = {
        id: 'btx-10',
        batch_id: mockBatchId,
        status: 'pending',
        payload: { amount: 500 },
      };

      (db.query as any)
        // getBatchStatus
        .mockResolvedValueOnce({ rows: [mockBatchHeader] })
        .mockResolvedValueOnce({ rows: [mockTx1] })
        // batch processing update
        .mockResolvedValueOnce({ rowCount: 1 })
        // tx1 processing -> failed
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1 })
        // final batch update
        .mockResolvedValueOnce({ rowCount: 1 });

      const failingHandler = vi.fn().mockRejectedValue(new Error('Network timeout'));

      const result = await executeBatch(mockBatchId, failingHandler);

      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.batchStatus).toBe('failed');
      expect(db.query).toHaveBeenLastCalledWith(
        expect.stringContaining('UPDATE transaction_batches SET status = $1 WHERE id = $2'),
        ['failed', mockBatchId],
      );
    });

    it('should throw error if attempting to execute a cancelled batch', async () => {
      const cancelledBatchHeader = { id: mockBatchId, status: 'cancelled' };

      (db.query as any)
        .mockResolvedValueOnce({ rows: [cancelledBatchHeader] })
        .mockResolvedValueOnce({ rows: [] });

      await expect(executeBatch(mockBatchId, async () => 'tx-id')).rejects.toThrow(
        'Batch not found or already cancelled',
      );
    });
  });

  describe('Batch Progress, Cancellation & Analytics', () => {
    it('should calculate batch progress percentage accurately', async () => {
      const mockBatchHeader = { id: 'batch-progress-1' };
      const mockTransactions = [
        { status: 'completed' },
        { status: 'completed' },
        { status: 'failed' },
        { status: 'pending' },
      ];

      (db.query as any)
        .mockResolvedValueOnce({ rows: [mockBatchHeader] })
        .mockResolvedValueOnce({ rows: mockTransactions });

      const progress = await getBatchProgress('batch-progress-1');

      expect(progress.total).toBe(4);
      expect(progress.completed).toBe(2);
      expect(progress.failed).toBe(1);
      expect(progress.pending).toBe(1);
      expect(progress.progressPercent).toBe(75); // (2 completed + 1 failed) / 4 = 75%
    });

    it('should cancel pending transactions and mark batch as cancelled', async () => {
      const mockBatchId = 'batch-cancel-99';

      (db.query as any)
        .mockResolvedValueOnce({ rowCount: 2 }) // UPDATE batch_transactions
        .mockResolvedValueOnce({ rows: [{ id: mockBatchId, status: 'cancelled' }] }); // UPDATE transaction_batches

      const result = await cancelBatch(mockBatchId);

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE batch_transactions SET status = 'cancelled'"),
        [mockBatchId],
      );
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE transaction_batches SET status = 'cancelled'"),
        [mockBatchId],
      );
      expect((result as any).rows[0].status).toBe('cancelled');
    });

    it('should retrieve batch analytics aggregate stats', async () => {
      const mockBatchRows = {
        rows: [
          { status: 'completed', count: '5' },
          { status: 'failed', count: '1' },
          { status: 'cancelled', count: '1' },
        ],
      };

      const mockTxRows = {
        rows: [
          { status: 'completed', count: '45' },
          { status: 'failed', count: '5' },
        ],
      };

      (db.query as any).mockResolvedValueOnce(mockBatchRows).mockResolvedValueOnce(mockTxRows);

      const analytics = await getBatchAnalytics('user-analytics-1');

      expect(analytics.totalBatches).toBe(7);
      expect(analytics.completedBatches).toBe(5);
      expect(analytics.failedBatches).toBe(1);
      expect(analytics.cancelledBatches).toBe(1);
      expect(analytics.totalTransactions).toBe(50);
      expect(analytics.successRate).toBe(90); // 45 / 50 = 90%
      expect(analytics.avgBatchSize).toBe(7); // 50 / 7 = 7.14 -> Math.round(7)
    });
  });
});
