'use client';

import type { FunnelData } from '@/lib/funnel';

interface FunnelChartProps {
  data: FunnelData;
}

/**
 * Horizontal funnel visualization showing per-step counts, conversion rates,
 * and drop-off rates (#399).
 */
export function FunnelChart({ data }: FunnelChartProps) {
  const maxCount = data.steps[0]?.count ?? 1;

  return (
    <div className="space-y-2">
      {data.steps.map((step, i) => {
        const barWidth = maxCount > 0 ? (step.count / maxCount) * 100 : 0;
        const isLast = i === data.steps.length - 1;

        return (
          <div key={step.step}>
            <div className="flex items-center gap-3 text-sm">
              <span className="w-36 shrink-0 text-gray-400 truncate">{step.label}</span>
              <div className="flex-1 bg-gray-800 rounded-sm h-7 relative overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-sm transition-all duration-500"
                  style={{ width: `${barWidth}%` }}
                />
                <span className="absolute inset-0 flex items-center px-2 text-white text-xs font-medium">
                  {step.count.toLocaleString()}
                </span>
              </div>
              <span className="w-14 text-right text-gray-300 text-xs">
                {step.conversionRate.toFixed(1)}%
              </span>
            </div>
            {!isLast && step.dropOffRate > 0 && (
              <div className="ml-36 pl-3 text-xs text-red-400 py-0.5">
                ↓ {step.dropOffRate.toFixed(1)}% drop-off
              </div>
            )}
          </div>
        );
      })}

      <div className="mt-4 pt-4 border-t border-gray-700 flex justify-between text-sm">
        <span className="text-gray-400">Overall conversion</span>
        <span className="font-semibold text-white">{data.overallConversionRate.toFixed(1)}%</span>
      </div>
    </div>
  );
}
