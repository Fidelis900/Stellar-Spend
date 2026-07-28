'use client';

import { useState, useEffect } from 'react';

const HORIZON_URL = 'https://horizon.stellar.org';
const USDC_ISSUER =
  process.env.NEXT_PUBLIC_STELLAR_USDC_ISSUER ||
  'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';

function fmt(value: string, fractions: { min: number; max: number }): string {
  const n = parseFloat(value);
  if (isNaN(n)) return '0.00';
  return n.toLocaleString('en-US', {
    minimumFractionDigits: fractions.min,
    maximumFractionDigits: fractions.max,
  });
}

async function fetchStellarBalances(publicKey: string): Promise<{ usdc: string; xlm: string }> {
  try {
    const res = await fetch(`${HORIZON_URL}/accounts/${publicKey}`);
    if (!res.ok) return { usdc: '0.00', xlm: '0.00' };
    const data = (await res.json()) as {
      balances: Array<{
        asset_type: string;
        asset_code?: string;
        asset_issuer?: string;
        balance: string;
      }>;
    };
    const balances = data.balances ?? [];
    const xlmEntry = balances.find((b) => b.asset_type === 'native');
    const usdcEntry = balances.find(
      (b) =>
        b.asset_type === 'credit_alphanum4' &&
        b.asset_code === 'USDC' &&
        b.asset_issuer === USDC_ISSUER,
    );
    return {
      xlm: xlmEntry ? fmt(xlmEntry.balance, { min: 2, max: 6 }) : '0.00',
      usdc: usdcEntry ? fmt(usdcEntry.balance, { min: 2, max: 6 }) : '0.00',
    };
  } catch {
    return { usdc: '0.00', xlm: '0.00' };
  }
}

export interface StellarBalances {
  usdc: string | null;
  xlm: string | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

export function useStellarBalances(publicKey: string | undefined): StellarBalances {
  const [usdc, setUsdc] = useState<string | null>(null);
  const [xlm, setXlm] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const load = async (key: string) => {
    setIsLoading(true);
    try {
      const result = await fetchStellarBalances(key);
      setUsdc(result.usdc);
      setXlm(result.xlm);
    } catch {
      setUsdc('0.00');
      setXlm('0.00');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!publicKey) {
      setUsdc(null);
      setXlm(null);
      return;
    }
    void load(publicKey);
  }, [publicKey]);

  const refresh = async () => {
    if (publicKey) await load(publicKey);
  };

  return { usdc, xlm, isLoading, refresh };
}
