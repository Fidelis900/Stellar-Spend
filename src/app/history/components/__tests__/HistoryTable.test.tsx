import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { HistoryTable } from "../HistoryTable";
import type { Transaction } from "@/lib/transaction-storage";

const tx = (o: Partial<Transaction> = {}): Transaction => ({
  id: "tx-1",
  timestamp: 1_700_000_000_000,
  userAddress: "G",
  amount: "42",
  currency: "NGN",
  beneficiary: { institution: "Access Bank", accountIdentifier: "1", accountName: "A", currency: "NGN" },
  status: "completed",
  ...o,
});

const setup = (rows: Transaction[], overrides = {}) => {
  const props = {
    rows,
    sortField: "timestamp" as const,
    sortDir: "desc" as const,
    onToggleSort: vi.fn(),
    onSaveNote: vi.fn(),
    onFileClaim: vi.fn(),
    ...overrides,
  };
  render(<HistoryTable {...props} />);
  return props;
};

describe("HistoryTable", () => {
  it("renders a row per transaction with amount and bank", () => {
    setup([tx()]);
    expect(screen.getByText("42 USDC")).toBeInTheDocument();
    expect(screen.getByText("Access Bank")).toBeInTheDocument();
  });

  it("calls onToggleSort when a sortable header is clicked", () => {
    const { onToggleSort } = setup([tx()]);
    fireEvent.click(screen.getByText(/AMOUNT/));
    expect(onToggleSort).toHaveBeenCalledWith("amount");
  });

  it("reflects the active sort via aria-sort", () => {
    setup([tx()], { sortField: "timestamp", sortDir: "asc" });
    const dateHeader = screen.getByText(/DATE/).closest("th");
    expect(dateHeader).toHaveAttribute("aria-sort", "ascending");
  });

  it("saves a note through the inline editor", () => {
    const { onSaveNote } = setup([tx({ note: "" })]);
    fireEvent.click(screen.getByLabelText("Add note"));
    const input = screen.getByLabelText("Edit note");
    fireEvent.change(input, { target: { value: "hello" } });
    fireEvent.click(screen.getByLabelText("Save note"));
    expect(onSaveNote).toHaveBeenCalledWith("tx-1", "hello");
  });

  it("offers a claim action only for active insurance", () => {
    const { onFileClaim } = setup([
      tx({
        insurance: {
          id: "i1",
          premium: 1,
          coverage: 100,
          provider: "P",
          riskScore: 1,
          status: "active",
          purchasedAt: 0,
        },
      }),
    ]);
    fireEvent.click(screen.getByText("File claim"));
    expect(onFileClaim).toHaveBeenCalled();
  });

  it("shows 'Not insured' for uninsured rows", () => {
    setup([tx()]);
    const row = screen.getByText("42 USDC").closest("tr")!;
    expect(within(row).getByText("Not insured")).toBeInTheDocument();
  });
});
