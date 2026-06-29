import { logger } from '@/lib/logger';
import { NextResponse } from 'next/server';
<<<<<<< HEAD
import { env } from '@/lib/env';
import { ErrorHandler } from '@/lib/error-handler';
import { withPaycrestTimeout } from '@/lib/offramp/utils/timeout';
import { getActiveCurrencies, isSupportedCurrency, validateCurrencyAmount } from '@/lib/currencies';
import { getCurrencyFlag } from '@/lib/currency-flags';

export const maxDuration = 10;

interface Currency {
  code: string;
  name: string;
  symbol: string;
  flag?: string;
  minAmount?: number;
  maxAmount?: number;
}

class PaycrestAdapter {
  private apiKey: string;
  private apiUrl = 'https://api.paycrest.io/v1';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async getCurrencies(): Promise<Currency[]> {
    const response = await withPaycrestTimeout(
      fetch(`${this.apiUrl}/currencies`, {
        headers: {
          'Content-Type': 'application/json',
          'API-Key': this.apiKey,
        },
      }),
      'get_currencies'
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch currencies: ${response.status}`);
    }

    const data = await response.json();

    const currencies = Array.isArray(data)
      ? data.map((c: any) => ({
        code: c.code || c.currency || '',
        name: c.name || '',
        symbol: c.symbol || '',
      }))
      : data.currencies?.map((c: any) => ({
        code: c.code || c.currency || '',
        name: c.name || '',
        symbol: c.symbol || '',
      })) || [];

    return currencies;
  }
}

// In-memory cache for currencies (server-process level)
let cachedCurrencies: Currency[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour in-process cache

// Edge / CDN cache: 1 hour fresh + 24 hours stale-while-revalidate
const CACHE_CONTROL_HEADER = 'public, max-age=3600, stale-while-revalidate=86400';

/**
 * Merges Paycrest currencies with local config to enrich with flags and limits.
 * Filters to only active currencies from local config.
 */
function enrichCurrencies(remote: Currency[]): Currency[] {
  const active = getActiveCurrencies();
  const activeCodes = new Set(active.map((c) => c.code));

  // Start with remote currencies that are in our active list
  const enriched = remote
    .filter((c) => activeCodes.has(c.code.toUpperCase()))
    .map((c) => {
      const local = active.find((a) => a.code === c.code.toUpperCase());
      return {
        ...c,
        flag: getCurrencyFlag(c.code),
        minAmount: local?.minAmount,
        maxAmount: local?.maxAmount,
      };
    });

  // Add any active local currencies not returned by remote
  const remoteCodes = new Set(remote.map((c) => c.code.toUpperCase()));
  for (const local of active) {
    if (!remoteCodes.has(local.code)) {
      enriched.push({
        code: local.code,
        name: local.name,
        symbol: local.symbol,
        flag: getCurrencyFlag(local.code),
        minAmount: local.minAmount,
        maxAmount: local.maxAmount,
      });
    }
  }

  return enriched;
}

/**
 * GET /api/offramp/currencies
 *
 * Fetches supported fiat currencies. Tries Paycrest API first, falls back to
 * local config. Enriches with flags and amount limits.
 * Caches result for 5 minutes.
 *
 * Query params:
 *   ?validate=<code>&amount=<number> — validate a currency/amount combination
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  // Currency/amount validation endpoint
  const validateCode = searchParams.get('validate');
  if (validateCode) {
    const amountStr = searchParams.get('amount');
    if (!isSupportedCurrency(validateCode)) {
      return NextResponse.json({ valid: false, error: `Unsupported currency: ${validateCode}` });
    }
    if (amountStr) {
      const amount = parseFloat(amountStr);
      const error = validateCurrencyAmount(validateCode, amount);
      if (error) return NextResponse.json({ valid: false, error });
    }
    return NextResponse.json({ valid: true });
  }

  try {
    // Check cache
    const now = Date.now();
    if (cachedCurrencies && now - cacheTimestamp < CACHE_DURATION) {
      return NextResponse.json(
        { data: cachedCurrencies },
        { headers: { 'Cache-Control': CACHE_CONTROL_HEADER } }
      );
    }

    let currencies: Currency[];
    try {
      const paycrest = new PaycrestAdapter(env.server.PAYCREST_API_KEY);
      const remote = await paycrest.getCurrencies();
      currencies = enrichCurrencies(remote);
    } catch {
      // Fallback to local config
      currencies = getActiveCurrencies().map((c) => ({
        code: c.code,
        name: c.name,
        symbol: c.symbol,
        flag: getCurrencyFlag(c.code),
        minAmount: c.minAmount,
        maxAmount: c.maxAmount,
      }));
    }

    cachedCurrencies = currencies;
    cacheTimestamp = now;

    return NextResponse.json(
      { data: currencies },
      { headers: { 'Cache-Control': CACHE_CONTROL_HEADER } }
    );
  } catch (error) {
    logger.error('Error fetching currencies:', {}, error);
    return ErrorHandler.handle(error);
=======
import { getCached, cache } from '@/lib/cache';
import { CACHE_KEYS, generateCacheKey } from '@/lib/cache/keys';

/**
 * GET /api/offramp/currencies
 * 
 * Get supported fiat currencies with caching
 * Cached for 1 hour (rarely changes)
 */
export async function GET() {
  try {
    const cacheKey = generateCacheKey(CACHE_KEYS.CURRENCIES);

    const currencies = await getCached(cacheKey, CACHE_KEYS.CURRENCIES, async () => {
      // TODO: Fetch from Paycrest API
      // For now, return mock data
      return [
        { code: 'NGN', name: 'Nigerian Naira', symbol: '₦' },
        { code: 'USD', name: 'US Dollar', symbol: '$' },
        { code: 'EUR', name: 'Euro', symbol: '€' },
        { code: 'GBP', name: 'British Pound', symbol: '£' },
        { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh' },
        { code: 'GHS', name: 'Ghanaian Cedi', symbol: 'GH₵' },
      ];
    });

    return NextResponse.json(currencies);
  } catch (error) {
    console.error('[Currencies API] Error:', error);
    
    // Graceful degradation: return fallback currencies
    return NextResponse.json([
      { code: 'NGN', name: 'Nigerian Naira', symbol: '₦' },
      { code: 'USD', name: 'US Dollar', symbol: '$' },
    ]);
>>>>>>> de69014 (security+perf: pentest checklist, performance budgets, RSC streaming, cache tuning (#697 #698 #699 #700))
  }
}
