/**
 * Shared FX Rate Service (#801)
 *
 * Single source of truth for all FX rate fetching across the application.
 * Wraps the Paycrest rate API with:
 *  - In-process TTL cache (30 s)
 *  - Stale-while-revalidate: returns cached data while refreshing in the background
 *  - Provider-failure fallback to the last known good value
 *  - Multi-currency batch fetch
 *
 * Usage:
 *   import { fxRateService } from '@/lib/services';
 *
 *   const rate = await fxRateService.getRate('NGN');
 *   const rates = await fxRateService.getRates(['NGN', 'KES', 'GHS']);
 */

import { logger } from '@/lib/logger';

// ─── Config ───────────────────────────────────────────────────────────────────

const PAYCREST_RATE_BASE = 'https://api.paycrest.io/v1/rates/USDC/1';
const CACHE_TTL_MS = 30_000; // 30 s — fresh
const STALE_TTL_MS = 60_000; // 60 s — stale-while-revalidate window
const FETCH_TIMEOUT_MS = 8_000; // 8 s per individual rate fetch
const DEFAULT_CURRENCIES = ['NGN', 'KES', 'GHS', 'ZAR', 'USD'] as const;

export type SupportedCurrency = (typeof DEFAULT_CURRENCIES)[number] | string;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FxRate {
  currency: string;
  rate: number;
  /** Epoch ms when this rate was last successfully fetched from upstream */
  fetchedAt: number;
}

interface CacheEntry {
  rate: number;
  fetchedAt: number;
  /** Whether a background revalidation is already in-flight */
  revalidating: boolean;
}

// ─── FxRateService ────────────────────────────────────────────────────────────

export class FxRateService {
  private cache = new Map<string, CacheEntry>();

  /**
   * Fetch a single FX rate for the given currency.
   * Returns a cached value (possibly stale) if the upstream is unavailable.
   *
   * @throws Error only when no cached fallback is available and the upstream fails.
   */
  async getRate(currency: string): Promise<number> {
    const key = currency.toUpperCase();
    const entry = this.cache.get(key);
    const now = Date.now();

    if (entry) {
      const age = now - entry.fetchedAt;

      if (age < CACHE_TTL_MS) {
        // Fresh hit — return immediately
        return entry.rate;
      }

      if (age < CACHE_TTL_MS + STALE_TTL_MS) {
        // Stale-while-revalidate: serve stale, kick off background refresh
        if (!entry.revalidating) {
          entry.revalidating = true;
          this.fetchAndCache(key)
            .catch((err) => {
              logger.debug('fx-rate.background-revalidation-failed', { currency: key }, err);
            })
            .finally(() => {
              const e = this.cache.get(key);
              if (e) e.revalidating = false;
            });
        }
        return entry.rate;
      }
    }

    // No valid cache — must fetch
    return this.fetchAndCache(key);
  }

  /**
   * Fetch rates for multiple currencies in parallel.
   * Individual failures are swallowed (returns only successful results).
   * Falls back to the last cached value when available.
   */
  async getRates(currencies: string[] = [...DEFAULT_CURRENCIES]): Promise<FxRate[]> {
    const results = await Promise.allSettled(
      currencies.map((c) =>
        this.getRate(c).then((rate) => ({
          currency: c.toUpperCase(),
          rate,
          fetchedAt: Date.now(),
        })),
      ),
    );

    return results
      .filter((r): r is PromiseFulfilledResult<FxRate> => r.status === 'fulfilled')
      .map((r) => r.value)
      .filter((r) => r.rate > 0 && Number.isFinite(r.rate));
  }

  /**
   * Invalidate the cached rate for a given currency, forcing a fresh fetch on
   * the next call.
   */
  invalidate(currency: string): void {
    this.cache.delete(currency.toUpperCase());
  }

  /** Invalidate all cached rates. */
  invalidateAll(): void {
    this.cache.clear();
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private async fetchAndCache(currency: string): Promise<number> {
    const url = `${PAYCREST_RATE_BASE}/${currency}?network=base`;

    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);

    try {
      const res = await fetch(url, { signal: ac.signal, cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`Paycrest rate API returned ${res.status} for ${currency}`);
      }
      const data = await res.json();
      const rate = parseFloat(data.rate ?? '0');

      if (!Number.isFinite(rate) || rate <= 0) {
        throw new Error(`Invalid rate from Paycrest for ${currency}: ${data.rate}`);
      }

      const entry: CacheEntry = { rate, fetchedAt: Date.now(), revalidating: false };
      this.cache.set(currency, entry);
      logger.debug('fx-rate.fetched', { currency, rate });
      return rate;
    } catch (err) {
      // Return stale value if available rather than propagating
      const stale = this.cache.get(currency);
      if (stale) {
        logger.warn(
          'fx-rate.using-stale-fallback',
          { currency, staleAgeMs: Date.now() - stale.fetchedAt },
          err,
        );
        return stale.rate;
      }
      logger.error('fx-rate.fetch-failed', { currency }, err);
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}

/** Singleton shared across all API routes in the same server process. */
export const fxRateService = new FxRateService();
