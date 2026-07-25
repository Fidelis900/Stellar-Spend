"use client";

import type { Transaction } from "@/lib/transaction-storage";
import { canFileClaim, formatUsdc, getInsuranceStatusLabel } from "../format";

interface InsuranceCellProps {
  tx: Transaction;
  onFileClaim: (tx: Transaction) => void;
}

/** Insurance summary cell with an optional "file claim" action. */
export function InsuranceCell({ tx, onFileClaim }: InsuranceCellProps) {
  if (!tx.insurance) {
    return <span className="text-[#555555]">Not insured</span>;
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="border border-[#c9a962]/40 bg-[#c9a962]/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-[#c9a962]">
          {getInsuranceStatusLabel(tx.insurance.status)}
        </span>
        <span className="text-[#777777]">{formatUsdc(tx.insurance.premium)} USDC premium</span>
      </div>
      <span className="text-[#4ade80]">{formatUsdc(tx.insurance.coverage)} USDC coverage</span>
      {tx.insurance.claimId && (
        <span className="font-mono text-[10px] text-[#777777]">{tx.insurance.claimId}</span>
      )}
      {canFileClaim(tx) && (
        <button
          onClick={() => onFileClaim(tx)}
          className="w-fit text-[10px] tracking-widest uppercase text-[#c9a962] hover:text-white transition-colors duration-150"
        >
          File claim
        </button>
      )}
    </div>
  );
}
