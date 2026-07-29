import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PaycrestAdapter,
  PaycrestHttpError,
  mapPaycrestStatus,
} from '../lib/offramp/adapters/paycrest-adapter';

const adapter = new PaycrestAdapter('test-api-key');

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

describe('mapPaycrestStatus', () => {
  it.each([
    ['payment_order.pending', 'pending'],
    ['payment_order.validated', 'validated'],
    ['payment_order.settled', 'settled'],
    ['payment_order.refunded', 'refunded'],
    ['payment_order.expired', 'expired'],
  ])('%s → %s', (input, expected) => {
    expect(mapPaycrestStatus(input)).toBe(expected);
  });

  it('defaults to "pending" for unknown event', () => {
    expect(mapPaycrestStatus('payment_order.unknown')).toBe('pending');
    expect(mapPaycrestStatus('')).toBe('pending');
  });
});

describe('PaycrestAdapter.getCurrencies', () => {
  it('returns array of { code, name, symbol }', async () => {
    mockFetch([{ code: 'NGN', name: 'Nigerian Naira', symbol: '₦' }]);
    const currencies = await adapter.getCurrencies();
    expect(Array.isArray(currencies)).toBe(true);
    expect(currencies[0]).toMatchObject({
      code: expect.any(String),
      name: expect.any(String),
      symbol: expect.any(String),
    });
  });

  it('includes NGN in the currencies list', async () => {
    mockFetch([
      { code: 'NGN', name: 'Nigerian Naira', symbol: '₦' },
      { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh' },
    ]);
    const currencies = await adapter.getCurrencies();
    expect(currencies.some((c) => c.code === 'NGN')).toBe(true);
  });

  it('throws PaycrestHttpError on non-ok response', async () => {
    mockFetch({ message: 'Unauthorized' }, false, 401);
    await expect(adapter.getCurrencies()).rejects.toBeInstanceOf(PaycrestHttpError);
  });
});

describe('PaycrestAdapter.getInstitutions', () => {
  it('returns array of { code, name } for NGN', async () => {
    mockFetch([
      { code: 'ACCESS', name: 'Access Bank' },
      { code: 'GTB', name: 'Guaranty Trust Bank' },
    ]);
    const institutions = await adapter.getInstitutions('NGN');
    expect(Array.isArray(institutions)).toBe(true);
    expect(institutions[0]).toMatchObject({ code: expect.any(String), name: expect.any(String) });
  });

  it('returns Nigerian banks for NGN', async () => {
    const nigerianBanks = [
      { code: 'ACCESS', name: 'Access Bank' },
      { code: 'GTB', name: 'Guaranty Trust Bank' },
      { code: 'ZENITH', name: 'Zenith Bank' },
    ];
    mockFetch(nigerianBanks);
    const institutions = await adapter.getInstitutions('NGN');
    expect(institutions.length).toBeGreaterThan(0);
    expect(institutions).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'ACCESS', name: 'Access Bank' })]),
    );
  });

  it('calls the correct endpoint for the given currency', async () => {
    const spy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve([{ code: 'ACCESS', name: 'Access Bank' }]),
    });
    vi.stubGlobal('fetch', spy);
    await adapter.getInstitutions('NGN');
    expect(spy.mock.calls[0][0]).toContain('/sender/institutions/NGN');
  });

  it('throws PaycrestHttpError on non-ok response', async () => {
    mockFetch({ message: 'Unsupported currency' }, false, 400);
    await expect(adapter.getInstitutions('XYZ')).rejects.toBeInstanceOf(PaycrestHttpError);
  });
});

describe('PaycrestAdapter.verifyAccount', () => {
  it('returns account name for valid GTBank account (accountName field)', async () => {
    mockFetch({ data: { accountName: 'John Doe' } });
    const name = await adapter.verifyAccount('GTB', '0123456789');
    expect(name).toBe('John Doe');
  });

  it('returns account name when response has top-level accountName', async () => {
    mockFetch({ accountName: 'Jane Smith' });
    const name = await adapter.verifyAccount('GTB', '0123456789');
    expect(name).toBe('Jane Smith');
  });

  it('returns empty string for invalid account (non-ok response)', async () => {
    mockFetch({ message: 'Account not found' }, false, 400);
    const name = await adapter.verifyAccount('GTB', '0000000000');
    expect(name).toBe('');
  });

  it('POSTs to /sender/verify-account with institution and accountIdentifier', async () => {
    const spy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: { accountName: 'John Doe' } }),
    });
    vi.stubGlobal('fetch', spy);
    await adapter.verifyAccount('GTB', '0123456789');
    expect(spy.mock.calls[0][0]).toContain('/sender/verify-account');
    expect(JSON.parse(spy.mock.calls[0][1].body)).toEqual({
      institution: 'GTB',
      accountIdentifier: '0123456789',
    });
  });
});

describe('PaycrestAdapter.getRate', () => {
  it('returns a valid NGN/USDC rate when data is a number', async () => {
    mockFetch({ data: 1580.5 });
    const rate = await adapter.getRate('USDC', '100', 'NGN');
    expect(rate).toBe(1580.5);
    expect(isFinite(rate)).toBe(true);
  });

  it('returns a valid rate when data is a string', async () => {
    mockFetch({ data: '1580.5' });
    const rate = await adapter.getRate('USDC', '100', 'NGN');
    expect(rate).toBe(1580.5);
  });

  it('calls the correct path-param endpoint', async () => {
    const spy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: 1500 }),
    });
    vi.stubGlobal('fetch', spy);

    await adapter.getRate('USDC', '50', 'NGN', { network: 'base', providerId: 'p1' });

    const calledUrl: string = spy.mock.calls[0][0];
    expect(calledUrl).toContain('/rates/USDC/50/NGN');
    expect(calledUrl).toContain('network=base');
    expect(calledUrl).toContain('provider_id=p1');
  });

  it('throws when rate is not finite (NaN)', async () => {
    mockFetch({ data: 'not-a-number' });
    await expect(adapter.getRate('USDC', '100', 'NGN')).rejects.toThrow('Invalid rate');
  });

  it('throws when data field is missing', async () => {
    mockFetch({});
    await expect(adapter.getRate('USDC', '100', 'NGN')).rejects.toThrow('Invalid rate');
  });

  it('throws PaycrestHttpError on non-ok response', async () => {
    mockFetch({ message: 'Unauthorized' }, false, 401);
    await expect(adapter.getRate('USDC', '100', 'NGN')).rejects.toBeInstanceOf(PaycrestHttpError);
  });
});
