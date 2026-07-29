'use client';

import { useEffect, useRef, useState } from 'react';

const INTERVAL = 30_000;
export const QUOTE_TTL_SECONDS = INTERVAL / 1_000; // 30

export function useFxRate() {
  const [rate, setRate] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);
  const [secondsUntilRefresh, setSecondsUntilRefresh] = useState(QUOTE_TTL_SECONDS);
  const [isStale, setIsStale] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function resetCountdown() {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setSecondsUntilRefresh(QUOTE_TTL_SECONDS);
    setIsStale(false);
    countdownRef.current = setInterval(() => {
      setSecondsUntilRefresh((prev) => {
        if (prev <= 1) {
          setIsStale(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1_000);
  }

  async function fetchRate() {
    if (document.visibilityState === 'hidden') return;
    try {
      const res = await fetch('/api/offramp/rate', { cache: 'no-store' });
      if (!res.ok) return;
      const { rate: r } = await res.json();
      if (typeof r === 'number' && r > 0) {
        setRate(r);
        setFlash(true);
        setTimeout(() => setFlash(false), 600);
        resetCountdown();
      }
    } catch {
      // silently ignore
    }
  }

  useEffect(() => {
    fetchRate();
    resetCountdown();
    timerRef.current = setInterval(fetchRate, INTERVAL);

    function onVisibility() {
      if (document.visibilityState === 'visible') fetchRate();
    }
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      document.removeEventListener('visibilitychange', onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { rate, flash, secondsUntilRefresh, isStale };
}
