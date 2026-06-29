"use client";

import { cn } from "@/lib/cn";
import type { StellarSwapQuote } from "@/lib/services/stellar-swap.service";

interface SwapPreviewProps {
  quote: StellarSwapQuote | null;
  onConfirm: () => void;
  onClose: () => void;
  loading?: boolean;
}

export default function SwapPreview({ quote, onConfirm, onClose, loading }: SwapPreviewProps) {
  if (!quote) return null;

  const expired = Date.now() > quote.expiresAt;
  const highImpact = quote.priceImpact > 0.01;
  const secondsLeft = Math.max(0, Math.ceil((quote.expiresAt - Date.now()) / 1000));

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-md dark:border-gray-700 dark:bg-gray-900">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold">Swap Preview</h3>
        <button onClick={onClose} aria-label="Close swap preview" className="text-gray-400 hover:text-gray-600">✕</button>
      </div>

      <div className="mb-3 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">You pay</span>
          <span className="font-medium">{quote.fromAmount} {quote.fromSymbol}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">You receive</span>
          <span className="font-medium">{quote.toAmount} {quote.toSymbol}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Minimum received</span>
          <span>{quote.minAmountOut} {quote.toSymbol}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">DEX fee</span>
          <span>{(quote.fee * 100).toFixed(1)}%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Price impact</span>
          <span className={highImpact ? "text-amber-500 font-medium" : ""}>
            {(quote.priceImpact * 100).toFixed(2)}%
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Slippage tolerance</span>
          <span>{(quote.slippageTolerance * 100).toFixed(1)}%</span>
        </div>
      </div>

      {highImpact && (
        <div role="alert" className="mb-3 rounded bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
          ⚠ High price impact ({(quote.priceImpact * 100).toFixed(2)}%). You may receive less than expected.
        </div>
      )}

      {expired ? (
        <div role="alert" className="mb-3 rounded bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-400">
          Quote expired. Please get a new quote.
        </div>
      ) : (
        <p className="mb-3 text-xs text-gray-400 dark:text-gray-500" aria-live="polite">
          Quote valid for {secondsLeft}s
        </p>
      )}

      <button
        onClick={onConfirm}
        disabled={loading || expired}
        className={cn(
          "w-full rounded px-4 py-2 font-medium transition-colors",
          loading || expired
            ? "cursor-not-allowed bg-gray-300 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
            : "bg-blue-500 text-white hover:bg-blue-600",
        )}
      >
        {loading ? "Processing…" : "Confirm Swap"}
      </button>
    </div>
  );
}
