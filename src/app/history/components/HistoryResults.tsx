"use client";

import type { Transaction } from "@/lib/transaction-storage";
import type { UseHistoryFiltersResult } from "@/hooks/useHistoryFilters";
import ExportControls from "@/components/ExportControls";
import { HistoryStats } from "./HistoryStats";
import { HistoryFilters } from "./HistoryFilters";
import { HistoryTable } from "./HistoryTable";
import { HistoryPagination } from "./HistoryPagination";

interface HistoryResultsProps {
  walletAddress?: string;
  transactions: Transaction[];
  filtered: Transaction[];
  pageRows: Transaction[];
  availableCurrencies: string[];
  filterState: UseHistoryFiltersResult;
  onSaveCurrentView: () => void;
  noteError: string | null;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onSaveNote: (id: string, note: string) => void;
  onFileClaim: (tx: Transaction) => void;
}

/** The connected-and-loaded body of the history page. */
export function HistoryResults({
  walletAddress,
  transactions,
  filtered,
  pageRows,
  availableCurrencies,
  filterState,
  onSaveCurrentView,
  noteError,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  onSaveNote,
  onFileClaim,
}: HistoryResultsProps) {
  return (
    <>
      <ExportControls transactions={transactions} walletAddress={walletAddress} />
      <HistoryStats transactions={transactions} />
      <HistoryFilters
        filters={filterState.filters}
        filterCount={filterState.filterCount}
        availableCurrencies={availableCurrencies}
        savedViews={filterState.savedViews}
        onChange={filterState.set}
        onClear={filterState.clear}
        onApplyPreset={filterState.applyPreset}
        onApplySavedView={filterState.applySavedView}
        onSaveCurrentView={onSaveCurrentView}
        onDeleteSavedView={filterState.deleteSavedView}
      />

      {noteError && (
        <div role="alert" className="mt-3 border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-400">
          {noteError}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="border border-[#333333] bg-[#111111] p-12 text-center mt-4">
          <p className="text-sm text-[#777777]">
            {transactions.length === 0
              ? "No transactions found"
              : "No transactions match the current filters"}
          </p>
        </div>
      ) : (
        <>
          <HistoryTable
            rows={pageRows}
            sortField={filterState.filters.sortField}
            sortDir={filterState.filters.sortDir}
            onToggleSort={filterState.toggleSort}
            onSaveNote={onSaveNote}
            onFileClaim={onFileClaim}
          />
          <HistoryPagination
            page={page}
            pageSize={pageSize}
            totalItems={filtered.length}
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
          />
        </>
      )}
    </>
  );
}
