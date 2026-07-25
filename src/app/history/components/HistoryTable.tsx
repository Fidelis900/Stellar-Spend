"use client";

import type { Transaction } from "@/lib/transaction-storage";
import type { SortDir, SortField } from "../filters";
import { HistoryRow } from "./HistoryRow";

interface HistoryTableProps {
  rows: Transaction[];
  sortField: SortField;
  sortDir: SortDir;
  onToggleSort: (field: SortField) => void;
  onSaveNote: (id: string, note: string) => void;
  onFileClaim: (tx: Transaction) => void;
}

const headerClass =
  "px-5 py-2.5 text-left text-[10px] tracking-[0.18em] font-semibold text-[#0a0a0a] uppercase whitespace-nowrap";

/** Presentational, sortable transaction history table. */
export function HistoryTable({
  rows,
  sortField,
  sortDir,
  onToggleSort,
  onSaveNote,
  onFileClaim,
}: HistoryTableProps) {
  const SortableHeader = ({ field, label }: { field: SortField; label: string }) => (
    <th
      className={`${headerClass} cursor-pointer select-none`}
      onClick={() => onToggleSort(field)}
      aria-sort={
        sortField === field ? (sortDir === "asc" ? "ascending" : "descending") : "none"
      }
    >
      {label}
      {sortField !== field ? (
        <span className="ml-1 opacity-30">↕</span>
      ) : (
        <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>
      )}
    </th>
  );

  return (
    <div className="border border-[#333333] bg-[#111111] overflow-x-auto mt-4">
      <table className="w-full min-w-[800px] border-collapse" aria-label="Transaction history">
        <thead>
          <tr className="bg-[#c9a962]">
            <SortableHeader field="timestamp" label="DATE" />
            <th className={headerClass}>TX HASH</th>
            <SortableHeader field="amount" label="AMOUNT" />
            <th className={headerClass}>CURRENCY</th>
            <th className={headerClass}>BANK</th>
            <SortableHeader field="status" label="STATUS" />
            <th className={headerClass}>NOTE</th>
            <th className={headerClass}>INSURANCE</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((tx, i) => (
            <HistoryRow
              key={tx.id}
              tx={tx}
              index={i}
              onSaveNote={onSaveNote}
              onFileClaim={onFileClaim}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
