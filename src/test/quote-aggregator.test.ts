import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  rankQuotes,
  selectBestQuote,
  aggregateQuotes,
  getProviderStatus,
  resetReliabilityHistory,
  type ProviderQuote,
} from '@/lib/quote-aggregator';

vi.mock('@/lib/offramp/utils/quote-fetcher', () => ({
  fetchPaycrestQuote: vi.fn(),
  buildQuote: vi.fn(),
}));

vi.mock('@/lib/offramp/adapters/provider-registry', () => ({
  providerRegistry: {
    getBridge: vi.fn(),
    getPayout: vi.fn(),
  },
}));

vi.mock('@/lib/cache', () => ({
  getCacheClient: vi.fn(() => ({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
  })),
}));

describe('rankQuotes', () => {
  it('ranks by net payout descending', () => {
    const quotes: ProviderQuote[] = [
      {
        provider: 'paycrest',
        success: true,
        destinationAmount: '100',
        rate: 1500,
        currency: 'NGN',
        bridgeFee: '0',
        payoutFee: '0',
        estimatedTime: 300,
        netPayout: 100,
        reliability: 0.95,
        responseTime: 200,
      },
      {
        provider: 'allbridge',
        success: true,
        destinationAmount: '110',
        rate: 1600,
        currency: 'NGN',
        bridgeFee: '0',
        payoutFee: '0',
        estimatedTime: 300,
        netPayout: 110,
        reliability: 0.9,
        responseTime: 300,
      },
    ];

    const ranked = rankQuotes(quotes);
    expect(ranked[0].provider).toBe('allbridge');
    expect(ranked[1].provider).toBe('paycrest');
  });

  it('uses reliability as tiebreaker when net payout is equal', () => {
    const quotes: ProviderQuote[] = [
      {
        provider: 'paycrest',
        success: true,
        destinationAmount: '100',
        rate: 1500,
        currency: 'NGN',
        bridgeFee: '0',
        payoutFee: '0',
        estimatedTime: 300,
        netPayout: 100,
        reliability: 0.95,
        responseTime: 200,
      },
      {
        provider: 'allbridge',
        success: true,
        destinationAmount: '100',
        rate: 1500,
        currency: 'NGN',
        bridgeFee: '0',
        payoutFee: '0',
        estimatedTime: 300,
        netPayout: 100,
        reliability: 0.85,
        responseTime: 150,
      },
    ];

    const ranked = rankQuotes(quotes);
    expect(ranked[0].provider).toBe('paycrest');
    expect(ranked[1].provider).toBe('allbridge');
  });

  it('uses response time as final tiebreaker', () => {
    const quotes: ProviderQuote[] = [
      {
        provider: 'paycrest',
        success: true,
        destinationAmount: '100',
        rate: 1500,
        currency: 'NGN',
        bridgeFee: '0',
        payoutFee: '0',
        estimatedTime: 300,
        netPayout: 100,
        reliability: 0.95,
        responseTime: 300,
      },
      {
        provider: 'allbridge',
        success: true,
        destinationAmount: '100',
        rate: 1500,
        currency: 'NGN',
        bridgeFee: '0',
        payoutFee: '0',
        estimatedTime: 300,
        netPayout: 100,
        reliability: 0.95,
        responseTime: 100,
      },
    ];

    const ranked = rankQuotes(quotes);
    expect(ranked[0].provider).toBe('allbridge');
    expect(ranked[1].provider).toBe('paycrest');
  });

  it('filters out failed quotes from top rankings', () => {
    const quotes: ProviderQuote[] = [
      {
        provider: 'paycrest',
        success: true,
        destinationAmount: '100',
        rate: 1500,
        currency: 'NGN',
        bridgeFee: '0',
        payoutFee: '0',
        estimatedTime: 300,
        netPayout: 100,
      },
      {
        provider: 'allbridge',
        success: false,
        destinationAmount: '0',
        rate: 0,
        currency: 'NGN',
        bridgeFee: '0',
        payoutFee: '0',
        estimatedTime: 0,
        error: 'Timeout',
        netPayout: 0,
      },
    ];

    const best = selectBestQuote(quotes);
    expect(best).not.toBeNull();
    expect(best!.provider).toBe('paycrest');
    expect(best!.success).toBe(true);
  });

  it('returns null when all quotes fail', () => {
    const quotes: ProviderQuote[] = [
      {
        provider: 'paycrest',
        success: false,
        destinationAmount: '0',
        rate: 0,
        currency: 'NGN',
        bridgeFee: '0',
        payoutFee: '0',
        estimatedTime: 0,
        error: 'Error',
        netPayout: 0,
      },
      {
        provider: 'allbridge',
        success: false,
        destinationAmount: '0',
        rate: 0,
        currency: 'NGN',
        bridgeFee: '0',
        payoutFee: '0',
        estimatedTime: 0,
        error: 'Error',
        netPayout: 0,
      },
    ];

    const best = selectBestQuote(quotes);
    expect(best).toBeNull();
  });

  it('handles missing netPayout gracefully', () => {
    const quotes: ProviderQuote[] = [
      {
        provider: 'paycrest',
        success: true,
        destinationAmount: '200',
        rate: 1500,
        currency: 'NGN',
        bridgeFee: '0',
        payoutFee: '0',
        estimatedTime: 300,
      },
      {
        provider: 'allbridge',
        success: true,
        destinationAmount: '100',
        rate: 1500,
        currency: 'NGN',
        bridgeFee: '0',
        payoutFee: '0',
        estimatedTime: 300,
      },
    ];

    const best = selectBestQuote(quotes);
    expect(best).not.toBeNull();
    expect(best!.provider).toBe('paycrest');
  });

  it('sorts alternatives correctly', () => {
    const quotes: ProviderQuote[] = [
      {
        provider: 'a',
        success: true,
        destinationAmount: '100',
        rate: 1500,
        currency: 'NGN',
        bridgeFee: '0',
        payoutFee: '0',
        estimatedTime: 300,
        netPayout: 100,
      },
      {
        provider: 'b',
        success: true,
        destinationAmount: '90',
        rate: 1500,
        currency: 'NGN',
        bridgeFee: '0',
        payoutFee: '0',
        estimatedTime: 300,
        netPayout: 90,
      },
      {
        provider: 'c',
        success: true,
        destinationAmount: '95',
        rate: 1500,
        currency: 'NGN',
        bridgeFee: '0',
        payoutFee: '0',
        estimatedTime: 300,
        netPayout: 95,
      },
    ];

    const best = selectBestQuote(quotes);
    expect(best!.provider).toBe('a');

    const alternatives = quotes
      .filter((q) => q.success && q.provider !== best!.provider)
      .sort((a, b) => (b.netPayout ?? 0) - (a.netPayout ?? 0));

    expect(alternatives[0].provider).toBe('c');
    expect(alternatives[1].provider).toBe('b');
  });

  it('falls back to destinationAmount when netPayout is undefined', () => {
    const quotes: ProviderQuote[] = [
      {
        provider: 'paycrest',
        success: true,
        destinationAmount: '150',
        rate: 1500,
        currency: 'NGN',
        bridgeFee: '0',
        payoutFee: '0',
        estimatedTime: 300,
      },
      {
        provider: 'allbridge',
        success: true,
        destinationAmount: '200',
        rate: 1500,
        currency: 'NGN',
        bridgeFee: '0',
        payoutFee: '0',
        estimatedTime: 300,
      },
    ];

    const best = selectBestQuote(quotes);
    expect(best!.provider).toBe('allbridge');
  });

  it('excludes failed quotes from ranked results when successful ones exist', () => {
    const quotes: ProviderQuote[] = [
      {
        provider: 'allbridge',
        success: true,
        destinationAmount: '100',
        rate: 1500,
        currency: 'NGN',
        bridgeFee: '0',
        payoutFee: '0',
        estimatedTime: 300,
        netPayout: 100,
      },
      {
        provider: 'paycrest',
        success: false,
        destinationAmount: '0',
        rate: 0,
        currency: 'NGN',
        bridgeFee: '0',
        payoutFee: '0',
        estimatedTime: 0,
        error: 'Timeout',
        netPayout: 0,
      },
    ];

    const ranked = rankQuotes(quotes);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].provider).toBe('allbridge');
  });

  it('handles single quote', () => {
    const quotes: ProviderQuote[] = [
      {
        provider: 'paycrest',
        success: true,
        destinationAmount: '100',
        rate: 1500,
        currency: 'NGN',
        bridgeFee: '0',
        payoutFee: '0',
        estimatedTime: 300,
      },
    ];

    const best = selectBestQuote(quotes);
    expect(best!.provider).toBe('paycrest');
  });

  it('defaults reliability to 1.0 when undefined', () => {
    const quotes: ProviderQuote[] = [
      {
        provider: 'paycrest',
        success: true,
        destinationAmount: '100',
        rate: 1500,
        currency: 'NGN',
        bridgeFee: '0',
        payoutFee: '0',
        estimatedTime: 300,
        netPayout: 100,
      },
      {
        provider: 'allbridge',
        success: true,
        destinationAmount: '100',
        rate: 1500,
        currency: 'NGN',
        bridgeFee: '0',
        payoutFee: '0',
        estimatedTime: 300,
        netPayout: 100,
        reliability: 0.5,
      },
    ];

    const ranked = rankQuotes(quotes);
    expect(ranked).toHaveLength(2);
    expect(ranked[0].provider).toBe('paycrest');
    expect(ranked[1].provider).toBe('allbridge');
  });
});

