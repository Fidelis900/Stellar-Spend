'use client';

import { memo, useCallback, useState } from 'react';
import type { Transaction } from '@/lib/transaction-storage';
import VirtualList from './VirtualList';
import { CopyButton } from './CopyButton';
import { StatusBadge } from './StatusBadge';
import { getCurrencyFlag } from '@/lib/currency-flags';
import { cn } from '@/lib/cn';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function truncateTxHash(hash: string): string {
  if (!hash || hash.length <= 12) return hash || '—';
  return `${hash.slice(0, 6)}...${hash.slice(-6)}`;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface VirtualizedTransactionTableProps {
  transactions: Transaction[];
  onEditNote: (txId: string, currentNote?: string) => void;
  onClaimInsurance: (tx: Transaction) => void;
  focusedRowId?: string | null;
}

// ---------------------------------------------------------------------------
// Row Skeleton (shown during fetch)
// ---------------------------------------------------------------------------

export const RowSkeleton = memo(function RowSkeleton() {
  return (
    <tr className="border-b border-[#222222] bg-[#111111] animate-pulse">
      <td className="px-5 py-3">
        <div className="h-4 bg-[#222222] rounded w-32"></div>
      </td>
      <td className="px-5 py-3">
        <div className="h-4 bg-[#222222] rounded w-24"></div>
      </td>
      <td className="px-5 py-3">
        <div className="h-4 bg-[#222222] rounded w-20"></div>
      </td>
      <td className="px-5 py-3">
        <div className="h-4 bg-[#222222] rounded w-16"></div>
      </td>
      <td className="px-5 py-3">
        <div className="h-4 bg-[#222222] rounded w-28"></div>
      </td>
      <td className="px-5 py-3">
        <div className="h-4 bg-[#222222] rounded w-20"></div>
      </td>
      <td className="px-5 py-3">
        <div className="h-4 bg-[#222222] rounded w-24"></div>
      </td>
      <td className="px-5 py-3">
        <div className="h-4 bg-[#222222] rounded w-16"></div>
      </td>
    </tr>
  );
});

// ---------------------------------------------------------------------------
// Row Component
// ---------------------------------------------------------------------------

interface TableRowProps {
  tx: Transaction;
  index: number;
  isFocused: boolean;
  onEditNote: (txId: string) => void;
  onClaimInsurance: (tx: Transaction) => void;
}

const TableRow = memo(
  function TableRow({ tx, index, isFocused, onEditNote, onClaimInsurance }: TableRowProps) {
    return (
      <tr
        className={cn(
          'border-b border-[#222222] transition-colors duration-100',
          index % 2 === 0 ? 'bg-[#111111]' : 'bg-[#0f0f0f]',
          'hover:bg-[#1a1a1a]',
          isFocused && 'ring-1 ring-[#c9a962]',
        )}
        role="row"
        tabIndex={isFocused ? 0 : -1}
      >
        <td className="px-5 py-3 text-xs text-[#aaaaaa] whitespace-nowrap">
          {formatDate(tx.timestamp)}
        </td>
        <td className="px-5 py-3 text-xs text-[#777777] font-mono whitespace-nowrap">
          {tx.stellarTxHash ? (
            <div className="flex items-center gap-2">
              <a
                href={`https://stellar.expert/explorer/public/tx/${tx.stellarTxHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[#c9a962] transition-colors duration-150 underline decoration-dotted"
              >
                {truncateTxHash(tx.stellarTxHash)}
              </a>
              <CopyButton text={tx.stellarTxHash} label="" className="text-[10px]" />
            </div>
          ) : (
            <span className="text-[#555555]">Pending</span>
          )}
        </td>
        <td className="px-5 py-3 text-xs text-white tabular-nums whitespace-nowrap">
          {tx.amount} USDC
        </td>
        <td className="px-5 py-3 text-xs text-white whitespace-nowrap">
          <span className="flex items-center gap-1.5">
            {getCurrencyFlag(tx.currency) && (
              <span aria-label={tx.currency} title={tx.currency}>
                {getCurrencyFlag(tx.currency)}
              </span>
            )}
            {tx.currency}
          </span>
        </td>
        <td className="px-5 py-3 text-xs text-[#aaaaaa] whitespace-nowrap">
          {tx.beneficiary?.institution || '—'}
        </td>
        <td className="px-5 py-3 whitespace-nowrap">
          <StatusBadge status={tx.status} />
        </td>
        <td className="px-5 py-3 text-xs text-[#888888] max-w-xs truncate">
          {tx.note || (
            <button
              onClick={() => onEditNote(tx.id)}
              className="text-[#c9a962] hover:underline text-[10px]"
            >
              Add note
            </button>
          )}
        </td>
        <td className="px-5 py-3 text-xs whitespace-nowrap">
          {tx.insurance ? (
            <button
              onClick={() => onClaimInsurance(tx)}
              disabled={tx.insurance.status !== 'active'}
              className={cn(
                'text-[10px] px-2 py-1 border rounded transition-colors',
                tx.insurance.status === 'active'
                  ? 'border-[#4ade80] text-[#4ade80] hover:bg-[#4ade80]/10'
                  : 'border-[#555555] text-[#555555] opacity-50 cursor-not-allowed',
              )}
            >
              {tx.insurance.status === 'active' ? 'File Claim' : tx.insurance.status}
            </button>
          ) : (
            <span className="text-[#555555]">—</span>
          )}
        </td>
      </tr>
    );
  },
  (prev, next) => {
    // Memoization: only re-render if transaction data changed
    return prev.tx === next.tx && prev.isFocused === next.isFocused && prev.index === next.index;
  },
);

// ---------------------------------------------------------------------------
// Virtualized Table Component
// ---------------------------------------------------------------------------

export interface VirtualizedTransactionTableProps {
  transactions: Transaction[];
  isLoading?: boolean;
  onEditNote: (txId: string) => void;
  onClaimInsurance: (tx: Transaction) => void;
  maxHeight?: number;
}

const VirtualizedTransactionTable = memo(function VirtualizedTransactionTable({
  transactions,
  isLoading = false,
  onEditNote,
  onClaimInsurance,
  maxHeight = 600,
}: VirtualizedTransactionTableProps) {
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  const renderRow = useCallback(
    (tx: Transaction, index: number, isFocused: boolean) => (
      <table className="w-full min-w-[800px] table-fixed" role="presentation">
        <tbody>
          <TableRow
            tx={tx}
            index={index}
            isFocused={isFocused}
            onEditNote={onEditNote}
            onClaimInsurance={onClaimInsurance}
          />
        </tbody>
      </table>
    ),
    [onEditNote, onClaimInsurance],
  );

  if (isLoading) {
    return (
      <div className="border border-[#333333] bg-[#111111] overflow-x-auto">
        <table className="w-full min-w-[800px] border-collapse" aria-label="Loading transactions">
          <thead>
            <tr className="bg-[#c9a962]">
              {['DATE', 'TX HASH', 'AMOUNT', 'CURRENCY', 'BANK', 'STATUS', 'NOTE', 'INSURANCE'].map(
                (col) => (
                  <th
                    key={col}
                    scope="col"
                    className="px-5 py-2.5 text-left text-[10px] tracking-[0.18em] font-semibold text-[#0a0a0a] uppercase whitespace-nowrap"
                  >
                    {col}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, i) => (
              <RowSkeleton key={i} />
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="border border-[#333333] bg-[#111111] p-12 text-center">
        <p className="text-sm text-[#777777]">No transactions to display</p>
      </div>
    );
  }

  return (
    <div className="border border-[#333333] bg-[#111111] overflow-x-auto">
      {/* Header */}
      <table
        className="w-full min-w-[800px] border-collapse"
        aria-label="Transaction history table header"
      >
        <thead>
          <tr className="bg-[#c9a962] sticky top-0 z-10">
            {['DATE', 'TX HASH', 'AMOUNT', 'CURRENCY', 'BANK', 'STATUS', 'NOTE', 'INSURANCE'].map(
              (col) => (
                <th
                  key={col}
                  scope="col"
                  className="px-5 py-2.5 text-left text-[10px] tracking-[0.18em] font-semibold text-[#0a0a0a] uppercase whitespace-nowrap"
                >
                  {col}
                </th>
              ),
            )}
          </tr>
        </thead>
      </table>

      {/* Virtualized body */}
      <VirtualList
        items={transactions}
        itemHeight={56} // Approximate row height with padding
        containerHeight={Math.min(transactions.length * 56, maxHeight)}
        renderItem={renderRow}
        className="min-w-[800px]"
        onFocusChange={setFocusedIndex}
        role="presentation"
        ariaLabel="Virtualized transaction rows"
      />
    </div>
  );
});

export default VirtualizedTransactionTable;
