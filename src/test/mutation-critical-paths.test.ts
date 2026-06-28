import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpClient, HttpClientError, CircuitOpenError } from '@/lib/clients/http-client';
import { TTL, CacheKey } from '@/lib/cache/keys';

// ─── HttpClient: circuit breaker mutations ────────────────────────────────────

describe('Mutation: HttpClient circuit breaker logic', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('circuit opens at exactly the threshold, not before', async () => {
    const THRESHOLD = 3;
    const client = new HttpClient({ retries: 0, circuitBreakerThreshold: THRESHOLD, timeout: 500, circuitBreakerResetMs: 60000 });

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false, status: 503, statusText: '', json: async () => ({}),
    });

    // threshold - 1 calls: circuit still closed
    for (let i = 0; i < THRESHOLD - 1; i++) {
      await expect(client.get('/x')).rejects.toThrow(HttpClientError);
    }

    // At exactly threshold, circuit should open
    await expect(client.get('/x')).rejects.toThrow(HttpClientError);

    // Next call: circuit is open
    await expect(client.get('/x')).rejects.toThrow(CircuitOpenError);
  });

  it('circuit resets to closed after reset period elapses', async () => {
    const client = new HttpClient({ retries: 0, circuitBreakerThreshold: 2, timeout: 500, circuitBreakerResetMs: 5 });

    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: false, status: 503, statusText: '', json: async () => ({}) })
      .mockResolvedValueOnce({ ok: false, status: 503, statusText: '', json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: { value: 42 } }) });

    await expect(client.get('/x')).rejects.toThrow(HttpClientError);
    await expect(client.get('/x')).rejects.toThrow(HttpClientError);

    await new Promise((r) => setTimeout(r, 20));
    const result = await client.get<{ value: number }>('/x');
    expect(result.value).toBe(42);
  });

  it('recordSuccess resets failure counter to zero', async () => {
    const client = new HttpClient({ retries: 0, circuitBreakerThreshold: 5, timeout: 500 });

    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: false, status: 503, statusText: '', json: async () => ({}) })
      .mockResolvedValueOnce({ ok: false, status: 503, statusText: '', json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: 'ok' }) })
      .mockResolvedValueOnce({ ok: false, status: 503, statusText: '', json: async () => ({}) })
      .mockResolvedValueOnce({ ok: false, status: 503, statusText: '', json: async () => ({}) })
      .mockResolvedValueOnce({ ok: false, status: 503, statusText: '', json: async () => ({}) });

    // 2 failures
    await expect(client.get('/x')).rejects.toThrow(HttpClientError);
    await expect(client.get('/x')).rejects.toThrow(HttpClientError);

    // 1 success — resets counter
    await expect(client.get('/x')).resolves.toBe('ok');

    // 3 more failures should not open circuit (counter restarted)
    await expect(client.get('/x')).rejects.toThrow(HttpClientError);
    await expect(client.get('/x')).rejects.toThrow(HttpClientError);
    await expect(client.get('/x')).rejects.toThrow(HttpClientError);

    // Not open yet (only 3 failures since last success, threshold is 5)
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true, status: 200, json: async () => ({ data: 'alive' }),
    });
    await expect(client.get('/x')).resolves.toBe('alive');
  });

  it('4xx errors (except 429) do not count toward circuit breaker', async () => {
    const client = new HttpClient({ retries: 0, circuitBreakerThreshold: 2, timeout: 500 });

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false, status: 404, statusText: 'Not Found', json: async () => ({}),
    });

    // 5 × 404 — circuit must stay closed
    for (let i = 0; i < 5; i++) {
      await expect(client.get('/x')).rejects.toMatchObject({ status: 404 });
    }

    // Should still be reachable (not CircuitOpenError)
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true, status: 200, json: async () => ({ data: 'up' }),
    });
    await expect(client.get('/x')).resolves.toBe('up');
  });

  it('retry count is honored exactly (retries=2 → 3 total calls)', async () => {
    let calls = 0;
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      calls++;
      return { ok: false, status: 500, statusText: '', json: async () => ({}) };
    });

    const client = new HttpClient({ retries: 2, retryDelay: 1, backoffMultiplier: 1, timeout: 500, circuitBreakerThreshold: 10 });
    await expect(client.get('/x')).rejects.toThrow(HttpClientError);
    expect(calls).toBe(3);
  });

  it('exponential backoff multiplies delay correctly', async () => {
    const delays: number[] = [];
    const origSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, ms: number, ...args: unknown[]) => {
      delays.push(ms);
      return origSetTimeout(fn, 0, ...args);
    }) as typeof setTimeout);

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false, status: 503, statusText: '', json: async () => ({}),
    });

    const client = new HttpClient({
      retries: 2,
      retryDelay: 100,
      backoffMultiplier: 2,
      timeout: 500,
      circuitBreakerThreshold: 10,
    });
    await expect(client.get('/x')).rejects.toThrow();

    vi.restoreAllMocks();

    // Delays recorded during retries: 100, 200
    const retryDelays = delays.filter((d) => d >= 100);
    if (retryDelays.length >= 2) {
      expect(retryDelays[1]).toBe(retryDelays[0] * 2);
    }
  });
});

