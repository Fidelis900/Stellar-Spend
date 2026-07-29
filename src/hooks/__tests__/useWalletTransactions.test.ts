import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWalletTransactions } from '../useWalletTransactions';
import type { Transaction } from '@/lib/transaction-storage';

const mockTransactions: Transaction[] = [
  {
    id: 'tx-1',
    timestamp: Date.now(),
    userAddress: 'GCFX...1234',
    amount: '100',
    currency: 'NGN',
    status: 'completed',
    beneficiary: {
      institution: 'GTBank',
      accountIdentifier: '0123456789',
      accountName: 'John Doe',
      currency: 'NGN',
    },
  },
];

vi.mock('@/lib/transaction-storage', () => ({
  TransactionStorage: {
    getByUser: vi.fn((publicKey: string) =>
      publicKey === 'GCFX...1234' ? mockTransactions : [],
    ),
  },
}));

describe('useWalletTransactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty array when publicKey is undefined', () => {
    const { result } = renderHook(() => useWalletTransactions(undefined));
    expect(result.current.transactions).toHaveLength(0);
  });

  it('should load transactions for a given publicKey on mount', async () => {
    const { result } = renderHook(() => useWalletTransactions('GCFX...1234'));

    // Wait for useTransition to flush
    await act(async () => { await Promise.resolve(); });

    expect(result.current.transactions).toHaveLength(1);
    expect(result.current.transactions[0].id).toBe('tx-1');
  });

  it('should return empty array for an unknown publicKey', async () => {
    const { result } = renderHook(() => useWalletTransactions('UNKNOWN'));

    await act(async () => { await Promise.resolve(); });

    expect(result.current.transactions).toHaveLength(0);
  });

  it('should clear transactions when publicKey changes to undefined', async () => {
    const { result, rerender } = renderHook(
      ({ pk }: { pk: string | undefined }) => useWalletTransactions(pk),
      { initialProps: { pk: 'GCFX...1234' as string | undefined } },
    );

    await act(async () => { await Promise.resolve(); });
    expect(result.current.transactions).toHaveLength(1);

    rerender({ pk: undefined });

    await act(async () => { await Promise.resolve(); });
    expect(result.current.transactions).toHaveLength(0);
  });

  it('should expose a reload function that re-fetches transactions', async () => {
    const { TransactionStorage } = await import('@/lib/transaction-storage');
    const spy = vi.spyOn(TransactionStorage, 'getByUser');

    const { result } = renderHook(() => useWalletTransactions('GCFX...1234'));

    await act(async () => { await Promise.resolve(); });
    const callsBefore = spy.mock.calls.length;

    act(() => { result.current.reload(); });

    await act(async () => { await Promise.resolve(); });
    expect(spy.mock.calls.length).toBeGreaterThan(callsBefore);
  });
});
