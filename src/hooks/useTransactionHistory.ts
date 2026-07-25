"use client";

import { useCallback, useEffect, useState } from "react";
import type { Transaction } from "@/lib/transaction-storage";
import { TransactionStorage } from "@/lib/transaction-storage";

export interface UseTransactionHistoryResult {
  transactions: Transaction[];
  isLoading: boolean;
  error: string | null;
  /**
   * Optimistically save a note: updates UI + local storage immediately, persists
   * to the server, rolling both back on failure. Resolves to an error message
   * when the save fails, or `null` on success.
   */
  saveNote: (id: string, note: string) => Promise<string | null>;
  /** Patch a transaction in local state + local storage (e.g. after a claim). */
  updateTransaction: (id: string, updates: Partial<Transaction>) => void;
}

/**
 * Owns transaction-history data fetching for a wallet: loads from the API,
 * merges with locally-stored transactions, and exposes optimistic mutators.
 *
 * Fetch failures fall back to local storage so the user still sees cached data.
 */
export function useTransactionHistory(
  walletAddress?: string,
): UseTransactionHistoryResult {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!walletAddress) {
      setTransactions([]);
      setError(null);
      return;
    }

    const address = walletAddress;
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetch(`/api/transactions?wallet=${encodeURIComponent(address)}`)
      .then((res) => {
        if (!res.ok) {
          return res.json().then(
            (body) => {
              throw new Error(body?.error ?? "Failed to load transactions");
            },
            () => {
              throw new Error("Failed to load transactions");
            },
          );
        }
        return res.json() as Promise<Transaction[]>;
      })
      .then((data) => {
        if (cancelled) return;
        const localTransactions = TransactionStorage.getByUser(address);
        const merged = new Map<string, Transaction>();
        [...data, ...localTransactions].forEach((tx) => merged.set(tx.id, tx));
        setTransactions(Array.from(merged.values()));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const localTransactions = TransactionStorage.getByUser(address);
        setTransactions(localTransactions);
        setError(
          localTransactions.length > 0
            ? null
            : err instanceof Error
              ? err.message
              : "Failed to load transactions",
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [walletAddress]);

  const saveNote = useCallback(
    async (id: string, note: string): Promise<string | null> => {
      const trimmed = note.slice(0, 500);
      let previous: string | undefined;
      setTransactions((prev) => {
        previous = prev.find((tx) => tx.id === id)?.note;
        return prev.map((tx) => (tx.id === id ? { ...tx, note: trimmed } : tx));
      });
      const rollbackLocal = TransactionStorage.applyOptimistic(id, { note: trimmed });

      try {
        const res = await fetch(`/api/transactions/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note: trimmed }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error ?? `Save failed (${res.status})`);
        }
        return null;
      } catch (err) {
        setTransactions((prev) =>
          prev.map((tx) => (tx.id === id ? { ...tx, note: previous } : tx)),
        );
        rollbackLocal();
        return err instanceof Error ? err.message : "Failed to save note";
      }
    },
    [],
  );

  const updateTransaction = useCallback(
    (id: string, updates: Partial<Transaction>) => {
      setTransactions((prev) =>
        prev.map((tx) => (tx.id === id ? { ...tx, ...updates } : tx)),
      );
      TransactionStorage.update(id, updates);
    },
    [],
  );

  return { transactions, isLoading, error, saveNote, updateTransaction };
}
