/**
 * Supported fiat currency configuration.
 *
 * Each entry defines the currency code, display name, symbol, decimal places,
 * minimum/maximum transaction amounts, and whether it is currently active.
 *
 * To add a new currency:
 *  1. Add an entry to SUPPORTED_CURRENCIES below.
 *  2. Ensure the currency is supported by Paycrest (check their /currencies endpoint).
 *  3. Add a flag emoji to src/lib/currency-flags.ts.
 */

export interface CurrencyConfig {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
  minAmount: number;
  maxAmount: number;
  active: boolean;
  /** ISO 3166-1 alpha-2 country code (primary) */
  country: string;
}

export const SUPPORTED_CURRENCIES: CurrencyConfig[] = [
  // Africa
  { code: 'NGN', name: 'Nigerian Naira',        symbol: '₦',  decimals: 2, minAmount: 100,    maxAmount: 10_000_000, active: true,  country: 'NG' },
  { code: 'KES', name: 'Kenyan Shilling',        symbol: 'KSh', decimals: 2, minAmount: 100,   maxAmount: 5_000_000,  active: true,  country: 'KE' },
  { code: 'GHS', name: 'Ghanaian Cedi',          symbol: 'GH₵', decimals: 2, minAmount: 10,    maxAmount: 500_000,    active: true,  country: 'GH' },
  { code: 'ZAR', name: 'South African Rand',     symbol: 'R',   decimals: 2, minAmount: 10,    maxAmount: 1_000_000,  active: true,  country: 'ZA' },
  { code: 'UGX', name: 'Ugandan Shilling',       symbol: 'USh', decimals: 0, minAmount: 1000,  maxAmount: 50_000_000, active: true,  country: 'UG' },
  { code: 'TZS', name: 'Tanzanian Shilling',     symbol: 'TSh', decimals: 0, minAmount: 1000,  maxAmount: 50_000_000, active: true,  country: 'TZ' },
  { code: 'XOF', name: 'West African CFA Franc', symbol: 'CFA', decimals: 0, minAmount: 500,   maxAmount: 10_000_000, active: true,  country: 'SN' },
  { code: 'MAD', name: 'Moroccan Dirham',        symbol: 'MAD', decimals: 2, minAmount: 10,    maxAmount: 500_000,    active: true,  country: 'MA' },
  { code: 'EGP', name: 'Egyptian Pound',         symbol: 'E£',  decimals: 2, minAmount: 10,    maxAmount: 1_000_000,  active: true,  country: 'EG' },
  { code: 'ETB', name: 'Ethiopian Birr',         symbol: 'Br',  decimals: 2, minAmount: 50,    maxAmount: 2_000_000,  active: true,  country: 'ET' },
  { code: 'RWF', name: 'Rwandan Franc',          symbol: 'RF',  decimals: 0, minAmount: 1000,  maxAmount: 20_000_000, active: true,  country: 'RW' },
  { code: 'MWK', name: 'Malawian Kwacha',        symbol: 'MK',  decimals: 2, minAmount: 1000,  maxAmount: 20_000_000, active: false, country: 'MW' },
  { code: 'ZMW', name: 'Zambian Kwacha',         symbol: 'ZK',  decimals: 2, minAmount: 10,    maxAmount: 500_000,    active: false, country: 'ZM' },
  // Americas
  { code: 'BRL', name: 'Brazilian Real',         symbol: 'R$',  decimals: 2, minAmount: 5,     maxAmount: 500_000,    active: true,  country: 'BR' },
  { code: 'MXN', name: 'Mexican Peso',           symbol: '$',   decimals: 2, minAmount: 10,    maxAmount: 1_000_000,  active: true,  country: 'MX' },
  // Asia
  { code: 'INR', name: 'Indian Rupee',           symbol: '₹',   decimals: 2, minAmount: 50,    maxAmount: 5_000_000,  active: true,  country: 'IN' },
  { code: 'PHP', name: 'Philippine Peso',        symbol: '₱',   decimals: 2, minAmount: 50,    maxAmount: 2_000_000,  active: true,  country: 'PH' },
  // Middle East / North Africa
  { code: 'AED', name: 'UAE Dirham',             symbol: 'د.إ', decimals: 2, minAmount: 5,     maxAmount: 200_000,    active: true,  country: 'AE' },
  { code: 'SAR', name: 'Saudi Riyal',            symbol: '﷼',   decimals: 2, minAmount: 5,     maxAmount: 500_000,    active: true,  country: 'SA' },
  // Asia (expanded)
  { code: 'IDR', name: 'Indonesian Rupiah',      symbol: 'Rp',  decimals: 0, minAmount: 10000, maxAmount: 500_000_000, active: true, country: 'ID' },
  { code: 'PKR', name: 'Pakistani Rupee',        symbol: '₨',   decimals: 2, minAmount: 100,   maxAmount: 5_000_000,  active: true,  country: 'PK' },
  { code: 'BDT', name: 'Bangladeshi Taka',       symbol: '৳',   decimals: 2, minAmount: 50,    maxAmount: 5_000_000,  active: true,  country: 'BD' },
  { code: 'VND', name: 'Vietnamese Dong',        symbol: '₫',   decimals: 0, minAmount: 10000, maxAmount: 500_000_000, active: true, country: 'VN' },
  { code: 'THB', name: 'Thai Baht',              symbol: '฿',   decimals: 2, minAmount: 20,    maxAmount: 1_000_000,  active: true,  country: 'TH' },
  { code: 'MYR', name: 'Malaysian Ringgit',      symbol: 'RM',  decimals: 2, minAmount: 5,     maxAmount: 200_000,    active: true,  country: 'MY' },
  // Americas (expanded)
  { code: 'COP', name: 'Colombian Peso',         symbol: '$',   decimals: 2, minAmount: 1000,  maxAmount: 100_000_000, active: true, country: 'CO' },
  { code: 'PEN', name: 'Peruvian Sol',           symbol: 'S/',  decimals: 2, minAmount: 5,     maxAmount: 200_000,    active: true,  country: 'PE' },
  { code: 'CLP', name: 'Chilean Peso',           symbol: '$',   decimals: 0, minAmount: 1000,  maxAmount: 100_000_000, active: true, country: 'CL' },
  { code: 'ARS', name: 'Argentine Peso',         symbol: '$',   decimals: 2, minAmount: 100,   maxAmount: 10_000_000, active: false, country: 'AR' },
  // Africa (expanded)
  { code: 'XAF', name: 'Central African CFA Franc', symbol: 'FCFA', decimals: 0, minAmount: 500, maxAmount: 10_000_000, active: true, country: 'CM' },
  { code: 'TND', name: 'Tunisian Dinar',         symbol: 'DT',  decimals: 3, minAmount: 5,     maxAmount: 100_000,    active: false, country: 'TN' },
];

