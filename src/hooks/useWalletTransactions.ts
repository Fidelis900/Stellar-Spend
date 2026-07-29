'use client';

import { useState, useEffect, useTransition } from 'react';
import { TransactionStorage, type Transaction } from '@/lib/transaction-storage';

export interface WalletTransactions {
  transactions: Transaction[];
  reload: () => void;
}

export function useWalletTransactions(publicKey: string | undefined): WalletTransactions {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [, startTransition] = useTransition();

  const reload = () => {
    startTransition(() => {
      setTransactions(publicKey ? TransactionStorage.getByUser(publicKey) : []);
    });
  };

  useEffect(() => {
    if (!publicKey) {
      startTransition(() => setTransactions([]));
      return;
    }
    startTransition(() => {
      setTransactions(TransactionStorage.getByUser(publicKey));
    });
  }, [publicKey]);

  return { transactions, reload };
}
