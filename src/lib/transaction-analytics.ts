import { pool } from '@/lib/db';
import type { Transaction } from '@/lib/transaction-storage';

export interface DailyTransactionReport {
  date: string;
  totalTransactions: number;
  successfulTransactions: number;
  failedTransactions: number;
  successRate: number;
  failureRate: number;
  averageTransactionTimeMs: number;
  averageTotalFee: number;
  totalFeesCollected: number;
}

export interface FeeTrendPoint {
  date: string;
  averageTotalFee: number;
  totalFeesCollected: number;
  averageBridgeFee: number;
  averageNetworkFee: number;
  averagePaycrestFee: number;
  transactionCount: number;
}

export interface TransactionAnalyticsReport {
  periodDays: number;
  generatedAt: string;
  totals: {
    transactionCount: number;
    successfulCount: number;
    failedCount: number;
    pendingCount: number;
  };
  rates: {
    successRate: number;
    failureRate: number;
  };
  timing: {
    averageTransactionTimeMs: number;
    averageTransactionTimeSeconds: number;
  };
  fees: {
    averageTotalFee: number;
    totalFeesCollected: number;
    latestTrendDirection: 'up' | 'down' | 'flat';
  };
  dailyReports: DailyTransactionReport[];
  feeTrends: FeeTrendPoint[];
}

interface AnalyticsRow {
  timestamp: number;
  finalized_at: number | null;
  status: Transaction['status'];
  bridge_fee: string | null;
  network_fee: string | null;
  paycrest_fee: string | null;
  total_fee: string | null;
}

function toNumber(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDayKey(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function safeRate(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return round((numerator / denominator) * 100, 2);
}

function average(values: number[], digits = 2): number {
  if (values.length === 0) return 0;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length, digits);
}

export function buildTransactionAnalyticsReport(
  rows: AnalyticsRow[],
  periodDays: number,
  now = new Date(),
): TransactionAnalyticsReport {
  const successfulRows = rows.filter((row) => row.status === 'completed');
  const failedRows = rows.filter((row) => row.status === 'failed');
  const pendingRows = rows.filter((row) => row.status === 'pending');
  const finalizedDurations = rows
    .filter((row) => row.finalized_at !== null && row.finalized_at >= row.timestamp)
    .map((row) => row.finalized_at! - row.timestamp);

  const dailyBuckets = new Map<string, AnalyticsRow[]>();
  for (const row of rows) {
    const key = toDayKey(row.timestamp);
    const bucket = dailyBuckets.get(key) ?? [];
    bucket.push(row);
    dailyBuckets.set(key, bucket);
  }

  const sortedDays = Array.from(dailyBuckets.keys()).sort();
  const dailyReports = sortedDays.map((date) => {
    const dayRows = dailyBuckets.get(date) ?? [];
    const successfulTransactions = dayRows.filter((row) => row.status === 'completed').length;
    const failedTransactions = dayRows.filter((row) => row.status === 'failed').length;
    const durations = dayRows
      .filter((row) => row.finalized_at !== null && row.finalized_at >= row.timestamp)
      .map((row) => row.finalized_at! - row.timestamp);
    const totalFees = dayRows.reduce((sum, row) => sum + toNumber(row.total_fee), 0);

    return {
      date,
      totalTransactions: dayRows.length,
      successfulTransactions,
      failedTransactions,
      successRate: safeRate(successfulTransactions, dayRows.length),
      failureRate: safeRate(failedTransactions, dayRows.length),
      averageTransactionTimeMs: average(durations, 0),
      averageTotalFee: average(dayRows.map((row) => toNumber(row.total_fee))),
      totalFeesCollected: round(totalFees, 6),
    };
  });

  const feeTrends = sortedDays.map((date) => {
    const dayRows = dailyBuckets.get(date) ?? [];
    const totalFeesCollected = dayRows.reduce((sum, row) => sum + toNumber(row.total_fee), 0);

    return {
      date,
      averageTotalFee: average(dayRows.map((row) => toNumber(row.total_fee))),
      totalFeesCollected: round(totalFeesCollected, 6),
      averageBridgeFee: average(
        dayRows.map((row) => toNumber(row.bridge_fee)),
        6,
      ),
      averageNetworkFee: average(
        dayRows.map((row) => toNumber(row.network_fee)),
        6,
      ),
      averagePaycrestFee: average(dayRows.map((row) => toNumber(row.paycrest_fee))),
      transactionCount: dayRows.length,
    };
  });

  const latestTrendDirection =
    feeTrends.length < 2
      ? 'flat'
      : feeTrends[feeTrends.length - 1].averageTotalFee >
          feeTrends[feeTrends.length - 2].averageTotalFee
        ? 'up'
        : feeTrends[feeTrends.length - 1].averageTotalFee <
            feeTrends[feeTrends.length - 2].averageTotalFee
          ? 'down'
          : 'flat';

  const totalFeesCollected = rows.reduce((sum, row) => sum + toNumber(row.total_fee), 0);

  return {
    periodDays,
    generatedAt: now.toISOString(),
    totals: {
      transactionCount: rows.length,
      successfulCount: successfulRows.length,
      failedCount: failedRows.length,
      pendingCount: pendingRows.length,
    },
    rates: {
      successRate: safeRate(successfulRows.length, rows.length),
      failureRate: safeRate(failedRows.length, rows.length),
    },
    timing: {
      averageTransactionTimeMs: average(finalizedDurations, 0),
      averageTransactionTimeSeconds: average(finalizedDurations.map((value) => value / 1000)),
    },
    fees: {
      averageTotalFee: average(rows.map((row) => toNumber(row.total_fee))),
      totalFeesCollected: round(totalFeesCollected, 6),
      latestTrendDirection,
    },
    dailyReports,
    feeTrends,
  };
}

export async function getTransactionAnalytics(periodDays = 7): Promise<TransactionAnalyticsReport> {
  const safePeriodDays = Number.isFinite(periodDays) && periodDays > 0 ? Math.floor(periodDays) : 7;
  const since = Date.now() - safePeriodDays * 24 * 60 * 60 * 1000;
  const result = await pool.query<AnalyticsRow>(
    `
      SELECT
        timestamp,
        finalized_at,
        status,
        bridge_fee,
        network_fee,
        paycrest_fee,
        total_fee
      FROM transactions
      WHERE timestamp >= $1
      ORDER BY timestamp ASC
    `,
    [since],
  );

  return buildTransactionAnalyticsReport(result.rows, safePeriodDays);
}