/** Returns only active currencies */
export function getActiveCurrencies(): CurrencyConfig[] {
  return SUPPORTED_CURRENCIES.filter((c) => c.active);
}

/** Returns a currency config by code (case-insensitive), or undefined */
export function getCurrencyConfig(code: string): CurrencyConfig | undefined {
  return SUPPORTED_CURRENCIES.find((c) => c.code === code.toUpperCase());
}

/** Returns true if the currency code is supported and active */
export function isSupportedCurrency(code: string): boolean {
  const config = getCurrencyConfig(code);
  return !!config?.active;
}

/** Returns the active currency whose primary country matches the given ISO 3166-1 alpha-2 code. */
export function getDefaultCurrencyForCountry(countryCode: string): CurrencyConfig | undefined {
  const code = countryCode.toUpperCase();
  return getActiveCurrencies().find((c) => c.country === code);
}

/**
 * Validates that an amount is within the allowed range for a currency.
 * Returns an error message or null if valid.
 */
export function validateCurrencyAmount(code: string, amount: number): string | null {
  const config = getCurrencyConfig(code);
  if (!config) return `Unsupported currency: ${code}`;
  if (!config.active) return `Currency ${code} is not currently active`;
  if (amount < config.minAmount) return `Minimum amount for ${code} is ${config.minAmount}`;
  if (amount > config.maxAmount) return `Maximum amount for ${code} is ${config.maxAmount}`;
  return null;
}

export interface CurrencyInfo {
  code: string;
  name: string;
  symbol: string;
  flag?: string;
  minAmount?: number;
  maxAmount?: number;
}

/** Returns active currencies as a flat list suitable for GraphQL / REST responses */
export async function getCurrencies(): Promise<CurrencyInfo[]> {
  return getActiveCurrencies().map((c) => ({
    code: c.code,
    name: c.name,
    symbol: c.symbol,
    minAmount: c.minAmount,
    maxAmount: c.maxAmount,
  }));
}

/** Fetches institutions for a currency, checking corridor config first */
export async function getInstitutions(currency: string): Promise<Array<{ id: string; name: string; code: string }>> {
  try {
    const { getCorridorInstitutions } = await import('./corridor-config');
    const configInstitutions = getCorridorInstitutions(currency);
    if (configInstitutions.length > 0) {
      return configInstitutions;
    }
  } catch {}
  return [];
}
