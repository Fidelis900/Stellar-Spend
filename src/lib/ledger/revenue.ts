import { pool } from '@/lib/db';
import type { RevenueSummary } from './types';

export async function getRevenueSummary(
  startDate?: number,
  endDate?: number,
): Promise<RevenueSummary> {
  const conditions: string[] = ["account_id LIKE 'revenue_%'"];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (startDate) {
    conditions.push(`created_at >= $${paramIdx++}`);
    params.push(startDate);
  }
  if (endDate) {
    conditions.push(`created_at <= $${paramIdx++}`);
    params.push(endDate);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const totalResult = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN entry_type = 'credit' THEN amount::numeric ELSE 0 END), 0) AS total_revenue
     FROM ledger_entries ${where}`,
    params,
  );

  const byCurrencyResult = await pool.query(
    `SELECT currency,
       COALESCE(SUM(CASE WHEN entry_type = 'credit' THEN amount::numeric ELSE 0 END), 0) AS total
     FROM ledger_entries ${where}
     GROUP BY currency`,
    params,
  );

  const byPeriodResult = await pool.query(
    `SELECT
       TO_CHAR(TO_TIMESTAMP(created_at / 1000), 'YYYY-MM') AS period,
       COALESCE(SUM(CASE WHEN entry_type = 'credit' THEN amount::numeric ELSE 0 END), 0) AS amount,
       COUNT(*) AS count
     FROM ledger_entries ${where}
     GROUP BY period
     ORDER BY period DESC
     LIMIT 24`,
    params,
  );

  const feeBreakdownResult = await pool.query(
    `SELECT
       account_id,
       COALESCE(SUM(CASE WHEN entry_type = 'credit' THEN amount::numeric ELSE 0 END), 0) AS total
     FROM ledger_entries ${where}
     GROUP BY account_id`,
    params,
  );

  const breakdown: Record<string, string> = {};
  let totalPayoutFees = '0';
  let totalBridgeFees = '0';
  for (const row of feeBreakdownResult.rows) {
    const accountId = row.account_id as string;
    const total = row.total.toString();
    if (accountId === 'revenue_fees') breakdown.fees = total;
    if (accountId === 'revenue_bridge_fees') totalBridgeFees = total;
    if (accountId === 'revenue_payout_fees') totalPayoutFees = total;
  }

  const byCurrency: Record<string, string> = {};
  for (const row of byCurrencyResult.rows) {
    byCurrency[row.currency as string] = row.total.toString();
  }

  return {
    totalRevenue: totalResult.rows[0].total_revenue.toString(),
    totalFees: breakdown.fees ?? '0',
    totalPayoutFees,
    totalBridgeFees,
    byCurrency,
    byPeriod: byPeriodResult.rows.map((r) => ({
      period: r.period as string,
      amount: r.amount.toString(),
      count: Number(r.count),
    })),
  };
}
