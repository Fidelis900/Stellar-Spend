import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const connectMock = vi.fn();
const poolQueryMock = vi.fn();

vi.mock('@/lib/db/client', () => ({
  pool: {
    connect: connectMock,
    query: poolQueryMock,
  },
}));

import { buildRequestHash, withIdempotency } from '@/lib/idempotency';

function makeRequest(body: object, key = 'idem-key-1', path = '/api/offramp/paycrest/order') {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': key,
    },
    body: JSON.stringify(body),
  });
}

function makeClient(queryImpl: ReturnType<typeof vi.fn>) {
  return {
    query: queryImpl,
    release: vi.fn(),
  };
}

describe('buildRequestHash', () => {
  it('produces the same hash for semantically identical JSON bodies', () => {
    const left = buildRequestHash('POST', '/api/test', JSON.stringify({ b: 2, a: 1 }));
    const right = buildRequestHash('POST', '/api/test', JSON.stringify({ a: 1, b: 2 }));
    expect(left).toBe(right);
  });
});

describe('withIdempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stores the first result and replays it for the same key and payload', async () => {
    const firstClientQuery = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    connectMock.mockResolvedValueOnce(makeClient(firstClientQuery)).mockResolvedValueOnce(
      makeClient(
        vi
          .fn()
          .mockResolvedValueOnce({})
          .mockResolvedValueOnce({})
          .mockResolvedValueOnce({
            rows: [
              {
                idempotency_key: 'idem-key-1',
                method: 'POST',
                path: '/api/offramp/paycrest/order',
                request_hash: buildRequestHash(
                  'POST',
                  '/api/offramp/paycrest/order',
                  JSON.stringify({ amount: 100, reference: 'abc' }),
                ),
                status: 'completed',
                status_code: 200,
                response_body: { data: { id: 'order-1' } },
                response_headers: { 'content-type': 'application/json' },
                locked_until: null,
                expires_at: Date.now() + 10_000,
              },
            ],
          })
          .mockResolvedValueOnce({}),
      ),
    );

    poolQueryMock.mockResolvedValueOnce({});

    const handler = vi
      .fn()
      .mockResolvedValue(NextResponse.json({ data: { id: 'order-1' } }, { status: 200 }));

    const firstResponse = await withIdempotency(
      makeRequest({ amount: 100, reference: 'abc' }),
      handler,
    );

    expect(firstResponse.status).toBe(200);
    expect(firstResponse.headers.get('Idempotency-Status')).toBe('created');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(poolQueryMock).toHaveBeenCalledTimes(1);

    const secondResponse = await withIdempotency(
      makeRequest({ reference: 'abc', amount: 100 }),
      handler,
    );

    expect(secondResponse.status).toBe(200);
    expect(secondResponse.headers.get('Idempotency-Status')).toBe('replayed');
    expect(await secondResponse.json()).toEqual({ data: { id: 'order-1' } });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('returns 409 when the same idempotency key is reused with a different payload', async () => {
    const conflictHash = buildRequestHash(
      'POST',
      '/api/offramp/paycrest/order',
      JSON.stringify({ amount: 100, reference: 'original' }),
    );

    connectMock.mockResolvedValueOnce(
      makeClient(
        vi
          .fn()
          .mockResolvedValueOnce({})
          .mockResolvedValueOnce({})
          .mockResolvedValueOnce({
            rows: [
              {
                idempotency_key: 'idem-key-1',
                method: 'POST',
                path: '/api/offramp/paycrest/order',
                request_hash: conflictHash,
                status: 'completed',
                status_code: 200,
                response_body: { ok: true },
                response_headers: { 'content-type': 'application/json' },
                locked_until: null,
                expires_at: Date.now() + 10_000,
              },
            ],
          })
          .mockResolvedValueOnce({}),
      ),
    );

    const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }, { status: 200 }));
    const response = await withIdempotency(
      makeRequest({ amount: 200, reference: 'different' }),
      handler,
    );

    expect(response.status).toBe(409);
    expect(response.headers.get('Idempotency-Status')).toBe('conflict');
    expect(await response.json()).toEqual({
      error: 'Idempotency key has already been used with a different request payload',
    });
    expect(handler).not.toHaveBeenCalled();
  });
});
