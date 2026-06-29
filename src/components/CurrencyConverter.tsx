"use client";

import { useMemo, useState, useCallback } from "react";
import { cn } from "@/lib/cn";
import { useCurrencyConverter } from "@/hooks/useCurrencyConverter";
import { isSupportedStablecoin } from "@/lib/stablecoins";
import { stellarSwapService, type StellarSwapQuote } from "@/lib/services/stellar-swap.service";
import SwapPreview from "@/components/SwapPreview";

export default function CurrencyConverter({ className }: { className?: string }) {
  const {
    fromAmount, toAmount, fromCurrency, toCurrency,
    rate, fees, loading, currencies, copied,
    quoteSecondsLeft, isStale, rateUpdated,
    handleFromAmountChange, handleToAmountChange,
    setFromCurrency, setToCurrency,
    swapCurrencies, copyResult,
  } = useCurrencyConverter();

  const [swapQuote, setSwapQuote] = useState<StellarSwapQuote | null>(null);
  const [swapLoading, setSwapLoading] = useState(false);
  const [swapError, setSwapError] = useState<string | null>(null);
  const [swapConfirmed, setSwapConfirmed] = useState(false);

  const canSwapOnDex = useMemo(
    () =>
      isSupportedStablecoin(fromCurrency) &&
      isSupportedStablecoin(toCurrency) &&
      fromCurrency !== toCurrency &&
      !!fromAmount && parseFloat(fromAmount) > 0,
    [fromCurrency, toCurrency, fromAmount],
  );

  const handleGetSwapQuote = useCallback(async () => {
    if (!canSwapOnDex) return;
    setSwapLoading(true);
    setSwapError(null);
    try {
      const quote = await stellarSwapService.getQuote(fromCurrency, toCurrency, fromAmount);
      setSwapQuote(quote);
    } catch (err) {
      setSwapError(err instanceof Error ? err.message : "Failed to get swap quote");
    } finally {
      setSwapLoading(false);
    }
  }, [canSwapOnDex, fromCurrency, toCurrency, fromAmount]);

  const handleConfirmSwap = useCallback(() => {
    if (!swapQuote) return;
    // After swap the output token becomes the input for off-ramp
    handleFromAmountChange(swapQuote.toAmount);
    setFromCurrency(swapQuote.toSymbol);
    setSwapConfirmed(true);
    setSwapQuote(null);
  }, [swapQuote, handleFromAmountChange, setFromCurrency]);

  const currencyOptions = useMemo(
    () => currencies.map((curr) => <option key={curr} value={curr}>{curr}</option>),
    [currencies],
  );

  return (
    <div
      className={cn(
        "rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900",
        className,
      )}
    >
      <h2 className="mb-4 text-lg font-semibold">Currency Converter</h2>

      {swapConfirmed && (
        <div role="status" className="mb-4 rounded bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
          ✓ Swap confirmed. Continue to off-ramp with your {fromCurrency}.
        </div>
      )}

      {/* From Amount */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">From</label>
        <div className="mt-2 flex gap-2">
          <input
            type="number"
            value={fromAmount}
            onChange={(e) => handleFromAmountChange(e.target.value)}
            placeholder="0.00"
            className="flex-1 rounded border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800"
          />
          <select
            value={fromCurrency}
            onChange={(e) => setFromCurrency(e.target.value)}
            className="rounded border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800"
          >
            <option>USDC</option>
            <option>USDT</option>
          </select>
        </div>
      </div>

      {/* Swap Button */}
      <div className="mb-4 flex justify-center">
        <button
          onClick={swapCurrencies}
          className="rounded-full bg-blue-500 p-2 text-white hover:bg-blue-600"
          aria-label="Swap currencies"
        >
          ⇅
        </button>
      </div>

      {/* To Amount */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">To</label>
        <div className="mt-2 flex gap-2">
          <input
            type="number"
            value={toAmount}
            onChange={(e) => handleToAmountChange(e.target.value)}
            placeholder="0.00"
            className="flex-1 rounded border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800"
          />
          <select
            value={toCurrency}
            onChange={(e) => setToCurrency(e.target.value)}
            className="rounded border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800"
          >
            {currencyOptions}
          </select>
        </div>
      </div>

      {/* DEX Swap option (shown when swapping between supported stablecoins) */}
      {canSwapOnDex && !swapQuote && (
        <div className="mb-4">
          <button
            onClick={handleGetSwapQuote}
            disabled={swapLoading}
            className="w-full rounded border border-blue-400 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-500 dark:text-blue-400 dark:hover:bg-blue-900/20"
          >
            {swapLoading ? "Fetching quote…" : `Swap ${fromCurrency} → ${toCurrency} on Stellar DEX`}
          </button>
          {swapError && (
            <p role="alert" className="mt-2 text-xs text-red-500">{swapError}</p>
          )}
        </div>
      )}

      {/* Swap Preview */}
      {swapQuote && (
        <div className="mb-4">
          <SwapPreview
            quote={swapQuote}
            onConfirm={handleConfirmSwap}
            onClose={() => setSwapQuote(null)}
            loading={swapLoading}
          />
        </div>
      )}

      {/* Rate Info with countdown */}
      {rate && (
        <div className="mb-4 rounded bg-gray-50 p-3 text-sm dark:bg-gray-800">
          <div className="flex items-center justify-between gap-2">
            <p className="text-gray-600 dark:text-gray-400">
              1 {fromCurrency} = {rate.toFixed(2)} {toCurrency}
            </p>
            <span
              className={cn(
                "shrink-0 text-xs tabular-nums transition-colors",
                rateUpdated ? "font-medium text-green-500"
                  : isStale ? "text-amber-500"
                  : "text-gray-400 dark:text-gray-500",
              )}
              aria-live="polite"
            >
              {rateUpdated ? "Rate updated" : isStale ? "Rate expired" : `Refreshes in ${quoteSecondsLeft}s`}
            </span>
          </div>
        </div>
      )}

      {isStale && !loading && (
        <div
          role="alert"
          className="mb-4 rounded border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400"
        >
          The displayed rate has expired. A fresh rate will load automatically — wait a moment before submitting.
        </div>
      )}

      {/* Fees Breakdown */}
      <div className="mb-4 space-y-2 rounded bg-gray-50 p-3 text-sm dark:bg-gray-800">
        <p className="font-medium text-gray-700 dark:text-gray-300">Fees</p>
        <div className="flex justify-between text-gray-600 dark:text-gray-400">
          <span>Bridge Fee:</span><span>{fees.bridge}%</span>
        </div>
        <div className="flex justify-between text-gray-600 dark:text-gray-400">
          <span>Payout Fee:</span><span>{fees.payout}%</span>
        </div>
      </div>

      <button
        onClick={copyResult}
        disabled={isStale || !toAmount}
        title={isStale ? "Wait for the rate to refresh before copying" : undefined}
        className={cn(
          "w-full rounded px-4 py-2 font-medium transition-colors",
          copied ? "bg-green-500 text-white"
            : isStale ? "cursor-not-allowed bg-gray-300 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
            : "bg-blue-500 text-white hover:bg-blue-600",
        )}
      >
        {copied ? "Copied!" : "Copy Result"}
      </button>

      {loading && (
        <p className="mt-2 text-center text-sm text-gray-500">Updating rates…</p>
      )}
    </div>
  );
}
