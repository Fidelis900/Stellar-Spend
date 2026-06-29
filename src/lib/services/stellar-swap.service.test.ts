import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  StellarSwapService,
  calculateMinAmountOut,
  getAssetForSymbol,
  type StellarSwapQuote,
} from './stellar-swap.service';
import { calculateMinAmountOut as calcMinFromStablecoins, getSwapPair } from '../stablecoins';

// Mock stellar-sdk to avoid ESM issues
vi.mock('@stellar/stellar-sdk', () => ({
  Asset: class Asset {
    constructor(public code: string, public issuer: string) {}
    static native() { return new Asset('XLM', ''); }
  },
  Account: class Account {
    constructor(public id: string, public sequence: string) {}
  },
  TransactionBuilder: class TransactionBuilder {
    constructor() {}
    addOperation() { return this; }
    setTimeout() { return this; }
    build() { return { toXDR: () => 'mocked-xdr' }; }
  },
  Operation: {
    pathPaymentStrictSend: vi.fn(() => ({})),
  },
  Networks: { PUBLIC: 'Public Global Stellar Network ; September 2015' },
}));

describe('calculateMinAmountOut', () => {
  it('applies 0.5% slippage correctly', () => {
    const result = calculateMinAmountOut('100', 0.005);
    expect(parseFloat(result)).toBeCloseTo(99.5, 4);
  });

  it('applies 1% slippage', () => {
    const result = calculateMinAmountOut('100', 0.01);
    expect(parseFloat(result)).toBeCloseTo(99.0, 4);
  });

  it('caps slippage at 5%', () => {
    const result = calculateMinAmountOut('100', 0.2);
    expect(parseFloat(result)).toBeCloseTo(95.0, 4);
  });

  it('returns 0 for invalid amount', () => {
    expect(calculateMinAmountOut('abc', 0.005)).toBe('0');
    expect(calculateMinAmountOut('0', 0.005)).toBe('0');
    expect(calculateMinAmountOut('-10', 0.005)).toBe('0');
  });

  it('formats to 7 decimal places', () => {
    const result = calculateMinAmountOut('100', 0.005);
    expect(result).toMatch(/^\d+\.\d{7}$/);
  });

  it('zero slippage returns the original amount', () => {
    const result = calculateMinAmountOut('50', 0);
    expect(parseFloat(result)).toBeCloseTo(50.0, 5);
  });
});

describe('getAssetForSymbol', () => {
  it('returns an Asset for USDC', () => {
    const asset = getAssetForSymbol('USDC');
    expect(asset).toBeDefined();
  });

  it('returns an Asset for USDT', () => {
    const asset = getAssetForSymbol('USDT');
    expect(asset).toBeDefined();
  });

  it('throws for unknown symbol', () => {
    expect(() => getAssetForSymbol('DAI')).toThrow('Unknown Stellar asset: DAI');
  });
});

