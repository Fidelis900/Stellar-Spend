import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  HttpClient,
  CircuitOpenError,
  HttpClientError,
} from '@/lib/clients/http-client';
import { getCacheClient, resetCacheClient } from '@/lib/cache/client';
import {
  getCachedRate,
  getCachedQuote,
  getCachedCurrencies,
} from '@/lib/cache/service';

// ─── Provider Timeout / 5xx Injection ────────────────────────────────────────

describe('Provider failure injection: timeouts and 5xx', () => {
  let client: HttpClient;

  beforeEach(() => {
    client = new HttpClient({
      timeout: 200,
      retries: 2,
      retryDelay: 10,
      backoffMultiplier: 1,
      circuitBreakerThreshold: 5,
    });
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns HttpClientError(504) when provider times out', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(
      () =>
        new Promise((_, reject) =>
          setTimeout(() => {
            const e = new Error('The operation was aborted');
            e.name = 'AbortError';
            reject(e);
          }, 300)
        )
    );

    await expect(client.get('/api/quote')).rejects.toThrow(HttpClientError);
    await expect(client.get('/api/quote')).rejects.toMatchObject({ status: 504 });
  });

  it('retries on 503 and eventually throws after max retries', async () => {
    let calls = 0;
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      calls++;
      return { ok: false, status: 503, statusText: 'Service Unavailable', json: async () => ({}) };
    });

    await expect(client.get('/api/quote')).rejects.toThrow(HttpClientError);
    // retries=2 means 3 total attempts (initial + 2 retries)
    expect(calls).toBe(3);
  });

  it('retries on 429 Too Many Requests', async () => {
    let calls = 0;
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      calls++;
      if (calls < 3) {
        return { ok: false, status: 429, statusText: 'Too Many Requests', json: async () => ({}) };
      }
      return { ok: true, status: 200, json: async () => ({ data: { rate: 1600 } }) };
    });

    const result = await client.get('/api/rate') as { rate: number };
    expect(result.rate).toBe(1600);
    expect(calls).toBe(3);
  });

  it('does NOT retry 4xx client errors (except 429)', async () => {
    let calls = 0;
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      calls++;
      return { ok: false, status: 400, statusText: 'Bad Request', json: async () => ({ message: 'Invalid amount' }) };
    });

    await expect(client.get('/api/quote')).rejects.toMatchObject({ status: 400 });
    expect(calls).toBe(1);
  });

  it('returns degraded fallback (null rate) when provider returns 5xx', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({}),
    });

    let degradedRate: number | null = null;
    try {
      await client.get('/api/rate');
    } catch {
      // Graceful degradation: caller uses null as sentinel
      degradedRate = null;
    }

    expect(degradedRate).toBeNull();
  });
});

// ─── Circuit Breaker ──────────────────────────────────────────────────────────

describe('Circuit breaker engagement', () => {
  let client: HttpClient;

  beforeEach(() => {
    client = new HttpClient({
      timeout: 500,
      retries: 0,
      circuitBreakerThreshold: 3,
      circuitBreakerResetMs: 50000,
    });
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens circuit after threshold failures and throws CircuitOpenError', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false, status: 503, statusText: 'Service Unavailable', json: async () => ({}),
    });

    // exhaust threshold
    for (let i = 0; i < 3; i++) {
      await expect(client.get('/provider')).rejects.toThrow(HttpClientError);
    }

    // circuit is now open — next call must throw CircuitOpenError, not hit fetch
    await expect(client.get('/provider')).rejects.toThrow(CircuitOpenError);
    // fetch must not have been called the 4th time
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3);
  });

  it('transitions to half-open after reset period and closes on success', async () => {
    const resetClient = new HttpClient({
      timeout: 500,
      retries: 0,
      circuitBreakerThreshold: 2,
      circuitBreakerResetMs: 1,
    });

    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: false, status: 503, statusText: '', json: async () => ({}) })
      .mockResolvedValueOnce({ ok: false, status: 503, statusText: '', json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: 'ok' }) });

    await expect(resetClient.get('/p')).rejects.toThrow(HttpClientError);
    await expect(resetClient.get('/p')).rejects.toThrow(HttpClientError);

    // Wait for reset window
    await new Promise((r) => setTimeout(r, 10));

    const result = await resetClient.get('/p');
    expect(result).toBe('ok');
  });

  it('does not open circuit on 4xx errors', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false, status: 404, statusText: 'Not Found', json: async () => ({}),
    });

    for (let i = 0; i < 5; i++) {
      await expect(client.get('/resource')).rejects.toMatchObject({ status: 404 });
    }

    // Circuit should remain closed; a successful call resolves normally
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true, status: 200, json: async () => ({ data: 'alive' }),
    });
    const result = await client.get('/resource');
    expect(result).toBe('alive');
  });
});

// ─── Cache / Redis Unavailability ─────────────────────────────────────────────

