import { dal } from '../db/dal';

export interface CurrencyVolume {
  currency: string;
  count: number;
  volume: string;
}

export interface DailyVolume {
  date: string;
  count: number;
  volume: string;
}

export interface AnalyticsSummary {
  totalTransactions: number;
  totalVolume: string;
  completedTransactions: number;
  failedTransactions: number;
  pendingTransactions: number;
  averageTransactionValue: string;
  topCurrencies: CurrencyVolume[];
  volumeByDay: DailyVolume[];
  periodStart: string;
  periodEnd: string;
}

export async function generateAnalyticsSummary(
  from?: number,
  to?: number,
): Promise<AnalyticsSummary> {
  const now = Date.now();
  const periodStart = from ?? now - 30 * 24 * 60 * 60 * 1000;
  const periodEnd = to ?? now;

  let transactions: any[] = [];
  try {
    const { getTransactions } = await import('../db/dal');
    transactions = await getTransactions({ limit: 10000 });
  } catch {}

  const inRange = transactions.filter(
    (tx: any) => tx.timestamp >= periodStart && tx.timestamp <= periodEnd,
  );

  const totalTransactions = inRange.length;
  const totalVolume = inRange.reduce(
    (sum: number, tx: any) => sum + parseFloat(tx.amount || '0'),
    0,
  );

  const completed = inRange.filter((tx: any) => tx.status === 'completed');
  const failed = inRange.filter((tx: any) => tx.status === 'failed');
  const pending = inRange.filter((tx: any) => tx.status === 'pending');

  const currencyMap = new Map<string, { count: number; volume: number }>();
  const dayMap = new Map<string, { count: number; volume: number }>();

  for (const tx of inRange) {
    const cur = tx.currency || 'UNKNOWN';
    const existing = currencyMap.get(cur) ?? { count: 0, volume: 0 };
    existing.count++;
    existing.volume += parseFloat(tx.amount || '0');
    currencyMap.set(cur, existing);

    const day = new Date(tx.timestamp).toISOString().slice(0, 10);
    const dayExisting = dayMap.get(day) ?? { count: 0, volume: 0 };
    dayExisting.count++;
    dayExisting.volume += parseFloat(tx.amount || '0');
    dayMap.set(day, dayExisting);
  }

  const topCurrencies = Array.from(currencyMap.entries())
    .map(([currency, data]) => ({
      currency,
      count: data.count,
      volume: data.volume.toFixed(2),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const volumeByDay = Array.from(dayMap.entries())
    .map(([date, data]) => ({
      date,
      count: data.count,
      volume: data.volume.toFixed(2),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    totalTransactions,
    totalVolume: totalVolume.toFixed(2),
    completedTransactions: completed.length,
    failedTransactions: failed.length,
    pendingTransactions: pending.length,
    averageTransactionValue:
      totalTransactions > 0 ? (totalVolume / totalTransactions).toFixed(2) : '0.00',
    topCurrencies,
    volumeByDay,
    periodStart: new Date(periodStart).toISOString(),
    periodEnd: new Date(periodEnd).toISOString(),
  };
}