describe('getProviderStatus', () => {
  it('returns provider configurations', () => {
    resetReliabilityHistory();
    const status = getProviderStatus();
    expect(status).toHaveProperty('paycrest');
    expect(status).toHaveProperty('allbridge');
    expect(status.paycrest.enabled).toBe(true);
    expect(status.allbridge.enabled).toBe(false);
  });
});

describe('resetReliabilityHistory', () => {
  it('clears reliability history for all providers', () => {
    getProviderStatus();
    resetReliabilityHistory();
    const status = getProviderStatus();
    expect(status.paycrest.reliabilityHistory).toEqual([]);
    expect(status.allbridge.reliabilityHistory).toEqual([]);
  });

  it('can be called multiple times without error', () => {
    resetReliabilityHistory();
    resetReliabilityHistory();
    resetReliabilityHistory();
    const status = getProviderStatus();
    expect(status.paycrest.reliabilityHistory).toEqual([]);
  });
});

describe('selectBestQuote edge cases', () => {
  it('returns null for empty array', () => {
    expect(selectBestQuote([])).toBeNull();
  });

  it('handles quotes with all zeros but success true', () => {
    const quotes: ProviderQuote[] = [
      {
        provider: 'paycrest',
        success: true,
        destinationAmount: '0',
        rate: 0,
        currency: 'NGN',
        bridgeFee: '0',
        payoutFee: '0',
        estimatedTime: 0,
        netPayout: 0,
      },
    ];

    const best = selectBestQuote(quotes);
    expect(best).not.toBeNull();
    expect(best!.provider).toBe('paycrest');
  });

  it('handles zero netPayout tiebreaker', () => {
    const quotes: ProviderQuote[] = [
      {
        provider: 'paycrest',
        success: true,
        destinationAmount: '0',
        rate: 0,
        currency: 'NGN',
        bridgeFee: '0',
        payoutFee: '0',
        estimatedTime: 300,
        netPayout: 0,
        responseTime: 100,
      },
      {
        provider: 'allbridge',
        success: true,
        destinationAmount: '0',
        rate: 0,
        currency: 'NGN',
        bridgeFee: '0',
        payoutFee: '0',
        estimatedTime: 300,
        netPayout: 0,
        responseTime: 50,
      },
    ];

    const ranked = rankQuotes(quotes);
    expect(ranked[0].provider).toBe('allbridge');
  });
});