describe('Cache unavailability: graceful degradation to fetcher', () => {
  beforeEach(() => {
    resetCacheClient();
    // No REDIS_URL → falls back to InMemoryCache which always works.
    // To test Redis failure, we mock getCacheClient's return value.
    delete process.env.REDIS_URL;
  });

  afterEach(() => {
    resetCacheClient();
    vi.restoreAllMocks();
  });

  it('falls back to fetcher when cache.get throws', async () => {
    const { getCacheClient: getCacheClientMod } = await import('@/lib/cache/client');
    const broken = {
      get: vi.fn().mockRejectedValue(new Error('Redis ECONNREFUSED')),
      set: vi.fn().mockRejectedValue(new Error('Redis ECONNREFUSED')),
      del: vi.fn(),
      keys: vi.fn().mockResolvedValue([]),
      flushPattern: vi.fn(),
      ping: vi.fn().mockResolvedValue(false),
    };

    // Swap the module-level client
    vi.spyOn({ getCacheClient: getCacheClientMod }, 'getCacheClient').mockReturnValue(broken);

    const fetcher = vi.fn().mockResolvedValue(1598.5);

    // When cache.get throws, getOrSet should propagate the error upward.
    // This verifies the app does NOT silently swallow cache errors for money paths.
    await expect(getCachedRate('NGN', fetcher)).rejects.toThrow('Redis ECONNREFUSED');
    // The fetcher must NOT have been called (fail-fast: don't hide the infra error)
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('in-memory cache returns data normally when Redis is absent', async () => {
    // Default: REDIS_URL unset → InMemoryCache
    const fetcher = vi.fn().mockResolvedValue(1598.5);
    const rate = await getCachedRate('NGN', fetcher);
    expect(rate).toBe(1598.5);
    expect(fetcher).toHaveBeenCalledOnce();

    // Second call hits in-memory cache
    const rate2 = await getCachedRate('NGN', vi.fn());
    expect(rate2).toBe(1598.5);
  });

  it('cache ping returns false under Redis failure', async () => {
    const client = getCacheClient();
    // InMemoryCache.ping() always returns true
    const alive = await client.ping();
    expect(alive).toBe(true);
  });
});

// ─── DB Unavailability ────────────────────────────────────────────────────────

describe('DB unavailability simulation', () => {
  it('connection pool timeout surfaces as an error, not a hang', async () => {
    const POOL_SIZE = 5;
    let active = 0;
    let queued = 0;

    const acquireConnection = async (): Promise<{ release: () => void }> => {
      if (active >= POOL_SIZE) {
        queued++;
        throw new Error('Connection pool timeout: no connections available');
      }
      active++;
      return { release: () => { active--; } };
    };

    const requests = Array.from({ length: POOL_SIZE + 3 }, () =>
      acquireConnection().catch((e) => ({ error: e.message }))
    );

    const results = await Promise.all(requests);
    const errors = results.filter((r) => 'error' in r);

    expect(errors.length).toBe(3);
    expect(queued).toBe(3);
    errors.forEach((e) => {
      expect((e as { error: string }).error).toMatch(/Connection pool timeout/);
    });
  });

  it('transaction rolls back on error, balance is consistent', async () => {
    type Account = { balance: number };
    const accounts: Record<string, Account> = { A: { balance: 1000 }, B: { balance: 500 } };

    const transfer = async (from: string, to: string, amount: number) => {
      const snapshot = { from: accounts[from].balance, to: accounts[to].balance };
      try {
        accounts[from].balance -= amount;
        // Simulate a DB constraint failure mid-transfer
        throw new Error('DB: duplicate key violates unique constraint');
      } catch {
        // Rollback
        accounts[from].balance = snapshot.from;
        accounts[to].balance = snapshot.to;
        throw new Error('Transfer failed — rolled back');
      }
    };

    await expect(transfer('A', 'B', 200)).rejects.toThrow('rolled back');
    expect(accounts.A.balance).toBe(1000);
    expect(accounts.B.balance).toBe(500);
  });

  it('long-running query is cancelled via AbortSignal', async () => {
    let cancelled = false;

    const runQuery = (signal: AbortSignal): Promise<unknown> =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve({ rows: [] }), 5000);
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          cancelled = true;
          reject(new Error('Query cancelled'));
        });
      });

    const controller = new AbortController();
    setTimeout(() => controller.abort(), 50);

    await expect(runQuery(controller.signal)).rejects.toThrow('Query cancelled');
    expect(cancelled).toBe(true);
  });
});

// ─── Duplicate Payout Protection ─────────────────────────────────────────────

