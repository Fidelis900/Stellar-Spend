"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";

interface HistoryPageHeaderProps {
  isConnected: boolean;
  shownCount: number;
  totalCount: number;
}

/** Page title, result summary, and back-to-dashboard link. */
export function HistoryPageHeader({ isConnected, shownCount, totalCount }: HistoryPageHeaderProps) {
  return (
    <div className="mb-6 flex items-center justify-between">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white tracking-wider mb-1">
          Transaction History
        </h1>
        <p className="text-xs text-[#777777] tracking-wide">
          {isConnected
            ? `Showing ${shownCount} of ${totalCount} transaction${totalCount !== 1 ? "s" : ""}`
            : "Connect your wallet to view transaction history"}
        </p>
      </div>
      <Link
        href="/"
        className={cn(
          "self-start sm:self-auto text-[10px] tracking-widest uppercase text-[#c9a962] border border-[#c9a962] px-4 py-2 min-h-[44px] flex items-center",
          "hover:bg-[#c9a962] hover:text-[#0a0a0a] transition-colors duration-150",
          "focus:outline-none focus-visible:ring-1 focus-visible:ring-[#c9a962]",
        )}
      >
        ← Back to Dashboard
      </Link>
    </div>
  );
}
