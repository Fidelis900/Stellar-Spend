import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock DB client before importing service
vi.mock('@/lib/db/client', () => ({
  db: {
    query: vi.fn(),
  },
}));

import { db } from '@/lib/db';
import {
  scheduleTransaction,
  getScheduledTransactions,
  getPendingScheduledTransactions,
  executeScheduledTransaction,
  cancelScheduledTransaction,
  updateScheduledTransaction,
} from './scheduling.service';

describe('Scheduling Service - Execution & Timing Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('DST Transition Handling', () => {
    it('should schedule and evaluate execution across Daylight Saving Time (Spring Forward)', async () => {
      // 2026 Spring Forward in US Eastern: March 8, 2026, 02:00 -> 03:00
      // Set fixed time right before DST transition: March 8, 2026 01:30 EST (06:30 UTC)
      const baseTime = new Date('2026-03-08T06:30:00.000Z');
      vi.setSystemTime(baseTime);

      // Target schedule time during DST shift: March 8, 2026 07:30 UTC (03:30 EDT)
      const scheduledTime = new Date('2026-03-08T07:30:00.000Z');

      (db.query as any).mockResolvedValueOnce({
        rows: [
          {
            id: 'sched-dst-spring',
            user_id: 'user-1',
            amount: 500,
            currency: 'USD',
            scheduled_for: scheduledTime,
            status: 'scheduled',
          },
        ],
      });

      const scheduled = await scheduleTransaction('user-1', 500, 'USD', scheduledTime);
      expect(scheduled.id).toBe('sched-dst-spring');
      expect(new Date(scheduled.scheduled_for).toISOString()).toBe('2026-03-08T07:30:00.000Z');

      // Advance mock timer past the DST shift (to 08:00 UTC)
      vi.setSystemTime(new Date('2026-03-08T08:00:00.000Z'));

      (db.query as any).mockResolvedValueOnce({
        rows: [
          {
            id: 'sched-dst-spring',
            user_id: 'user-1',
            amount: 500,
            currency: 'USD',
            scheduled_for: scheduledTime,
            status: 'scheduled',
          },
        ],
      });

      const pending = await getPendingScheduledTransactions();
      expect(pending).toHaveLength(1);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining("WHERE status = 'scheduled' AND scheduled_for <="),
        [expect.any(Date)],
      );
    });

    it('should schedule and evaluate execution across Daylight Saving Time (Fall Back)', async () => {
      // 2026 Fall Back in US Eastern: Nov 1, 2026, 02:00 -> 01:00
      const scheduledTime = new Date('2026-11-01T06:00:00.000Z'); // 02:00 EDT / 01:00 EST equivalent in UTC

      (db.query as any).mockResolvedValueOnce({
        rows: [
          {
            id: 'sched-dst-fall',
            user_id: 'user-1',
            amount: 100,
            currency: 'USDC',
            scheduled_for: scheduledTime,
            status: 'scheduled',
          },
        ],
      });

      const res = await scheduleTransaction('user-1', 100, 'USDC', scheduledTime);
      expect(res.id).toBe('sched-dst-fall');
    });
  });

  describe('Retroactive / Past-Due Schedule Handling', () => {
    it('should identify retroactive / past-due scheduled transactions correctly', async () => {
      const now = new Date('2026-07-28T12:00:00.000Z');
      vi.setSystemTime(now);

      const pastDueTime1 = new Date('2026-07-28T10:00:00.000Z'); // 2 hours past due
      const pastDueTime2 = new Date('2026-07-27T12:00:00.000Z'); // 1 day past due

      const pastDueRows = [
        {
          id: 'sched-past-1',
          user_id: 'user-2',
          amount: 250,
          currency: 'NGN',
          scheduled_for: pastDueTime2,
          status: 'scheduled',
        },
        {
          id: 'sched-past-2',
          user_id: 'user-2',
          amount: 150,
          currency: 'NGN',
          scheduled_for: pastDueTime1,
          status: 'scheduled',
        },
      ];

      (db.query as any).mockResolvedValueOnce({ rows: pastDueRows });

      const pending = await getPendingScheduledTransactions();

      expect(pending).toHaveLength(2);
      expect(pending[0].id).toBe('sched-past-1');
      expect(pending[1].id).toBe('sched-past-2');
      expect(db.query).toHaveBeenCalledWith(expect.stringContaining('ORDER BY scheduled_for ASC'), [
        now,
      ]);
    });

    it('should execute past-due scheduled transaction and update status to executed', async () => {
      const scheduledId = 'sched-past-1';
      const executedTxId = 'tx-executed-999';

      (db.query as any).mockResolvedValueOnce({
        rows: [
          {
            id: scheduledId,
            status: 'executed',
            transaction_id: executedTxId,
          },
        ],
      });

      const result = await executeScheduledTransaction(scheduledId, executedTxId);

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE scheduled_transactions SET status = 'executed'"),
        [executedTxId, scheduledId],
      );
      expect((result as any).rows[0].status).toBe('executed');
      expect((result as any).rows[0].transaction_id).toBe(executedTxId);
    });
  });

  describe('Cancellation of Pending Scheduled Transactions', () => {
    it('should cancel a pending scheduled transaction', async () => {
      const scheduledId = 'sched-cancel-123';

      (db.query as any).mockResolvedValueOnce({
        rows: [
          {
            id: scheduledId,
            status: 'cancelled',
          },
        ],
      });

      const result = await cancelScheduledTransaction(scheduledId);

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE scheduled_transactions SET status = 'cancelled'"),
        [scheduledId],
      );
      expect((result as any).rows[0].status).toBe('cancelled');
    });

    it('should allow updating schedule time for pending transactions', async () => {
      const scheduledId = 'sched-update-456';
      const newScheduledTime = new Date('2026-08-01T15:00:00.000Z');

      (db.query as any).mockResolvedValueOnce({
        rows: [
          {
            id: scheduledId,
            scheduled_for: newScheduledTime,
            status: 'scheduled',
          },
        ],
      });

      const result = await updateScheduledTransaction(scheduledId, newScheduledTime);

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE scheduled_transactions SET scheduled_for = $1'),
        [newScheduledTime, scheduledId],
      );
      expect((result as any).rows[0].scheduled_for).toEqual(newScheduledTime);
    });
  });
});
