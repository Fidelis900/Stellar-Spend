'use client';

import { useState, useEffect, useCallback } from 'react';
import { AnalyticsPeriod } from '@shared/types/analytics';
import { FunnelChart } from '@/components/FunnelChart';
import { AnalyticsDashboardSkeleton } from '@/components/skeletons';

interface AnalyticsDashboardProps {
  userAddress: string;
}

// ---------------------------------------------------------------------------
// Inline mini-charts (no external deps)
// ---------------------------------------------------------------------------

function SparkBar({ values, color = '#3b82f6' }: { values: number[]; color?: string }) {
  if (!values.length) return null;
  const max = Math.max(...values, 1);
  return (
    <div className="flex items-end gap-0.5 h-12">
      {values.map((v, i) => (
        <div
          key={i}
          style={{ height: `${(v / max) * 100}%`, backgroundColor: color, minWidth: 4, flex: 1 }}
          className="rounded-t opacity-80"
          title={String(v)}
        />
      ))}
    </div>
  );
}

function PieChart({ slices }: { slices: { label: string; value: number; color: string }[] }) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  let cumulative = 0;
  const paths = slices.map((slice) => {
    const pct = slice.value / total;
    const start = cumulative;
    cumulative += pct;
    const startAngle = start * 2 * Math.PI - Math.PI / 2;
    const endAngle = cumulative * 2 * Math.PI - Math.PI / 2;
    const x1 = 50 + 40 * Math.cos(startAngle);
    const y1 = 50 + 40 * Math.sin(startAngle);
    const x2 = 50 + 40 * Math.cos(endAngle);
    const y2 = 50 + 40 * Math.sin(endAngle);
    const largeArc = pct > 0.5 ? 1 : 0;
    return {
      d: `M50,50 L${x1},${y1} A40,40 0 ${largeArc},1 ${x2},${y2} Z`,
      color: slice.color,
      label: slice.label,
      pct,
    };
  });

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 100 100" className="w-24 h-24 shrink-0">
        {paths.map((p, i) => (
          <path key={i} d={p.d} fill={p.color} />
        ))}
      </svg>
      <ul className="space-y-1">
        {paths.map((p, i) => (
          <li key={i} className="flex items-center gap-2 text-xs">
            <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: p.color }} />
            <span>
              {p.label} — {(p.pct * 100).toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Comparison badge
// ---------------------------------------------------------------------------

function DeltaBadge({
  current,
  previous,
  label,
}: {
  current: number;
  previous: number;
  label: string;
}) {
  if (!previous) return null;
  const delta = ((current - previous) / previous) * 100;
  const up = delta >= 0;
  return (
    <span className={`text-xs ml-1 ${up ? 'text-green-600' : 'text-red-500'}`}>
      {up ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}% vs prev {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Export helper
// ---------------------------------------------------------------------------

function exportAnalyticsCSV(analytics: AnalyticsPeriod) {
  const rows = [
    ['Date', 'Transactions', 'Amount'],
    ...analytics.spendingPatterns.map((sp) => [sp.date, sp.transactionCount, sp.amount]),
  ];
  const csv = rows.map((r) => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `analytics-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Palette for pie slices
// ---------------------------------------------------------------------------

const SLICE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AnalyticsDashboard({ userAddress }: AnalyticsDashboardProps) {
  const [analytics, setAnalytics] = useState<AnalyticsPeriod | null>(null);
  const [prevAnalytics, setPrevAnalytics] = useState<AnalyticsPeriod | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('30d');

  const fetchPeriod = useCallback(
    async (p: '7d' | '30d' | '90d', signal?: AbortSignal) => {
      const now = Date.now();
      const daysMap = { '7d': 7, '30d': 30, '90d': 90 };
      const days = daysMap[p];
      const startDate = now - days * 86_400_000;
      const res = await fetch(
        `/api/transactions/analytics?startDate=${startDate}&endDate=${now}&period=${p}`,
        { headers: { 'x-user-address': userAddress }, signal },
      );
      if (!res.ok) throw new Error('Failed to fetch analytics');
      return res.json() as Promise<AnalyticsPeriod>;
    },
    [userAddress],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError('');

    const daysMap = { '7d': 7, '30d': 30, '90d': 90 };
    const days = daysMap[period];
    const now = Date.now();

    // Fetch current + previous period in parallel
    const prevPeriod = period; // same window length, shifted back
    const prevStart = now - 2 * days * 86_400_000;
    const prevEnd = now - days * 86_400_000;

    Promise.all([
      fetchPeriod(period, ctrl.signal),
      fetch(
        `/api/transactions/analytics?startDate=${prevStart}&endDate=${prevEnd}&period=${prevPeriod}`,
        { headers: { 'x-user-address': userAddress }, signal: ctrl.signal },
      )
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ])
      .then(([curr, prev]) => {
        setAnalytics(curr);
        setPrevAnalytics(prev);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setError(err.message ?? 'Failed to load analytics');
      })
      .finally(() => setLoading(false));

    return () => ctrl.abort();
  }, [period, fetchPeriod, userAddress]);

  if (loading) return <AnalyticsDashboardSkeleton />;
  if (error) return <div className="text-red-600 py-8">{error}</div>;
  if (!analytics) return <div className="text-center py-8">No data available</div>;

  const { analytics: stats, currencyBreakdown, feeAnalysis, spendingPatterns, funnel } = analytics;
  const prev = prevAnalytics?.analytics;

  // Spending trend values for sparkbar
  const trendValues = spendingPatterns.map((sp) => parseFloat(sp.amount) || 0);
  const txTrendValues = spendingPatterns.map((sp) => sp.transactionCount);

  // Average tx size
  const avgTxSize =
    stats.totalTransactions > 0
      ? (parseFloat(stats.totalVolume) / stats.totalTransactions).toFixed(2)
      : '0.00';

  // Fee savings estimate (USDC fee vs XLM fee — assume XLM fee is 0.5% more)
  const feeSavings = (parseFloat(feeAnalysis.totalFeesPaid) * 0.005).toFixed(2);

  // Pie slices
  const pieSlices = currencyBreakdown.map((cb, i) => ({
    label: cb.currency,
    value: parseFloat(cb.volume) || cb.count,
    color: SLICE_COLORS[i % SLICE_COLORS.length],
  }));

  return (
    <div className="space-y-6">
      {/* Period Selector + Export */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-2">
          {(['7d', '30d', '90d'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-2 rounded-lg text-sm ${period === p ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-800'}`}
            >
              {p === '7d' ? 'Last 7 days' : p === '30d' ? 'Last 30 days' : 'Last 90 days'}
            </button>
          ))}
        </div>
        <button
          onClick={() => exportAnalyticsCSV(analytics)}
          className="text-sm px-3 py-1.5 border rounded hover:bg-gray-50 text-gray-700"
        >
          ↓ Export CSV
        </button>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Total Transactions" value={stats.totalTransactions.toString()}>
          <DeltaBadge
            current={stats.totalTransactions}
            previous={prev?.totalTransactions ?? 0}
            label={period}
          />
        </MetricCard>
        <MetricCard label="Total Volume" value={`$${stats.totalVolume}`}>
          <DeltaBadge
            current={parseFloat(stats.totalVolume)}
            previous={parseFloat(prev?.totalVolume ?? '0')}
            label={period}
          />
        </MetricCard>
        <MetricCard label="Avg Transaction" value={`$${avgTxSize}`} />
        <MetricCard label="Success Rate" value={`${stats.successRate.toFixed(1)}%`}>
          <DeltaBadge
            current={stats.successRate}
            previous={prev?.successRate ?? 0}
            label={period}
          />
        </MetricCard>
      </div>

      {/* Spending Trends Chart */}
      {trendValues.length > 0 && (
        <div className="bg-white p-6 rounded-lg border">
          <h3 className="text-lg font-semibold mb-1">Spending Trends</h3>
          <p className="text-xs text-gray-500 mb-3">Daily volume (USD) over selected period</p>
          <SparkBar values={trendValues} color="#3b82f6" />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>{spendingPatterns[0]?.date}</span>
            <span>{spendingPatterns[spendingPatterns.length - 1]?.date}</span>
          </div>
        </div>
      )}

      {/* Transaction Count Trend */}
      {txTrendValues.length > 0 && (
        <div className="bg-white p-6 rounded-lg border">
          <h3 className="text-lg font-semibold mb-1">Transaction Count Trend</h3>
          <p className="text-xs text-gray-500 mb-3">Daily transaction count</p>
          <SparkBar values={txTrendValues} color="#10b981" />
        </div>
      )}

      {/* Currency Distribution Pie */}
      {pieSlices.length > 0 && (
        <div className="bg-white p-6 rounded-lg border">
          <h3 className="text-lg font-semibold mb-4">Currency Distribution</h3>
          <PieChart slices={pieSlices} />
        </div>
      )}

      {/* Conversion Funnel */}
      {funnel && (
        <div className="bg-gray-900 p-6 rounded-lg border border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Conversion Funnel</h3>
            <span className="text-sm text-gray-400">
              {funnel.totalSessions.toLocaleString()} sessions
            </span>
          </div>
          <FunnelChart data={funnel} />
        </div>
      )}

      {/* Fee Analysis + Savings */}
      <div className="bg-white p-6 rounded-lg border">
        <h3 className="text-lg font-semibold mb-4">Fee Analysis</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-600">Total Fees</p>
            <p className="text-2xl font-bold">${feeAnalysis.totalFeesPaid}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Avg Fee %</p>
            <p className="text-2xl font-bold">{feeAnalysis.averageFeePercentage.toFixed(2)}%</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Bridge Fees</p>
            <p className="text-lg font-semibold">${feeAnalysis.bridgeFees}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Payout Fees</p>
            <p className="text-lg font-semibold">${feeAnalysis.payoutFees}</p>
          </div>
        </div>
        <div className="mt-4 p-3 bg-green-50 rounded-lg border border-green-200">
          <p className="text-sm text-green-800 font-medium">
            💡 Estimated savings from USDC fee optimization: <strong>${feeSavings}</strong>
          </p>
        </div>
      </div>

      {/* Time-based Analysis */}
      <div className="bg-white p-6 rounded-lg border">
        <h3 className="text-lg font-semibold mb-4">Spending Patterns</h3>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {spendingPatterns.map((sp) => (
            <div
              key={sp.date}
              className="flex items-center justify-between py-2 border-b last:border-0"
            >
              <div>
                <p className="font-medium text-sm">{new Date(sp.date).toLocaleDateString()}</p>
                <p className="text-xs text-gray-500">{sp.transactionCount} transactions</p>
              </div>
              <p className="font-semibold">${sp.amount}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="bg-white p-4 rounded-lg border">
      <p className="text-sm text-gray-600 mb-1">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      {children}
    </div>
  );
}