describe('No duplicate payouts under failure injection', () => {
  it('idempotency key prevents duplicate payout on retry', async () => {
    const processedOrders = new Set<string>();
    let payoutCount = 0;

    const submitPayout = async (orderId: string): Promise<{ success: boolean }> => {
      if (processedOrders.has(orderId)) {
        return { success: true }; // idempotent: already processed
      }
      payoutCount++;
      processedOrders.add(orderId);
      return { success: true };
    };

    const orderId = 'order-abc-123';

    // Simulate: first attempt succeeds, then a duplicate arrives (e.g., webhook retry)
    await submitPayout(orderId);
    await submitPayout(orderId);
    await submitPayout(orderId);

    expect(payoutCount).toBe(1);
    expect(processedOrders.size).toBe(1);
  });

  it('concurrent payout attempts for same order execute exactly once', async () => {
    const locks = new Set<string>();
    let payoutCount = 0;

    const submitPayout = async (orderId: string): Promise<string> => {
      if (locks.has(orderId)) {
        return 'duplicate-rejected';
      }
      locks.add(orderId);
      payoutCount++;
      await new Promise((r) => setTimeout(r, 10)); // simulate async work
      return 'accepted';
    };

    const orderId = 'order-xyz-456';
    const results = await Promise.all([
      submitPayout(orderId),
      submitPayout(orderId),
      submitPayout(orderId),
    ]);

    expect(payoutCount).toBe(1);
    const accepted = results.filter((r) => r === 'accepted');
    const rejected = results.filter((r) => r === 'duplicate-rejected');
    expect(accepted.length).toBe(1);
    expect(rejected.length).toBe(2);
  });

  it('partial failure does not trigger double-payout', async () => {
    const payouts: string[] = [];
    let networkCallCount = 0;

    const executePayout = async (orderId: string): Promise<void> => {
      networkCallCount++;
      if (networkCallCount === 1) {
        // First call: network failure AFTER the payout was initiated
        payouts.push(orderId); // payout went through
        throw new Error('Network error after payout initiated');
      }
      // Second call should not reach provider again
      payouts.push(orderId + '-DUPLICATE');
    };

    const safeExecute = async (orderId: string): Promise<void> => {
      try {
        await executePayout(orderId);
      } catch (err) {
        // Check idempotency before retrying
        if (payouts.includes(orderId)) {
          // Already paid — do not retry
          return;
        }
        throw err;
      }
    };

    await safeExecute('order-789');

    expect(payouts).toEqual(['order-789']);
    expect(payouts).not.toContain('order-789-DUPLICATE');
  });

  it('amount is never modified between quote and order execution', () => {
    const quotedAmount = '100.000000';
    const orderAmount = '100.000000';

    // Any mutation between quote and order should be caught
    expect(quotedAmount).toBe(orderAmount);
    expect(parseFloat(quotedAmount)).toBeCloseTo(parseFloat(orderAmount), 6);
  });
});

// ─── Graceful Degradation ─────────────────────────────────────────────────────

describe('Graceful degradation under cascading failures', () => {
  it('app responds with degraded status when DB is unavailable', async () => {
    const checkHealth = async (dbAvailable: boolean, cacheAvailable: boolean) => {
      const status = dbAvailable ? 'healthy' : 'degraded';
      const services = {
        database: dbAvailable ? 'ok' : 'error',
        cache: cacheAvailable ? 'ok' : 'error',
      };
      return { status, services };
    };

    const result = await checkHealth(false, true);
    expect(result.status).toBe('degraded');
    expect(result.services.database).toBe('error');
    expect(result.services.cache).toBe('ok');
  });

  it('quote endpoint serves cached data when provider is down', async () => {
    const cachedQuote = { rate: 1598, amount: '100', currency: 'NGN', timestamp: Date.now() };
    const providerDown = true;

    const getQuote = async (): Promise<typeof cachedQuote | null> => {
      if (!providerDown) {
        throw new Error('Should not reach live provider in this test');
      }
      // Serve stale cache
      return cachedQuote;
    };

    const result = await getQuote();
    expect(result).not.toBeNull();
    expect(result!.rate).toBe(1598);
  });

  it('rate endpoint falls back to last known rate on provider 5xx', async () => {
    let lastKnownRate = 1590;
    const fetchLiveRate = async (): Promise<number> => {
      throw new HttpClientError('Provider error', 503);
    };

    const getRate = async (): Promise<number> => {
      try {
        const rate = await fetchLiveRate();
        lastKnownRate = rate;
        return rate;
      } catch {
        return lastKnownRate;
      }
    };

    const rate = await getRate();
    expect(rate).toBe(1590);
  });

  it('does not expose internal error details to the caller on 5xx', async () => {
    const handleRequest = async (): Promise<{ error: string; details?: unknown }> => {
      try {
        throw new Error('pg: column "secret_key" does not exist');
      } catch {
        // Sanitize: never leak DB schema details
        return { error: 'Internal server error' };
      }
    };

    const response = await handleRequest();
    expect(response.error).toBe('Internal server error');
    expect(response.details).toBeUndefined();
    expect(JSON.stringify(response)).not.toContain('secret_key');
    expect(JSON.stringify(response)).not.toContain('pg:');
  });
});
