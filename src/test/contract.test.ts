import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PaycrestAdapter, mapPaycrestStatus } from '../lib/offramp/adapters/paycrest-adapter';
import { HttpClientError } from '../lib/clients/http-client';
import paycrestCurrencies from './fixtures/paycrest/currencies.json';
import paycrestInstitutions from './fixtures/paycrest/institutions.json';
import paycrestRate from './fixtures/paycrest/rate.json';
import paycrestOrder from './fixtures/paycrest/order.json';
import paycrestVerifyAccount from './fixtures/paycrest/verify-account.json';
import paycrestErrors from './fixtures/paycrest/error-responses.json';
import allbridgeTokens from './fixtures/allbridge/tokens.json';
import allbridgeQuote from './fixtures/allbridge/quote.json';
import allbridgeErrors from './fixtures/allbridge/error-responses.json';

function mockFetch(data: unknown, ok = true, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok,
      status,
      statusText: ok ? 'OK' : 'Bad Request',
      json: () => Promise.resolve(data),
    }),
  );
}

beforeEach(() => vi.restoreAllMocks());

describe('Paycrest contract tests', () => {
  const adapter = new PaycrestAdapter('test-api-key');

  describe('getCurrencies', () => {
    it('parses all documented fields from currencies fixture', async () => {
      mockFetch(paycrestCurrencies);
      const currencies = await adapter.getCurrencies();
      expect(Array.isArray(currencies)).toBe(true);
      expect(currencies.length).toBe(paycrestCurrencies.length);

      for (const c of currencies) {
        expect(c).toHaveProperty('code');
        expect(typeof c.code).toBe('string');
        expect(c).toHaveProperty('name');
        expect(typeof c.name).toBe('string');
        expect(c).toHaveProperty('symbol');
        expect(typeof c.symbol).toBe('string');
      }
    });

    it('includes expected currencies', async () => {
      mockFetch(paycrestCurrencies);
      const currencies = await adapter.getCurrencies();
      const codes = currencies.map((c) => c.code);
      expect(codes).toContain('NGN');
      expect(codes).toContain('KES');
      expect(codes).toContain('GHS');
    });
  });

  describe('getInstitutions', () => {
    it('parses all documented fields from institutions fixture', async () => {
      mockFetch(paycrestInstitutions);
      const institutions = await adapter.getInstitutions('NGN');
      expect(Array.isArray(institutions)).toBe(true);
      expect(institutions.length).toBe(paycrestInstitutions.length);

      for (const inst of institutions) {
        expect(inst).toHaveProperty('code');
        expect(typeof inst.code).toBe('string');
        expect(inst).toHaveProperty('name');
        expect(typeof inst.name).toBe('string');
      }
    });

    it('includes well-known Nigerian banks', async () => {
      mockFetch(paycrestInstitutions);
      const institutions = await adapter.getInstitutions('NGN');
      const codes = institutions.map((i) => i.code);
      expect(codes).toContain('ACCESS');
      expect(codes).toContain('GTB');
      expect(codes).toContain('ZENITH');
    });
  });

  describe('getRate', () => {
    it('parses numeric rate from fixture', async () => {
      mockFetch(paycrestRate);
      const rate = await adapter.getRate('USDC', '100', 'NGN');
      expect(typeof rate).toBe('number');
      expect(rate).toBeGreaterThan(0);
      expect(rate).toBe(paycrestRate.data);
    });

    it('returns a finite positive number', async () => {
      mockFetch(paycrestRate);
      const rate = await adapter.getRate('USDC', '100', 'NGN');
      expect(isFinite(rate)).toBe(true);
      expect(rate).toBeGreaterThan(0);
    });
  });

  describe('getOrderStatus', () => {
    it('parses order from fixture', async () => {
      mockFetch(paycrestOrder);
      const result = await adapter.getOrderStatus(paycrestOrder.id);
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('id');
      expect(typeof result.status).toBe('string');
      expect(typeof result.id).toBe('string');
    });

    it('returns status as a non-empty string', async () => {
      mockFetch(paycrestOrder);
      const result = await adapter.getOrderStatus(paycrestOrder.id);
      expect(typeof result.status).toBe('string');
      expect(result.status.length).toBeGreaterThan(0);
    });
  });

  describe('verifyAccount', () => {
    it('parses account name from fixture', async () => {
      mockFetch(paycrestVerifyAccount);
      const name = await adapter.verifyAccount('GTB', '0123456789');
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThan(0);
    });

    it('returns the verified account name', async () => {
      mockFetch(paycrestVerifyAccount);
      const name = await adapter.verifyAccount('GTB', '0123456789');
      expect(name).toBe(paycrestVerifyAccount.data.accountName);
    });
  });
});

