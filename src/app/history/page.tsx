"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import type { Transaction } from "@/lib/transaction-storage";
import { useStellarWallet } from "@/hooks/useStellarWallet";
import { useTransactionHistory } from "@/hooks/useTransactionHistory";
import { useHistoryFilters } from "@/hooks/useHistoryFilters";
import { Header } from "@/components/Header";
import { TransactionTableSkeleton } from "@/components/skeletons";
import { InsuranceClaimForm } from "@/components/InsuranceClaimForm";
import { TransactionSearchService } from "@/lib/transaction-search";
import { applyFilters } from "./filters";
import {
  HistoryPageHeader,
  ConnectWalletPrompt,
  HistoryResults,
} from "./components";

export default function HistoryPage() {
  return (
    <Suspense fallback={<TransactionTableSkeleton rows={5} />}>
      <HistoryPageContent />
    </Suspense>
  );
}

// ---------------------------------------------------------------------------
// SortIndicator — stable module-level component so it is never recreated.
// Defined here (not inside HistoryPageContent) to prevent React from
// unmounting and remounting the element on every render.
// ---------------------------------------------------------------------------
function SortIndicator({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <span className="ml-1 opacity-30" aria-hidden="true">↕</span>;
  return (
    <span className="ml-1" aria-hidden="true">{dir === "asc" ? "↑" : "↓"}</span>
  );
}

function HistoryPageContent() {
  const { wallet, isConnected, isConnecting, connect, disconnect } = useStellarWallet();
  const { transactions, isLoading, error, saveNote, updateTransaction } =
    useTransactionHistory(wallet?.publicKey);
  const filterState = useHistoryFilters();
  const { filters } = filterState;

  const [claimingTransaction, setClaimingTransaction] = useState<Transaction | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const availableCurrencies = useMemo(() => {
    const currencies = new Set<string>();
    transactions.forEach((tx) => tx.currency && currencies.add(tx.currency));
    return Array.from(currencies).sort();
  }, [transactions]);

  const filtered = useMemo(
    () => applyFilters(transactions, filters, TransactionSearchService.search),
    [transactions, filters],
  );

  // Reset to the first page whenever the result set or page size changes.
  useEffect(() => setPage(1), [filters, pageSize, transactions.length]);

  const pageRows = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize],
  );

  const handleSaveNote = async (id: string, note: string) => {
    setNoteError(await saveNote(id, note));
  };

  const handleClaimSuccess = useCallback((claimId: string) => {
    if (!claimingTransaction?.insurance) return;
    updateTransaction(claimingTransaction.id, {
      insurance: { ...claimingTransaction.insurance, status: "claimed", claimId },
    });
    setClaimingTransaction(null);
  }, [claimingTransaction]);

  const handleSaveCurrentView = () => {
    const name = window.prompt("Name this view:");
    if (name) filterState.saveCurrentView(name);
  };

  return (
    <main className="min-h-screen p-4 bg-[#0a0a0a]">
      <Header
        subtitle="View your transaction history"
        isConnected={isConnected}
        isConnecting={isConnecting}
        walletAddress={wallet?.publicKey}
        onConnect={(walletType) => connect(walletType)}
        onDisconnect={disconnect}
      />

      <section className="border border-[#333333] px-[2.6rem] py-8 max-[1100px]:p-4 mt-6">
        <HistoryPageHeader
          isConnected={isConnected}
          shownCount={filtered.length}
          totalCount={transactions.length}
        />

        {!isConnected ? (
          <ConnectWalletPrompt onConnect={() => connect()} />
        ) : isLoading ? (
          <TransactionTableSkeleton rows={5} />
        ) : error ? (
          <div role="alert" className="border border-red-500/30 bg-red-500/10 p-6 text-center">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        ) : (
          <HistoryResults
            walletAddress={wallet?.publicKey}
            transactions={transactions}
            filtered={filtered}
            pageRows={pageRows}
            availableCurrencies={availableCurrencies}
            filterState={filterState}
            onSaveCurrentView={handleSaveCurrentView}
            noteError={noteError}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            onSaveNote={handleSaveNote}
            onFileClaim={setClaimingTransaction}
          />
        )}
      </section>

      {claimingTransaction?.insurance?.id && (
        <InsuranceClaimForm
          transactionId={claimingTransaction.id}
          insuranceId={claimingTransaction.insurance.id}
          coverage={claimingTransaction.insurance.coverage}
          onSuccess={handleClaimSuccess}
          onCancel={() => setClaimingTransaction(null)}
        />
      )}
    </main>
  );
}