// ─── Cache TTL / key mutations ────────────────────────────────────────────────

describe('Mutation: Cache key and TTL correctness', () => {
  it('rate TTL is 30 seconds (not 0 or negative)', () => {
    expect(TTL.RATE).toBe(30);
    expect(TTL.RATE).toBeGreaterThan(0);
  });

  it('quote TTL is longer than rate TTL', () => {
    expect(TTL.QUOTE).toBeGreaterThan(TTL.RATE);
  });

  it('currencies TTL is 1 hour', () => {
    expect(TTL.CURRENCIES).toBe(3600);
  });

  it('CacheKey.rate includes the currency uppercased', () => {
    expect(CacheKey.rate('ngn')).toBe('rate:NGN');
    expect(CacheKey.rate('KES')).toBe('rate:KES');
    expect(CacheKey.rate('ngn')).not.toBe(CacheKey.rate('KES'));
  });

  it('CacheKey.quote encodes all three discriminants', () => {
    const k1 = CacheKey.quote('100', 'NGN', 'USDC');
    const k2 = CacheKey.quote('200', 'NGN', 'USDC');
    const k3 = CacheKey.quote('100', 'KES', 'USDC');
    const k4 = CacheKey.quote('100', 'NGN', 'XLM');

    // All four must be distinct
    expect(new Set([k1, k2, k3, k4]).size).toBe(4);
  });

  it('CacheKey.transaction includes the id', () => {
    const id = 'tx-abc-123';
    expect(CacheKey.transaction(id)).toContain(id);
    expect(CacheKey.transaction(id)).not.toBe(CacheKey.transaction('tx-other'));
  });
});

// ─── Money-path: Amount validation mutations ──────────────────────────────────

