import { logger } from '@/lib/logger';
import { getCacheClient } from './client';
import { TTL, CacheKey } from './keys';

// ─── Metrics ──────────────────────────────────────────────────────────────────

const metrics = { hits: 0, misses: 0, staleHits: 0 };

export function getCacheMetrics() {
  return { ...metrics };
}

// ─── Generic helpers ──────────────────────────────────────────────────────────

interface CacheEntry<T> {
  value: T;
  timestamp: number;
}

async function getOrSet<T>(
  key: string,
  ttl: number,
  fetcher: () => Promise<T>,
  staleWhileRevalidate?: number,
): Promise<T> {
  const client = getCacheClient();
  const cached = await client.get(key);

  if (cached !== null) {
    try {
      const entry = JSON.parse(cached) as CacheEntry<T>;
      const age = (Date.now() - entry.timestamp) / 1000;

      // Fresh cache hit
      if (age < ttl) {
        metrics.hits++;
        return entry.value;
      }

      // Stale-while-revalidate: return stale data while revalidating in background
      if (staleWhileRevalidate && age < ttl + staleWhileRevalidate) {
        metrics.staleHits++;
        // Revalidate in background without blocking
        fetcher()
          .then((value) => {
            const newEntry: CacheEntry<T> = { value, timestamp: Date.now() };
            return client.set(key, JSON.stringify(newEntry), ttl);
          })
          .catch((err) =>
            logger.error(`[cache] Background revalidation failed for ${key}:`, {}, err),
          );
        return entry.value;
      }
    } catch {
      // Invalid cache entry, treat as miss
    }
  }

  metrics.misses++;
  const value = await fetcher();
  const entry: CacheEntry<T> = { value, timestamp: Date.now() };
  await client.set(key, JSON.stringify(entry), ttl + (staleWhileRevalidate || 0));
  return value;
}

// ─── Rate cache ───────────────────────────────────────────────────────────────

export async function getCachedRate(
  currency: string,
  fetcher: () => Promise<number>,
): Promise<number> {
  return getOrSet(CacheKey.rate(currency), TTL.RATE, fetcher, TTL.RATE);
}

export async function invalidateRate(currency: string): Promise<void> {
  await getCacheClient().del(CacheKey.rate(currency));
}

// ─── Quote cache ──────────────────────────────────────────────────────────────

export async function getCachedQuote<T>(
  amount: string,
  currency: string,
  feeMethod: string,
  fetcher: () => Promise<T>,
): Promise<T> {
  return getOrSet(CacheKey.quote(amount, currency, feeMethod), TTL.QUOTE, fetcher, TTL.QUOTE);
}

export async function invalidateQuotes(): Promise<void> {
  await getCacheClient().flushPattern('quote:*');
}

// ─── Currencies cache ─────────────────────────────────────────────────────────

export async function getCachedCurrencies<T>(fetcher: () => Promise<T>): Promise<T> {
  return getOrSet(CacheKey.currencies(), TTL.CURRENCIES, fetcher, 3600);
}

export async function invalidateCurrencies(): Promise<void> {
  await getCacheClient().del(CacheKey.currencies());
}

// ─── Institutions cache ───────────────────────────────────────────────────────

export async function getCachedInstitutions<T>(
  currency: string,
  fetcher: () => Promise<T>,
): Promise<T> {
  return getOrSet(CacheKey.institutions(currency), TTL.INSTITUTIONS, fetcher, 3600);
}

export async function invalidateInstitutions(currency?: string): Promise<void> {
  if (currency) {
    await getCacheClient().del(CacheKey.institutions(currency));
  } else {
    await getCacheClient().flushPattern('institutions:*');
  }
}

// ─── Transaction cache ────────────────────────────────────────────────────────

export async function getCachedTransaction<T>(id: string, fetcher: () => Promise<T>): Promise<T> {
  return getOrSet(CacheKey.transaction(id), TTL.TRANSACTION, fetcher, 300);
}

export async function invalidateTransaction(id: string): Promise<void> {
  await getCacheClient().del(CacheKey.transaction(id));
}

// ─── Cache warming ────────────────────────────────────────────────────────────

/**
 * Warm the cache on startup by pre-fetching commonly accessed data.
 * Call this from your app initialization code.
 */
export async function warmCache(): Promise<void> {
  const client = getCacheClient();
  const isAlive = await client.ping();
  if (!isAlive) {
    logger.warn('[cache] Cache unavailable — skipping warm-up');
    return;
  }

  logger.info('[cache] Starting cache warm-up...');

  try {
    // Warm currencies
    const { getCurrencies } = await import('../currencies');
    await getCachedCurrencies(getCurrencies);
    logger.info('[cache] Warmed: currencies');
  } catch (err) {
    logger.warn('[cache] Failed to warm currencies:', err);
  }

  try {
    // Warm NGN rate (most common) via the shared fxRateService
    const { fxRateService } = await import('../services/fx-rate.service');
    await fxRateService.getRate('NGN');
    logger.info('[cache] Warmed: NGN rate');
  } catch (err) {
    logger.warn('[cache] Failed to warm NGN rate:', err);
  }

  logger.info('[cache] Cache warm-up complete');
}
