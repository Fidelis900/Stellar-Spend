"use client";

import { cn } from "@/lib/cn";

interface ConnectWalletPromptProps {
  onConnect: () => void;
}

/** Empty state shown when no wallet is connected. */
export function ConnectWalletPrompt({ onConnect }: ConnectWalletPromptProps) {
  return (
    <div className="border border-[#333333] bg-[#111111] p-12 text-center">
      <p className="text-sm text-[#777777] mb-4">
        Please connect your wallet to view transaction history
      </p>
      <button
        onClick={onConnect}
        className={cn(
          "px-6 py-3 min-h-[44px] text-xs tracking-widest border border-[#c9a962]",
          "text-[#c9a962] bg-transparent transition-colors duration-150",
          "hover:bg-[#c9a962] hover:text-[#0a0a0a]",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a962]",
        )}
      >
        CONNECT WALLET
      </button>
    </div>
  );
}
