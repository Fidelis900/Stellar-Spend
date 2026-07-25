"use client";

import type { Transaction } from "@/lib/transaction-storage";
import { CopyButton } from "@/components/CopyButton";
import { StatusBadge } from "@/components/StatusBadge";
import { cn } from "@/lib/cn";
import { getCurrencyFlag } from "@/lib/currency-flags";
import { formatDate, getCurrencySymbol, truncateTxHash } from "../format";
import { NoteCell } from "./NoteCell";
import { InsuranceCell } from "./InsuranceCell";

interface HistoryRowProps {
  tx: Transaction;
  index: number;
  onSaveNote: (id: string, note: string) => void;
  onFileClaim: (tx: Transaction) => void;
}

/** A single transaction row in the history table. */
export function HistoryRow({ tx, index, onSaveNote, onFileClaim }: HistoryRowProps) {
  return (
    <tr
      className={cn(
        "border-b border-[#222222] transition-colors duration-100",
        index % 2 === 0 ? "bg-[#111111]" : "bg-[#0f0f0f]",
        "hover:bg-[#1a1a1a]",
      )}
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
            <span aria-hidden="true" className="text-base leading-none">
              {getCurrencyFlag(tx.currency)}
            </span>
          )}
          {getCurrencySymbol(tx.currency)} {tx.currency}
        </span>
      </td>
      <td className="px-5 py-3 text-xs text-[#aaaaaa] whitespace-nowrap">
        {tx.beneficiary.institution}
      </td>
      <td className="px-5 py-3 whitespace-nowrap">
        <StatusBadge status={tx.status} />
      </td>
      <td className="px-5 py-3 text-xs max-w-[200px]">
        <NoteCell tx={tx} onSave={onSaveNote} />
      </td>
      <td className="px-5 py-3 text-xs whitespace-nowrap">
        <InsuranceCell tx={tx} onFileClaim={onFileClaim} />
      </td>
    </tr>
  );
}
