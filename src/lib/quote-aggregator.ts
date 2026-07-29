import { fetchPaycrestQuote, buildQuote, type QuoteResult } from './offramp/utils/quote-fetcher';
import { providerRegistry } from './offramp/adapters/provider-registry';
import { getCacheClient } from './cache';

export interface ProviderQuote extends QuoteResult {
  provider: string;
  success: boolean;
  error?: string;
  responseTime?: number;
  reliability?: number;
  netPayout?: number;
}

export interface AggregatedQuoteResponse {
  bestQuote: ProviderQuote | null;
  allQuotes: ProviderQuote[];
  alternatives: ProviderQuote[];
  timestamp: string;
  totalProviders: number;
  successfulProviders: number;
  degradedProviders: string[];
}

export type QuoteProvider = 'paycrest' | 'allbridge';

interface ProviderConfig {
  name: string;
  enabled: boolean;
  priority: number;
  timeout: number;
  weight: number;
  reliabilityHistory: number[];
  maxRetries: number;
}

const PROVIDER_CONFIGS: Record<QuoteProvider, ProviderConfig> = {
  paycrest: {
    name: 'Paycrest',
    enabled: true,
    priority: 1,
    timeout: 5000,
    weight: 1.0,
    reliabilityHistory: [],
    maxRetries: 1,
  },
  allbridge: {
    name: 'Allbridge',
    enabled: false,
    priority: 2,
    timeout: 5000,
    weight: 1.0,
    reliabilityHistory: [],
    maxRetries: 1,
  },
};

const RELIABILITY_WINDOW = 50;
const DEGRADED_THRESHOLD = 0.5;
const CACHE_TTL_SECONDS = 30;

function calculateReliability(history: number[]): number {
  if (history.length === 0) return 1.0;
  const successes = history.filter((r) => r === 1).length;
  return successes / history.length;
}

function recordReliability(provider: QuoteProvider, success: boolean): void {
  const config = PROVIDER_CONFIGS[provider];
  config.reliabilityHistory.push(success ? 1 : 0);
  if (config.reliabilityHistory.length > RELIABILITY_WINDOW) {
    config.reliabilityHistory.shift();
  }
}

function isProviderDegraded(provider: QuoteProvider): boolean {
  const config = PROVIDER_CONFIGS[provider];
  return calculateReliability(config.reliabilityHistory) < DEGRADED_THRESHOLD;
}

async function fetchQuoteFromPaycrest(
  receiveAmount: string,
  currency: string,
): Promise<ProviderQuote> {
  const start = Date.now();
  try {
    const { rate, destinationAmount } = await fetchPaycrestQuote(receiveAmount, currency);
    const quote = buildQuote(destinationAmount, rate, currency, '0', '0', 300);

    const result: ProviderQuote = {
      ...quote,
      provider: 'paycrest',
      success: true,
      responseTime: Date.now() - start,
      reliability: calculateReliability(PROVIDER_CONFIGS.paycrest.reliabilityHistory),
      netPayout: parseFloat(destinationAmount),
    };

    recordReliability('paycrest', true);
    return result;
  } catch (error) {
    recordReliability('paycrest', false);
    return {
      destinationAmount: '0',
      rate: 0,
      currency,
      bridgeFee: '0',
      payoutFee: '0',
      estimatedTime: 0,
      provider: 'paycrest',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      responseTime: Date.now() - start,
      reliability: calculateReliability(PROVIDER_CONFIGS.paycrest.reliabilityHistory),
      netPayout: 0,
    };
  }
}

async function fetchQuoteFromAllbridge(
  receiveAmount: string,
  currency: string,
): Promise<ProviderQuote> {
  const start = Date.now();
  try {
    const { initializeAllbridgeSdk, getAllbridgeTokens, getAllbridgeQuote } = await import(
      './offramp/adapters/allbridge-adapter'
    );

    const sdk = initializeAllbridgeSdk();
    const tokens = await getAllbridgeTokens(sdk);
    const quote = await getAllbridgeQuote(
      sdk,
      tokens.stellar.usdc,
      tokens.base.usdc,
      receiveAmount,
    );

    const bridgeFee = parseFloat(quote.receiveAmount) * 0.005;
    const payoutFee = 0;
    const netPayout = parseFloat(quote.receiveAmount) - bridgeFee;
    const rate = parseFloat(quote.receiveAmount) / parseFloat(receiveAmount);

    const result: ProviderQuote = {
      destinationAmount: netPayout.toFixed(6),
      rate,
      currency,
      bridgeFee: bridgeFee.toFixed(6),
      payoutFee: payoutFee.toFixed(6),
      estimatedTime: quote.estimatedTime,
      provider: 'allbridge',
      success: true,
      responseTime: Date.now() - start,
      reliability: calculateReliability(PROVIDER_CONFIGS.allbridge.reliabilityHistory),
      netPayout,
    };

    recordReliability('allbridge', true);
    return result;
  } catch (error) {
    recordReliability('allbridge', false);
    return {
      destinationAmount: '0',
      rate: 0,
      currency,
      bridgeFee: '0',
      payoutFee: '0',
      estimatedTime: 0,
      provider: 'allbridge',
      success: false,
      error: error instanceof Error ? error.message : 'Provider not available',
      responseTime: Date.now() - start,
      reliability: calculateReliability(PROVIDER_CONFIGS.allbridge.reliabilityHistory),
      netPayout: 0,
    };
  }
}

