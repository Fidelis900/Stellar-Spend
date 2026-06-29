/**
 * Cache Warming
 * 
 * Pre-populate cache with popular corridors to improve hit rate.
 * Run on server startup or via scheduled cron.
 */

import { cache } from './index';
import { CACHE_KEYS, generateCacheKey, HOT_CORRIDORS } from './keys';

/**
 * Warm quote cache for popular corridors
 */
export async function warmQuoteCache(): Promise<void> {
  console.log('[Cache Warming] Starting quote cache warming...');

  const results = await Promise.allSettled(
    HOT_CORRIDORS.map(async ({ currency, amount }) => {
      try {
        // Mock quote fetch - replace with actual API call
        const quote = {
          destinationAmount: (parseFloat(amount) * 1500).toString(),
          rate: 1500,
          currency,
          bridgeFee: '0.5',
          payoutFee: '2.0',
          estimatedTime: 300,
        };

        const key = generateCacheKey(CACHE_KEYS.QUOTE, amount, currency, 'USDC');
        await cache.set(key, quote, CACHE_KEYS.QUOTE);
        console.log(`[Cache Warming] Warmed quote: ${currency} ${amount}`);
      } catch (error) {
        console.error(`[Cache Warming] Failed to warm ${currency} ${amount}:`, error);
      }
    })
  );

  const succeeded = results.filter((r) => r.status === 'fulfilled').length;
  console.log(`[Cache Warming] Completed: ${succeeded}/${HOT_CORRIDORS.length} corridors warmed`);
}

/**
 * Warm currencies cache
 */
export async function warmCurrenciesCache(): Promise<void> {
  console.log('[Cache Warming] Warming currencies cache...');

  try {
    // Mock currency list - replace with actual API call
    const currencies = [
      { code: 'NGN', name: 'Nigerian Naira', symbol: '₦' },
      { code: 'USD', name: 'US Dollar', symbol: '$' },
      { code: 'EUR', name: 'Euro', symbol: '€' },
      { code: 'GBP', name: 'British Pound', symbol: '£' },
    ];

    const key = generateCacheKey(CACHE_KEYS.CURRENCIES);
    await cache.set(key, currencies, CACHE_KEYS.CURRENCIES);
    console.log('[Cache Warming] Currencies cache warmed');
  } catch (error) {
    console.error('[Cache Warming] Failed to warm currencies:', error);
  }
}

/**
 * Warm all enabled caches
 */
export async function warmAllCaches(): Promise<void> {
  console.log('[Cache Warming] Starting cache warming process...');
  const start = Date.now();

  await Promise.allSettled([warmQuoteCache(), warmCurrenciesCache()]);

  const duration = Date.now() - start;
  console.log(`[Cache Warming] Completed in ${duration}ms`);
}
