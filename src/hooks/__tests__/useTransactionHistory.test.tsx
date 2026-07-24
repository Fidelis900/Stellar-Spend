import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useTransactionHistory } from "../useTransactionHistory";
import type { Transaction } from "@/lib/transaction-storage";

vi.mock("@/lib/transaction-storage", () => ({
  TransactionStorage: {
    getByUser: vi.fn(() => []),
    applyOptimistic: vi.fn(() => vi.fn()),
    update: vi.fn(),
  },
}));

import { TransactionStorage } from "@/lib/transaction-storage";

const tx = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: "tx-1",
  timestamp: 1,
  userAddress: "GABC",
  amount: "10",
  currency: "NGN",
  beneficiary: { institution: "Bank", accountIdentifier: "1", accountName: "A", currency: "NGN" },
  status: "completed",
  ...overrides,
});

describe("useTransactionHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (TransactionStorage.getByUser as ReturnType<typeof vi.fn>).mockReturnValue([]);
    (TransactionStorage.applyOptimistic as ReturnType<typeof vi.fn>).mockReturnValue(vi.fn());
  });

  afterEach(() => vi.restoreAllMocks());

  it("returns empty state when no wallet address is provided", () => {
    const { result } = renderHook(() => useTransactionHistory(undefined));
    expect(result.current.transactions).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("fetches and merges API + local transactions (dedup by id)", async () => {
    const apiTx = tx({ id: "tx-1" });
    const localTx = tx({ id: "tx-2" });
    (TransactionStorage.getByUser as ReturnType<typeof vi.fn>).mockReturnValue([localTx]);
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [apiTx] });

    const { result } = renderHook(() => useTransactionHistory("GABC"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.transactions.map((t) => t.id).sort()).toEqual(["tx-1", "tx-2"]);
    expect(result.current.error).toBeNull();
  });

  it("falls back to local storage and surfaces an error when the fetch fails", async () => {
    (TransactionStorage.getByUser as ReturnType<typeof vi.fn>).mockReturnValue([]);
    global.fetch = vi.fn().mockRejectedValue(new Error("network down"));

    const { result } = renderHook(() => useTransactionHistory("GABC"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBe("network down");
    expect(result.current.transactions).toEqual([]);
  });

  it("suppresses the error when cached transactions are available", async () => {
    (TransactionStorage.getByUser as ReturnType<typeof vi.fn>).mockReturnValue([tx()]);
    global.fetch = vi.fn().mockRejectedValue(new Error("network down"));

    const { result } = renderHook(() => useTransactionHistory("GABC"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBeNull();
    expect(result.current.transactions).toHaveLength(1);
  });

  it("saveNote applies optimistically and resolves null on success", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [tx()] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    const { result } = renderHook(() => useTransactionHistory("GABC"));
    await waitFor(() => expect(result.current.transactions).toHaveLength(1));

    let outcome: string | null = "unset";
    await act(async () => {
      outcome = await result.current.saveNote("tx-1", "hello");
    });

    expect(outcome).toBeNull();
    expect(result.current.transactions[0].note).toBe("hello");
    expect(TransactionStorage.applyOptimistic).toHaveBeenCalledWith("tx-1", { note: "hello" });
  });

  it("saveNote rolls back and returns an error message on failure", async () => {
    const rollback = vi.fn();
    (TransactionStorage.applyOptimistic as ReturnType<typeof vi.fn>).mockReturnValue(rollback);
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [tx({ note: "old" })] })
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: "boom" }) });

    const { result } = renderHook(() => useTransactionHistory("GABC"));
    await waitFor(() => expect(result.current.transactions).toHaveLength(1));

    let outcome: string | null = null;
    await act(async () => {
      outcome = await result.current.saveNote("tx-1", "new");
    });

    expect(outcome).toBe("boom");
    expect(rollback).toHaveBeenCalled();
    expect(result.current.transactions[0].note).toBe("old");
  });

  it("updateTransaction patches state and persists to storage", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [tx()] });
    const { result } = renderHook(() => useTransactionHistory("GABC"));
    await waitFor(() => expect(result.current.transactions).toHaveLength(1));

    act(() => result.current.updateTransaction("tx-1", { note: "patched" }));

    expect(result.current.transactions[0].note).toBe("patched");
    expect(TransactionStorage.update).toHaveBeenCalledWith("tx-1", { note: "patched" });
  });
});
