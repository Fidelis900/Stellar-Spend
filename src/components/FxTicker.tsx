'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import type { FxRate } from '@/app/api/fx-rates/route';

const REFRESH_INTERVAL = 30_000; // 30 s

type Direction = 'up' | 'down' | 'neutral';

interface RateWithDir extends FxRate {
  dir: Direction;
}

function formatRate(rate: number): string {
  return rate >= 100
    ? rate.toLocaleString('en-US', { maximumFractionDigits: 0 })
    : rate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

const ARROW: Record<Direction, string> = { up: '▲', down: '▼', neutral: '' };
const ARROW_COLOR: Record<Direction, string> = {
  up: 'text-green-400',
  down: 'text-red-400',
  neutral: '',
};

export default function FxTicker() {
  const [rates, setRates] = useState<RateWithDir[]>([]);
  const [error, setError] = useState(false);
  const prevRef = useRef<Map<string, number>>(new Map());

  const fetchRates = async () => {
    try {
      const res = await fetch('/api/fx-rates');
      if (!res.ok) throw new Error('bad response');
      const data: { rates: FxRate[] } = await res.json();

      setRates(
        data.rates.map(({ currency, rate }) => {
          const prev = prevRef.current.get(currency);
          const dir: Direction =
            prev === undefined || prev === rate ? 'neutral' : rate > prev ? 'up' : 'down';
          prevRef.current.set(currency, rate);
          return { currency, rate, dir };
        }),
      );
      setError(false);
    } catch {
      setError(true);
    }
  };

  useEffect(() => {
    fetchRates();
    const id = setInterval(fetchRates, REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, []);

  if (error) {
    return (
      <span className="text-[10px] text-[#555555] tracking-widest uppercase">
        rates unavailable
      </span>
    );
  }

  if (rates.length === 0) {
    return (
      <span className="text-[10px] text-[#555555] tracking-widest animate-pulse">
        loading rates…
      </span>
    );
  }

  return (
    <div
      className="flex items-center gap-4 overflow-x-auto scrollbar-none"
      aria-label="Live FX rates: 1 USDC ="
      role="marquee"
    >
      {rates.map(({ currency, rate, dir }) => (
        <span
          key={currency}
          className="flex items-center gap-1 whitespace-nowrap text-[10px] tracking-widest"
        >
          <span className="text-[#777777] uppercase">{currency}</span>
          <span className="text-white tabular-nums">{formatRate(rate)}</span>
          {dir !== 'neutral' && (
            <span className={cn('text-[9px]', ARROW_COLOR[dir])} aria-hidden>
              {ARROW[dir]}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}
