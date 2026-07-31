'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';
import type { RecentOfframpRow } from '@shared/types/stellaramp';
import type { OfframpStep } from '@shared/types/stellaramp';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

type TransactionStatus =
  | RecentOfframpRow['status']
  | OfframpStep
  | 'pending'
  | 'completed'
  | 'failed'
  | 'reversed'
  | 'partially_reversed';

interface StatusConfig {
  label: string;
  tooltip: string;
  colorClasses: string;
  dotClasses: string;
  animate?: boolean;
}

const STATUS_CONFIG: Record<string, StatusConfig> = {
  // RecentOfframpRow statuses
  SETTLING: {
    label: 'Settling',
    tooltip: 'Funds are being transferred to your bank account.',
    colorClasses: 'bg-[#c9a962]/15 border border-[#c9a962]/60 text-[#c9a962]',
    dotClasses: 'bg-[#c9a962]',
    animate: true,
  },
  COMPLETE: {
    label: 'Complete',
    tooltip: 'Transaction completed successfully.',
    colorClasses: 'bg-green-500/10 border border-green-500/40 text-green-400',
    dotClasses: 'bg-green-500',
  },
  // OfframpStep statuses
  idle: {
    label: 'Idle',
    tooltip: 'No active transaction.',
    colorClasses: 'bg-[#333333]/40 border border-[#333333] text-[#777777]',
    dotClasses: 'bg-[#555555]',
  },
  initiating: {
    label: 'Initiating',
    tooltip: 'Preparing your transaction details.',
    colorClasses: 'bg-blue-500/10 border border-blue-500/40 text-blue-400',
    dotClasses: 'bg-blue-400',
    animate: true,
  },
  'awaiting-signature': {
    label: 'Awaiting Signature',
    tooltip: 'Waiting for wallet approval.',
    colorClasses: 'bg-yellow-500/10 border border-yellow-500/40 text-yellow-400',
    dotClasses: 'bg-yellow-400',
    animate: true,
  },
  submitting: {
    label: 'Submitting',
    tooltip: 'Broadcasting to the Stellar network.',
    colorClasses: 'bg-blue-500/10 border border-blue-500/40 text-blue-400',
    dotClasses: 'bg-blue-400',
    animate: true,
  },
  processing: {
    label: 'Processing',
    tooltip: 'Waiting for on-chain confirmation.',
    colorClasses: 'bg-[#c9a962]/15 border border-[#c9a962]/60 text-[#c9a962]',
    dotClasses: 'bg-[#c9a962]',
    animate: true,
  },
  settling: {
    label: 'Settling',
    tooltip: 'Transferring funds to your bank account.',
    colorClasses: 'bg-[#c9a962]/15 border border-[#c9a962]/60 text-[#c9a962]',
    dotClasses: 'bg-[#c9a962]',
    animate: true,
  },
  success: {
    label: 'Success',
    tooltip: 'Transaction completed successfully.',
    colorClasses: 'bg-green-500/10 border border-green-500/40 text-green-400',
    dotClasses: 'bg-green-500',
  },
  error: {
    label: 'Failed',
    tooltip: 'Transaction failed. Please try again.',
    colorClasses: 'bg-red-500/10 border border-red-500/40 text-red-400',
    dotClasses: 'bg-red-500',
  },
  // Transaction storage statuses
  pending: {
    label: 'Pending',
    tooltip: 'Transaction is pending.',
    colorClasses: 'bg-yellow-500/10 border border-yellow-500/40 text-yellow-400',
    dotClasses: 'bg-yellow-400',
    animate: true,
  },
  completed: {
    label: 'Completed',
    tooltip: 'Transaction completed successfully.',
    colorClasses: 'bg-green-500/10 border border-green-500/40 text-green-400',
    dotClasses: 'bg-green-500',
  },
  failed: {
    label: 'Failed',
    tooltip: 'Transaction failed.',
    colorClasses: 'bg-red-500/10 border border-red-500/40 text-red-400',
    dotClasses: 'bg-red-500',
  },
  reversed: {
    label: 'Reversed',
    tooltip: 'Transaction was fully reversed.',
    colorClasses: 'bg-purple-500/10 border border-purple-500/40 text-purple-400',
    dotClasses: 'bg-purple-500',
  },
  partially_reversed: {
    label: 'Partially Reversed',
    tooltip: 'Part of the transaction was reversed.',
    colorClasses: 'bg-purple-500/10 border border-purple-500/40 text-purple-400',
    dotClasses: 'bg-purple-500',
  },
};

const FALLBACK_CONFIG: StatusConfig = {
  label: 'Unknown',
  tooltip: 'Status unknown.',
  colorClasses: 'bg-[#333333]/40 border border-[#333333] text-[#777777]',
  dotClasses: 'bg-[#555555]',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface StatusBadgeProps {
  status: TransactionStatus;
  /** Show the status icon dot */
  showIcon?: boolean;
  className?: string;
}

export function StatusBadge({ status, showIcon = true, className }: StatusBadgeProps) {
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const config = STATUS_CONFIG[status] ?? FALLBACK_CONFIG;

  return (
    <span className="relative inline-flex items-center">
      <span
        role="status"
        aria-label={`Transaction status: ${config.label}`}
        title={config.tooltip}
        onMouseEnter={() => setTooltipVisible(true)}
        onMouseLeave={() => setTooltipVisible(false)}
        onFocus={() => setTooltipVisible(true)}
        onBlur={() => setTooltipVisible(false)}
        tabIndex={0}
        className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-0.5',
          'text-[10px] tracking-widest uppercase font-semibold',
          'cursor-default select-none rounded-sm',
          'focus:outline-none focus-visible:ring-1 focus-visible:ring-[#c9a962]',
          config.colorClasses,
          className,
        )}
      >
        {showIcon && (
          <span
            aria-hidden="true"
            className={cn(
              'inline-block h-1.5 w-1.5 rounded-full flex-shrink-0',
              config.dotClasses,
              config.animate && 'animate-pulse',
            )}
          />
        )}
        {config.label}
      </span>

      {/* Tooltip */}
      {tooltipVisible && (
        <span
          role="tooltip"
          className={cn(
            'absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-10',
            'px-2.5 py-1.5 text-[10px] text-white bg-[#1a1a1a] border border-[#333333]',
            'whitespace-nowrap pointer-events-none shadow-lg',
          )}
        >
          {config.tooltip}
          {/* Arrow */}
          <span
            aria-hidden="true"
            className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#333333]"
          />
        </span>
      )}
    </span>
  );
}
