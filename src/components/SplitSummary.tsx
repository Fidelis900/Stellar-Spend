'use client';

import { cn } from '@/lib/cn';
import type { SplitTransaction } from '@/lib/transaction-split';

interface Props {
  split: SplitTransaction;
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10',
  completed: 'text-green-400 border-green-400/30 bg-green-400/10',
  failed: 'text-red-400 border-red-400/30 bg-red-400/10',
  partial: 'text-orange-400 border-orange-400/30 bg-orange-400/10',
};

export default function SplitSummary({ split }: Props) {
  return (
    <div className="border border-[#333333] bg-[#111111] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] tracking-widest uppercase text-[#777777]">Split Summary</span>
        <span
          className={cn(
            'text-[10px] tracking-widest uppercase px-2 py-0.5 border font-semibold',
            STATUS_STYLES[split.status] ?? STATUS_STYLES.pending,
          )}
        >
          {split.status}
        </span>
      </div>

      <div className="text-xs text-[#aaaaaa]">
        Total: <span className="text-white font-semibold">{split.totalAmount} USDC</span>
        {' · '}
        {split.recipients.length} recipients
      </div>

      <div className="space-y-1.5">
        {split.recipients.map((r) => {
          const result = split.results[r.id];
          return (
            <div key={r.id} className="flex items-center justify-between text-xs">
              <span className="text-[#aaaaaa] truncate max-w-[140px]" title={r.label}>
                {r.label}
              </span>
              <div className="flex items-center gap-3">
                <span className="text-white tabular-nums">{r.amount ?? '—'} USDC</span>
                <span className="text-[#777777]">{r.percentage}%</span>
                {result && (
                  <span
                    className={cn(
                      'text-[10px] px-1.5 py-0.5 border',
                      STATUS_STYLES[result.status] ?? STATUS_STYLES.pending,
                    )}
                    title={result.error}
                  >
                    {result.status}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
