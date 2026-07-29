/** Cache TTL values in seconds */
export const TTL = {
  RATE: 30, // FX rates — 30 seconds
  QUOTE: 60, // Quotes — 1 minute
  CURRENCIES: 3600, // Currency list — 1 hour
  INSTITUTIONS: 3600, // Institution list — 1 hour
  TRANSACTION: 300, // Transaction status — 5 minutes
} as const;

/** Cache key builders */
export const CacheKey = {
  rate: (currency: string) => `rate:${currency.toUpperCase()}`,
  quote: (amount: string, currency: string, feeMethod: string) =>
    `quote:${currency.toUpperCase()}:${amount}:${feeMethod}`,
  currencies: () => `currencies:all`,
  institutions: (currency: string) => `institutions:${currency.toUpperCase()}`,
  transaction: (id: string) => `tx:${id}`,
} as const;
