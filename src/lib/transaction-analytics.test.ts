import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({
  pool: {
    query: vi.fn(),
  },
}));

import { pool } from '@/lib/db';
import {
  buildTransactionAnalyticsReport,
  getTransactionAnalytics,
} from '@/lib/transaction-analytics';

describe('buildTransactionAnalyticsReport', () => {
  it('calculates transaction rates, timing, fee trends, and daily reports', () => {
    const report = buildTransactionAnalyticsReport(
      [
        {
          timestamp: Date.parse('2026-04-23T08:00:00.000Z'),
          finalized_at: Date.parse('2026-04-23T08:05:00.000Z'),
          status: 'completed',
          bridge_fee: '0.50',
          network_fee: '0',
          paycrest_fee: '1.00',
          total_fee: '1.50',
        },
        {
          timestamp: Date.parse('2026-04-23T09:00:00.000Z'),
          finalized_at: Date.parse('2026-04-23T09:10:00.000Z'),
          status: 'failed',
          bridge_fee: '0.25',
          network_fee: '0.00001',
          paycrest_fee: '0.50',
          total_fee: '0.75001',
        },
        {
          timestamp: Date.parse('2026-04-24T10:00:00.000Z'),
          finalized_at: Date.parse('2026-04-24T10:02:00.000Z'),
          status: 'completed',
          bridge_fee: '0.75',
          network_fee: '0',
          paycrest_fee: '1.20',
          total_fee: '1.95',
        },
        {
          timestamp: Date.parse('2026-04-24T11:00:00.000Z'),
          finalized_at: null,
          status: 'pending',
          bridge_fee: null,
          network_fee: null,
          paycrest_fee: null,
          total_fee: null,
        },
      ],
      7,
      new Date('2026-04-25T00:00:00.000Z'),
    );

    expect(report.totals).toEqual({
      transactionCount: 4,
      successfulCount: 2,
      failedCount: 1,
      pendingCount: 1,
    });
    expect(report.rates.successRate).toBe(50);
    expect(report.rates.failureRate).toBe(25);
    expect(report.timing.averageTransactionTimeMs).toBe(340000);
    expect(report.fees.averageTotalFee).toBeCloseTo(1.05, 2);
    expect(report.fees.totalFeesCollected).toBeCloseTo(4.20001, 5);
    expect(report.fees.latestTrendDirection).toBe('down');
    expect(report.dailyReports).toEqual([
      {
        date: '2026-04-23',
        totalTransactions: 2,
        successfulTransactions: 1,
        failedTransactions: 1,
        successRate: 50,
        failureRate: 50,
        averageTransactionTimeMs: 450000,
        averageTotalFee: 1.13,
        totalFeesCollected: 2.25001,
      },
      {
        date: '2026-04-24',
        totalTransactions: 2,
        successfulTransactions: 1,
        failedTransactions: 0,
        successRate: 50,
        failureRate: 0,
        averageTransactionTimeMs: 120000,
        averageTotalFee: 0.98,
        totalFeesCollected: 1.95,
      },
    ]);
    expect(report.feeTrends[0].averageNetworkFee).toBeCloseTo(0.000005, 6);
    expect(report.feeTrends[1].averageBridgeFee).toBeCloseTo(0.375, 6);
  });
});

describe('getTransactionAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queries the database and returns a report for the requested period', async () => {
    vi.mocked(pool.query).mockResolvedValue({
      rows: [
        {
          timestamp: Date.parse('2026-04-24T10:00:00.000Z'),
          finalized_at: Date.parse('2026-04-24T10:03:00.000Z'),
          status: 'completed',
          bridge_fee: '0.5',
          network_fee: '0',
          paycrest_fee: '1.0',
          total_fee: '1.5',
        },
      ],
    } as never);

    const report = await getTransactionAnalytics(14);

    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('FROM transactions'), [
      expect.any(Number),
    ]);
    expect(report.periodDays).toBe(14);
    expect(report.totals.transactionCount).toBe(1);
    expect(report.rates.successRate).toBe(100);
  });
});