export function rankQuotes(quotes: ProviderQuote[]): ProviderQuote[] {
  const successfulQuotes = quotes.filter((q) => q.success);

  if (successfulQuotes.length === 0) {
    return quotes;
  }

  return successfulQuotes.sort((a, b) => {
    const netA = a.netPayout ?? parseFloat(a.destinationAmount);
    const netB = b.netPayout ?? parseFloat(b.destinationAmount);

    if (netB !== netA) {
      return netB - netA;
    }

    const relA = a.reliability ?? 1.0;
    const relB = b.reliability ?? 1.0;
    if (relB !== relA) {
      return relB - relA;
    }

    return (a.responseTime || 0) - (b.responseTime || 0);
  });
}

export function selectBestQuote(quotes: ProviderQuote[]): ProviderQuote | null {
  const successful = quotes.filter((q) => q.success);
  if (successful.length === 0) return null;
  const ranked = rankQuotes(quotes);
  return ranked.length > 0 ? ranked[0] : null;
}

function getDegradedProviders(): string[] {
  return (Object.keys(PROVIDER_CONFIGS) as QuoteProvider[]).filter(
    (p) => PROVIDER_CONFIGS[p].enabled && isProviderDegraded(p),
  );
}

export async function aggregateQuotes(
  receiveAmount: string,
  currency: string,
  providers: QuoteProvider[] = ['paycrest'],
): Promise<AggregatedQuoteResponse> {
  const enabledProviders = providers.filter((p) => PROVIDER_CONFIGS[p].enabled);

  if (enabledProviders.length === 0) {
    throw new Error('No enabled providers available');
  }

  const cacheKey = `quote:aggregate:${currency}:${receiveAmount}`;
  const cacheClient = getCacheClient();
  const cached = await cacheClient.get(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached) as AggregatedQuoteResponse;
    } catch {
      // ignore cache parse errors
    }
  }

  const quotePromises = enabledProviders.map(async (provider) => {
    const config = PROVIDER_CONFIGS[provider];

    const fetchWithRetry = async (retriesLeft: number): Promise<ProviderQuote> => {
      try {
        const timeoutPromise = new Promise<ProviderQuote>((_, reject) =>
          setTimeout(() => reject(new Error('Provider timeout')), config.timeout),
        );

        let fetchPromise: Promise<ProviderQuote>;
        if (provider === 'paycrest') {
          fetchPromise = fetchQuoteFromPaycrest(receiveAmount, currency);
        } else if (provider === 'allbridge') {
          fetchPromise = fetchQuoteFromAllbridge(receiveAmount, currency);
        } else {
          throw new Error(`Unknown provider: ${provider}`);
        }

        return await Promise.race([fetchPromise, timeoutPromise]);
      } catch (error) {
        if (retriesLeft > 0) {
          return fetchWithRetry(retriesLeft - 1);
        }
        return {
          destinationAmount: '0',
          rate: 0,
          currency,
          bridgeFee: '0',
          payoutFee: '0',
          estimatedTime: 0,
          provider,
          success: false,
          error: error instanceof Error ? error.message : 'Provider failed',
          responseTime: config.timeout,
          reliability: calculateReliability(config.reliabilityHistory),
          netPayout: 0,
        };
      }
    };

    return fetchWithRetry(config.maxRetries);
  });

  const allQuotes = await Promise.all(quotePromises);
  const bestQuote = selectBestQuote(allQuotes);

  const successful = allQuotes.filter((q) => q.success);
  const alternatives = allQuotes
    .filter((q) => q.success && q.provider !== bestQuote?.provider)
    .sort((a, b) => (b.netPayout ?? 0) - (a.netPayout ?? 0));

  const result: AggregatedQuoteResponse = {
    bestQuote,
    allQuotes,
    alternatives,
    timestamp: new Date().toISOString(),
    totalProviders: enabledProviders.length,
    successfulProviders: successful.length,
    degradedProviders: getDegradedProviders(),
  };

  await cacheClient.set(cacheKey, JSON.stringify(result), CACHE_TTL_SECONDS);

  return result;
}

export function getProviderStatus(): Record<QuoteProvider, ProviderConfig> {
  return PROVIDER_CONFIGS;
}

export function resetReliabilityHistory(): void {
  for (const config of Object.values(PROVIDER_CONFIGS)) {
    config.reliabilityHistory = [];
  }
}