describe('Paycrest error-response contract tests', () => {
  const adapter = new PaycrestAdapter('test-api-key');

  it('throws HttpClientError on 400 error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: () => Promise.resolve({ message: 'Invalid request' }),
      }),
    );
    await expect(adapter.getCurrencies()).rejects.toBeInstanceOf(HttpClientError);
  });

  it('throws HttpClientError on 401 error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: () => Promise.resolve({ message: 'Unauthorized' }),
      }),
    );
    await expect(adapter.getCurrencies()).rejects.toBeInstanceOf(HttpClientError);
  });

  it('throws HttpClientError on 500 error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Server Error',
        json: () => Promise.resolve({ message: 'Server error' }),
      }),
    );
    await expect(adapter.getCurrencies()).rejects.toBeInstanceOf(HttpClientError);
  }, 15000);

  it('account_not_found returns empty string', async () => {
    mockFetch(
      paycrestErrors.account_not_found.body,
      false,
      paycrestErrors.account_not_found.status,
    );
    const name = await adapter.verifyAccount('GTB', '0000000000');
    expect(name).toBe('');
  });
});

describe('Allbridge contract tests', () => {
  describe('token fixture structure', () => {
    it('has stellar and base chains with USDC', () => {
      expect(allbridgeTokens).toHaveProperty('stellar');
      expect(allbridgeTokens).toHaveProperty('base');
      expect(allbridgeTokens.stellar.tokens.some((t) => t.symbol === 'USDC')).toBe(true);
      expect(allbridgeTokens.base.tokens.some((t) => t.symbol === 'USDC')).toBe(true);
    });

    it('all tokens have required fields', () => {
      const allTokens = [...allbridgeTokens.stellar.tokens, ...allbridgeTokens.base.tokens];
      for (const token of allTokens) {
        expect(token).toHaveProperty('symbol');
        expect(token).toHaveProperty('name');
        expect(token).toHaveProperty('decimals');
        expect(token).toHaveProperty('contract');
        expect(token).toHaveProperty('allbridgeSymbol');
        expect(typeof token.decimals).toBe('number');
        expect(token.decimals).toBeGreaterThan(0);
      }
    });

    it('stellar USDC has 7 decimals, base USDC has 6', () => {
      const stellarUsdc = allbridgeTokens.stellar.tokens.find((t) => t.symbol === 'USDC')!;
      const baseUsdc = allbridgeTokens.base.tokens.find((t) => t.symbol === 'USDC')!;
      expect(stellarUsdc.decimals).toBe(7);
      expect(baseUsdc.decimals).toBe(6);
    });
  });

  describe('quote fixture structure', () => {
    it('has all required fields', () => {
      expect(allbridgeQuote).toHaveProperty('sourceAmount');
      expect(allbridgeQuote).toHaveProperty('receiveAmount');
      expect(allbridgeQuote).toHaveProperty('fee');
      expect(allbridgeQuote).toHaveProperty('estimatedTime');
      expect(allbridgeQuote).toHaveProperty('sourceToken');
      expect(allbridgeQuote).toHaveProperty('destinationToken');
    });

    it('receiveAmount is less than sourceAmount (fee deducted)', () => {
      const source = parseFloat(allbridgeQuote.sourceAmount);
      const receive = parseFloat(allbridgeQuote.receiveAmount);
      expect(receive).toBeLessThan(source);
    });

    it('estimatedTime is a positive integer', () => {
      expect(typeof allbridgeQuote.estimatedTime).toBe('number');
      expect(allbridgeQuote.estimatedTime).toBeGreaterThan(0);
    });

    it('source and destination tokens have correct structure', () => {
      for (const token of [allbridgeQuote.sourceToken, allbridgeQuote.destinationToken]) {
        expect(token).toHaveProperty('symbol');
        expect(token).toHaveProperty('decimals');
        expect(token).toHaveProperty('contract');
      }
    });
  });

  describe('error fixtures structure', () => {
    it('all error entries have status and body', () => {
      for (const [key, entry] of Object.entries(allbridgeErrors)) {
        expect(entry).toHaveProperty('status');
        expect(entry).toHaveProperty('body');
        expect(entry.body).toHaveProperty('error');
        expect(entry.body).toHaveProperty('message');
      }
    });

    it('includes expected error scenarios', () => {
      const keys = Object.keys(allbridgeErrors);
      expect(keys).toContain('chain_not_found');
      expect(keys).toContain('token_not_found');
      expect(keys).toContain('bridge_unavailable');
      expect(keys).toContain('invalid_amount');
      expect(keys).toContain('timeout');
      expect(keys).toContain('rate_limit');
    });
  });
});

describe('mapPaycrestStatus contract', () => {
  it.each([
    ['payment_order.pending', 'pending'],
    ['payment_order.validated', 'validated'],
    ['payment_order.settled', 'settled'],
    ['payment_order.refunded', 'refunded'],
    ['payment_order.expired', 'expired'],
  ])('maps %s to %s', (input, expected) => {
    expect(mapPaycrestStatus(input)).toBe(expected);
  });

  it('defaults unknown statuses to pending', () => {
    expect(mapPaycrestStatus('payment_order.unknown')).toBe('pending');
    expect(mapPaycrestStatus('')).toBe('pending');
    expect(mapPaycrestStatus('garbage')).toBe('pending');
  });
});
