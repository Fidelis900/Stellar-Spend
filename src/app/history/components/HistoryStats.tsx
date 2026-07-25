"use client";

import { useMemo } from "react";
import type { Transaction } from "@/lib/transaction-storage";
import { formatUsdc } from "../format";

interface HistoryStatsProps {
  transactions: Transaction[];
}

const ACTIVE_COVERAGE_STATUSES = ["pending", "active", "claimed", "claim_approved"];

/** Insurance summary tiles shown above the history table. */
export function HistoryStats({ transactions }: HistoryStatsProps) {
  const { insuredCount, activeCoverage, claimsFiled } = useMemo(() => {
    const insured = transactions.filter((tx) => tx.insurance);
    return {
      insuredCount: insured.length,
      activeCoverage: insured.reduce(
        (sum, tx) =>
          tx.insurance && ACTIVE_COVERAGE_STATUSES.includes(tx.insurance.status)
            ? sum + tx.insurance.coverage
            : sum,
        0,
      ),
      claimsFiled: insured.filter((tx) => tx.insurance?.claimId).length,
    };
  }, [transactions]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
      <div className="border border-[#333333] bg-[#111111] p-4">
        <p className="text-[10px] tracking-widest uppercase text-[#777777]">Insured Transactions</p>
        <p className="mt-2 text-2xl font-semibold text-white tabular-nums">{insuredCount}</p>
      </div>
      <div className="border border-[#333333] bg-[#111111] p-4">
        <p className="text-[10px] tracking-widest uppercase text-[#777777]">Active Coverage</p>
        <p className="mt-2 text-2xl font-semibold text-[#4ade80] tabular-nums">
          {formatUsdc(activeCoverage)} USDC
        </p>
      </div>
      <div className="border border-[#333333] bg-[#111111] p-4">
        <p className="text-[10px] tracking-widest uppercase text-[#777777]">Claims Filed</p>
        <p className="mt-2 text-2xl font-semibold text-[#c9a962] tabular-nums">{claimsFiled}</p>
      </div>
    </div>
  );
}
