import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HistoryStats } from "../HistoryStats";
import type { Transaction } from "@/lib/transaction-storage";

const tx = (o: Partial<Transaction> = {}): Transaction => ({
  id: Math.random().toString(),
  timestamp: 1,
  userAddress: "G",
  amount: "1",
  currency: "NGN",
  beneficiary: { institution: "B", accountIdentifier: "1", accountName: "A", currency: "NGN" },
  status: "completed",
  ...o,
});

const insurance = (o = {}) => ({
  premium: 1,
  coverage: 100,
  provider: "P",
  riskScore: 1,
  status: "active" as const,
  purchasedAt: 0,
  ...o,
});

describe("HistoryStats", () => {
  it("renders zeros when there are no insured transactions", () => {
    render(<HistoryStats transactions={[tx()]} />);
    expect(screen.getByText("Insured Transactions").nextElementSibling).toHaveTextContent("0");
  });

  it("sums active coverage and counts insured + claims", () => {
    render(
      <HistoryStats
        transactions={[
          tx({ insurance: insurance({ coverage: 100, status: "active" }) }),
          tx({ insurance: insurance({ coverage: 50, status: "claimed", claimId: "C1" }) }),
          tx({ insurance: insurance({ coverage: 999, status: "claim_rejected" }) }),
        ]}
      />,
    );
    expect(screen.getByText("Insured Transactions").nextElementSibling).toHaveTextContent("3");
    // active + claimed count toward coverage; rejected does not -> 150
    expect(screen.getByText("Active Coverage").nextElementSibling).toHaveTextContent("150.00 USDC");
    expect(screen.getByText("Claims Filed").nextElementSibling).toHaveTextContent("1");
  });
});