describe('StellarSwapService', () => {
  let service: StellarSwapService;

  beforeEach(() => {
    service = new StellarSwapService();
  });

  describe('getQuote', () => {
    it('returns a valid quote for USDC -> USDT', async () => {
      const quote = await service.getQuote('USDC', 'USDT', '100');
      expect(quote.fromSymbol).toBe('USDC');
      expect(quote.toSymbol).toBe('USDT');
      expect(quote.fromAmount).toBe('100');
      expect(parseFloat(quote.toAmount)).toBeGreaterThan(0);
      expect(parseFloat(quote.toAmount)).toBeLessThan(100);
      expect(parseFloat(quote.minAmountOut)).toBeLessThanOrEqual(parseFloat(quote.toAmount));
      expect(quote.route).toEqual(['USDC', 'USDT']);
      expect(quote.expiresAt).toBeGreaterThan(Date.now());
    });

    it('returns a valid quote for USDT -> USDC', async () => {
      const quote = await service.getQuote('USDT', 'USDC', '50', 0.01);
      expect(quote.fromSymbol).toBe('USDT');
      expect(quote.toSymbol).toBe('USDC');
      expect(quote.slippageTolerance).toBe(0.01);
    });

    it('throws for same asset swap', async () => {
      await expect(service.getQuote('USDC', 'USDC', '100')).rejects.toThrow(
        'Cannot swap the same asset',
      );
    });

    it('throws for unsupported asset', async () => {
      await expect(service.getQuote('DAI', 'USDC', '100')).rejects.toThrow(
        'Unsupported swap asset: DAI',
      );
    });

    it('throws for non-positive amount', async () => {
      await expect(service.getQuote('USDC', 'USDT', '0')).rejects.toThrow(
        'Amount must be a positive number',
      );
      await expect(service.getQuote('USDC', 'USDT', '-10')).rejects.toThrow(
        'Amount must be a positive number',
      );
    });

    it('caps slippage tolerance at 5%', async () => {
      const quote = await service.getQuote('USDC', 'USDT', '100', 0.5);
      expect(quote.slippageTolerance).toBe(0.05);
    });

    it('minAmountOut is less than toAmount', async () => {
      const quote = await service.getQuote('USDC', 'USDT', '100', 0.005);
      expect(parseFloat(quote.minAmountOut)).toBeLessThan(parseFloat(quote.toAmount));
    });
  });

  describe('validateSlippage', () => {
    it('does not throw when actual >= minimum', async () => {
      const quote = await service.getQuote('USDC', 'USDT', '100');
      expect(() => service.validateSlippage(quote, quote.toAmount)).not.toThrow();
      expect(() => service.validateSlippage(quote, quote.minAmountOut)).not.toThrow();
    });

    it('throws when actual < minimum', async () => {
      const quote = await service.getQuote('USDC', 'USDT', '100');
      const tooLow = (parseFloat(quote.minAmountOut) - 1).toFixed(7);
      expect(() => service.validateSlippage(quote, tooLow)).toThrow('Slippage exceeded');
    });
  });

  describe('isQuoteExpired', () => {
    it('returns false for fresh quote', async () => {
      const quote = await service.getQuote('USDC', 'USDT', '100');
      expect(service.isQuoteExpired(quote)).toBe(false);
    });

    it('returns true for expired quote', async () => {
      const quote = await service.getQuote('USDC', 'USDT', '100');
      const expired: StellarSwapQuote = { ...quote, expiresAt: Date.now() - 1000 };
      expect(service.isQuoteExpired(expired)).toBe(true);
    });
  });

  describe('buildSwapTransaction', () => {
    it('returns XDR string for valid quote', async () => {
      const quote = await service.getQuote('USDC', 'USDT', '100');
      const xdr = await service.buildSwapTransaction(
        quote,
        'GBXXXXTEST000000000000000000000000000000000000000000000',
        '100',
      );
      expect(typeof xdr).toBe('string');
      expect(xdr.length).toBeGreaterThan(0);
    });

    it('throws for expired quote', async () => {
      const quote = await service.getQuote('USDC', 'USDT', '100');
      const expired: StellarSwapQuote = { ...quote, expiresAt: Date.now() - 1000 };
      await expect(
        service.buildSwapTransaction(expired, 'GBXXX', '0'),
      ).rejects.toThrow('Quote has expired');
    });
  });
});

describe('stablecoins helpers for swap', () => {
  describe('getSwapPair', () => {
    it('returns a pair for USDC -> USDT', () => {
      const pair = getSwapPair('USDC', 'USDT');
      expect(pair).not.toBeNull();
      expect(pair?.from).toBe('USDC');
      expect(pair?.to).toBe('USDT');
      expect(pair?.path).toEqual([]);
    });

    it('returns a pair for USDT -> USDC', () => {
      const pair = getSwapPair('USDT', 'USDC');
      expect(pair?.from).toBe('USDT');
    });

    it('returns undefined for same asset', () => {
      expect(getSwapPair('USDC', 'USDC')).toBeUndefined();
    });

    it('returns undefined for unsupported asset', () => {
      expect(getSwapPair('DAI', 'USDC')).toBeUndefined();
    });

    it('is case-insensitive', () => {
      expect(getSwapPair('usdc', 'usdt')).not.toBeUndefined();
    });
  });

  describe('calculateMinAmountOut from stablecoins', () => {
    it('applies slippage', () => {
      const result = calcMinFromStablecoins('100', 0.005);
      expect(parseFloat(result)).toBeCloseTo(99.5, 4);
    });

    it('handles zero amount', () => {
      expect(calcMinFromStablecoins('0', 0.005)).toBe('0');
    });

    it('handles invalid amount', () => {
      expect(calcMinFromStablecoins('abc', 0.005)).toBe('0');
    });
  });
});
