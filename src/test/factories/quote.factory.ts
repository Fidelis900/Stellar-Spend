import { getDefaultRng, type Rng } from './rng';

export interface QuoteResponse {
  destinationAmount: string;
  rate: number;
  currency: string;
  bridgeFee: string;
  payoutFee: string;
  estimatedTime: number;
}

const CURRENCIES = ['NGN', 'KES', 'GHS', 'UGX'] as const;
const RATES: Record<string, number> = { NGN: 1598, KES: 130, GHS: 12, UGX: 3700 };

export function makeQuote(
  overrides: Partial<QuoteResponse> = {},
  _rng: Rng = getDefaultRng(),
): QuoteResponse {
  const currency = overrides.currency ?? 'NGN';
  const rate = overrides.rate ?? RATES[currency] ?? 1598;
  const amount = parseFloat(overrides.destinationAmount ?? '100');
  return {
    destinationAmount: (amount * rate).toFixed(2),
    rate,
    currency,
    bridgeFee: '0.50',
    payoutFee: '0.00',
    estimatedTime: 300,
    ...overrides,
  };
}

export function makeQuoteForCurrency(
  currency: (typeof CURRENCIES)[number],
  overrides: Partial<QuoteResponse> = {},
  rng?: Rng,
): QuoteResponse {
  return makeQuote({ currency, ...overrides }, rng);
}

export function makeQuotes(
  count: number,
  overrides: Partial<QuoteResponse> = {},
  rng?: Rng,
): QuoteResponse[] {
  return Array.from({ length: count }, () => makeQuote(overrides, rng));
}
