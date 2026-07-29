'use client';

import { useState, useEffect, useCallback, useRef, useTransition } from 'react';
import type { FxRate } from '@/app/api/fx-rates/route';

const QUOTE_TTL = 30; // seconds

export interface CurrencyConverterState {
  fromAmount: string;
  toAmount: string;
  fromCurrency: string;
  toCurrency: string;
  rate: number | null;
  fees: { bridge: string; payout: string };
  loading: boolean;
  currencies: string[];
  copied: boolean;
  isPending: boolean;
  quoteSecondsLeft: number;
  isStale: boolean;
  rateUpdated: boolean;
  handleFromAmountChange: (value: string) => void;
  handleToAmountChange: (value: string) => void;
  setFromCurrency: (currency: string) => void;
  setToCurrency: (currency: string) => void;
  swapCurrencies: () => void;
  copyResult: () => void;
  refreshRate: () => Promise<void>;
}

export function useCurrencyConverter(): CurrencyConverterState {
  const [fromAmount, setFromAmount] = useState('100');
  const [toAmount, setToAmount] = useState('');
  const [fromCurrency, setFromCurrency] = useState('USDC');
  const [toCurrency, setToCurrency] = useState('NGN');
  const [rate, setRate] = useState<number | null>(null);
  const [fees] = useState({ bridge: '0.5', payout: '0' });
  const [loading, setLoading] = useState(false);
  const [currencies, setCurrencies] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [quoteSecondsLeft, setQuoteSecondsLeft] = useState(QUOTE_TTL);
  const [isStale, setIsStale] = useState(false);
  const [rateUpdated, setRateUpdated] = useState(false);
  const rateUpdatedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchCurrencies = useCallback(async () => {
    try {
      const res = await fetch('/api/offramp/currencies');
      if (res.ok) {
        const data = (await res.json()) as { currencies?: string[] };
        startTransition(() => setCurrencies(data.currencies ?? []));
      }
    } catch (error) {
      console.error('Failed to fetch currencies:', error);
    }
  }, []);

  const fetchRate = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/offramp/rate');
      if (res.ok) {
        const data = (await res.json()) as FxRate;
        setRate(data.rate);
        if (rateUpdatedTimer.current) clearTimeout(rateUpdatedTimer.current);
        setRateUpdated(true);
        rateUpdatedTimer.current = setTimeout(() => setRateUpdated(false), 1_500);
      }
    } catch (error) {
      console.error('Failed to fetch rate:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCurrencies();
    void fetchRate();
    const interval = setInterval(() => void fetchRate(), 30_000);
    return () => {
      clearInterval(interval);
      if (rateUpdatedTimer.current) clearTimeout(rateUpdatedTimer.current);
    };
  }, [toCurrency, fetchCurrencies, fetchRate]);

  // Restart countdown on new rate
  useEffect(() => {
    if (rate === null) return;
    setIsStale(false);
    setQuoteSecondsLeft(QUOTE_TTL);
    const id = setInterval(() => {
      setQuoteSecondsLeft((prev) => {
        if (prev <= 1) {
          setIsStale(true);
          clearInterval(id);
          return 0;
        }
        return prev - 1;
      });
    }, 1_000);
    return () => clearInterval(id);
  }, [rate]);

  const handleFromAmountChange = useCallback(
    (value: string) => {
      setFromAmount(value);
      if (rate && value) {
        const amount = parseFloat(value);
        const total = amount * rate;
        const afterFees = total - (amount * parseFloat(fees.bridge)) / 100;
        setToAmount(afterFees.toFixed(2));
      } else {
        setToAmount('');
      }
    },
    [rate, fees.bridge],
  );

  const handleToAmountChange = useCallback(
    (value: string) => {
      setToAmount(value);
      if (rate && value) {
        const amount = parseFloat(value);
        const beforeFees = amount / (1 - parseFloat(fees.bridge) / 100);
        setFromAmount((beforeFees / rate).toFixed(2));
      } else {
        setFromAmount('');
      }
    },
    [rate, fees.bridge],
  );

  const swapCurrencies = useCallback(() => {
    setFromCurrency(toCurrency);
    setToCurrency(fromCurrency);
    setFromAmount(toAmount);
    setToAmount(fromAmount);
  }, [fromCurrency, toCurrency, fromAmount, toAmount]);

  const copyResult = useCallback(() => {
    void navigator.clipboard.writeText(`${fromAmount} ${fromCurrency} = ${toAmount} ${toCurrency}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [fromAmount, fromCurrency, toAmount, toCurrency]);

  return {
    fromAmount,
    toAmount,
    fromCurrency,
    toCurrency,
    rate,
    fees,
    loading,
    currencies,
    copied,
    isPending,
    quoteSecondsLeft,
    isStale,
    rateUpdated,
    handleFromAmountChange,
    handleToAmountChange,
    setFromCurrency,
    setToCurrency,
    swapCurrencies,
    copyResult,
    refreshRate: fetchRate,
  };
}