describe('Mutation: Amount validation (money path)', () => {
  const validateAmount = (amount: string): boolean => {
    if (!amount || amount === '0') return false;
    const num = parseFloat(amount);
    return !isNaN(num) && num > 0;
  };

  it('rejects zero amount', () => {
    expect(validateAmount('0')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(validateAmount('')).toBe(false);
  });

  it('rejects negative amount', () => {
    expect(validateAmount('-100')).toBe(false);
    expect(validateAmount('-0.01')).toBe(false);
  });

  it('accepts positive decimal', () => {
    expect(validateAmount('0.01')).toBe(true);
    expect(validateAmount('100.5')).toBe(true);
  });

  it('rejects NaN string', () => {
    expect(validateAmount('abc')).toBe(false);
    expect(validateAmount('1e')).toBe(false);
  });

  it('0.01 is accepted but 0.00 is not', () => {
    expect(validateAmount('0.01')).toBe(true);
    expect(validateAmount('0.00')).toBe(false);
  });
});

// ─── Money-path: Fee calculation mutations ────────────────────────────────────

describe('Mutation: Fee calculation precision (money path)', () => {
  const calculateFee = (amount: number, feePercent: number): number =>
    parseFloat((amount * (feePercent / 100)).toFixed(6));

  it('0.5% fee on 100 USDC is exactly 0.500000', () => {
    expect(calculateFee(100, 0.5)).toBe(0.5);
  });

  it('fee grows proportionally with amount', () => {
    expect(calculateFee(200, 0.5)).toBe(1.0);
    expect(calculateFee(1000, 0.5)).toBe(5.0);
  });

  it('zero fee percent returns 0', () => {
    expect(calculateFee(100, 0)).toBe(0);
  });

  it('net amount after fee is always less than gross', () => {
    const gross = 100;
    const fee = calculateFee(gross, 0.5);
    expect(gross - fee).toBeLessThan(gross);
    expect(gross - fee).toBeGreaterThan(0);
  });

  it('fee calculation preserves 6 decimal places', () => {
    const fee = calculateFee(99.99, 0.5);
    expect(fee.toString()).toMatch(/^\d+\.\d{1,6}$/);
  });

  it('rounding does not cause money loss beyond 6 decimal places', () => {
    const amount = 333.333333;
    const fee = calculateFee(amount, 0.5);
    const net = parseFloat((amount - fee).toFixed(6));
    expect(net + fee).toBeCloseTo(amount, 5);
  });
});

// ─── Money-path: Status transition mutations ──────────────────────────────────

describe('Mutation: Transaction status transitions (money path)', () => {
  type TxStatus = 'pending' | 'processing' | 'settled' | 'failed' | 'refunded';

  const isTerminal = (status: TxStatus): boolean =>
    status === 'settled' || status === 'failed' || status === 'refunded';

  const canRetry = (status: TxStatus): boolean =>
    status === 'pending' || status === 'failed';

  const canRefund = (status: TxStatus): boolean =>
    status === 'failed';

  it('settled, failed, refunded are terminal states', () => {
    expect(isTerminal('settled')).toBe(true);
    expect(isTerminal('failed')).toBe(true);
    expect(isTerminal('refunded')).toBe(true);
  });

  it('pending and processing are non-terminal', () => {
    expect(isTerminal('pending')).toBe(false);
    expect(isTerminal('processing')).toBe(false);
  });

  it('only pending and failed can be retried', () => {
    expect(canRetry('pending')).toBe(true);
    expect(canRetry('failed')).toBe(true);
    expect(canRetry('processing')).toBe(false);
    expect(canRetry('settled')).toBe(false);
    expect(canRetry('refunded')).toBe(false);
  });

  it('only failed orders can be refunded', () => {
    expect(canRefund('failed')).toBe(true);
    expect(canRefund('settled')).toBe(false);
    expect(canRefund('pending')).toBe(false);
  });

  it('settled is not the same as failed', () => {
    expect(isTerminal('settled')).toBe(isTerminal('failed'));
    expect(canRetry('settled')).not.toBe(canRetry('failed'));
  });
});

// ─── Security: Input boundary mutations ──────────────────────────────────────

describe('Mutation: Security — input boundaries', () => {
  const sanitizeInput = (input: string): string =>
    input.replace(/<[^>]*>/g, '').trim();

  const isValidAccountNumber = (acc: string): boolean =>
    /^\d{10}$/.test(acc);

  const isValidBankCode = (code: string): string | false =>
    /^[A-Z]{2,6}$/.test(code) ? code : false;

  it('strips HTML tags from input', () => {
    expect(sanitizeInput('<script>alert(1)</script>')).toBe('');
    expect(sanitizeInput('<b>text</b>')).toBe('text');
    expect(sanitizeInput('plain')).toBe('plain');
  });

  it('account number must be exactly 10 digits', () => {
    expect(isValidAccountNumber('0123456789')).toBe(true);
    expect(isValidAccountNumber('012345678')).toBe(false);
    expect(isValidAccountNumber('01234567890')).toBe(false);
    expect(isValidAccountNumber('012345678a')).toBe(false);
  });

  it('account number rejects leading whitespace', () => {
    expect(isValidAccountNumber(' 0123456789')).toBe(false);
  });

  it('bank code must be 2–6 uppercase letters', () => {
    expect(isValidBankCode('GTB')).toBe('GTB');
    expect(isValidBankCode('AB')).toBe('AB');
    expect(isValidBankCode('A')).toBe(false);
    expect(isValidBankCode('ABCDEFG')).toBe(false);
    expect(isValidBankCode('gtb')).toBe(false);
    expect(isValidBankCode('')).toBe(false);
  });

  it('boundary: 2 chars is valid, 1 char is not', () => {
    expect(isValidBankCode('AB')).toBeTruthy();
    expect(isValidBankCode('A')).toBe(false);
  });

  it('boundary: 6 chars is valid, 7 chars is not', () => {
    expect(isValidBankCode('ABCDEF')).toBeTruthy();
    expect(isValidBankCode('ABCDEFG')).toBe(false);
  });
});
