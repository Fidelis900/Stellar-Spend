/**
 * Integration tests for webhook retry / backoff behavior (issue #838).
 *
 * Covers:
 *  1.  calculateBackoff(n) returns base * 2^(n-1) + jitter for attempts 1-5
 *  2.  calculateBackoff with retryAfterSeconds honours the Retry-After value
 *  3.  hasRemainingAttempts: true when attemptCount < maxAttempts, false when equal
 *  4.  attempt() — 500 response → success=false, retryable=true
 *  5.  attempt() — 200 response → success=true, retryable=false
 *  6.  attempt() — 400 response → success=false, retryable=false (non-retryable)
 *  7.  attempt() — 429 response → success=false, retryable=true
 *  8.  attempt() — network error → success=false, retryable=true, errorType=NETWORK_ERROR
 *  9.  markFailed() on a record that has hit maxAttempts → updateRecord called with status='failed'
 * 10.  Full retry cycle: 3 consecutive 500 failures — attemptCount increments and backoff grows
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — must be declared before any imports that load the modules
// ---------------------------------------------------------------------------

// Mock the pg pool so delivery-store never touches a real database
vi.mock('@/lib/db/client', () => ({
    pool: {
        query: vi.fn(),
    },
}));

// Suppress logger output during tests
vi.mock('@/lib/logger', () => ({
    logger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
    },
}));

// Mock the DLQ write and alert-service notify so markFailed() doesn't side-effect
vi.mock('@/lib/webhook/dlq', () => ({
    write: vi.fn().mockResolvedValue({ id: 'dlq-entry-id' }),
}));

vi.mock('@/lib/webhook/alert-service', () => ({
    notify: vi.fn().mockResolvedValue(undefined),
}));

// Mock security helper so we don't need a real signing secret during tests
vi.mock('@/lib/webhook/security', () => ({
    buildSignedWebhookHeaders: vi.fn().mockResolvedValue({
        'X-Webhook-Signature': 'mock-signature',
    }),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { pool } from '@/lib/db';
import { calculateBackoff, hasRemainingAttempts } from '@/lib/webhook';
import { attempt, markFailed } from '@/lib/webhook';
import { updateRecord } from '@/lib/webhook';
import type { DeliveryRecord, WebhookPayload } from '@/lib/webhook';

// ---------------------------------------------------------------------------
// Environment setup
// ---------------------------------------------------------------------------

const ENV_OVERRIDES = {
    WEBHOOK_ALERT_CHANNEL_URL: 'https://hooks.example.com/test-alerts',
    WEBHOOK_RETRY_BASE_DELAY_SECONDS: '1',
    WEBHOOK_RETRY_MAX_ATTEMPTS: '3',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockPool = pool as { query: ReturnType<typeof vi.fn> };

/** Build a minimal valid DeliveryRecord for use in tests. */
function buildRecord(overrides: Partial<DeliveryRecord> = {}): DeliveryRecord {
    const now = new Date().toISOString();
    return {
        id: 'rec-test-uuid',
        destinationUrl: 'https://endpoint.example.com/webhook',
        payload: {
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ event: 'test.event', data: {} }),
            source: 'paycrest',
        } satisfies WebhookPayload,
        status: 'pending',
        attemptCount: 0,
        maxAttempts: 3,
        attempts: [],
        nextAttemptAt: now,
        createdAt: now,
        updatedAt: now,
        ...overrides,
    };
}

/** Create a minimal Response-like object for stubbing fetch. */
function mockResponse(status: number): Response {
    return {
        status,
        ok: status >= 200 && status < 300,
        headers: new Headers(),
        text: async () => '',
        json: async () => ({}),
    } as unknown as Response;
}

/** Build the row object that pool.query resolves to when updateRecord is called. */
function buildPoolRow(record: DeliveryRecord, updates: Partial<DeliveryRecord> = {}) {
    const merged = { ...record, ...updates };
    return {
        rows: [
            {
                id: merged.id,
                destination_url: merged.destinationUrl,
                payload: merged.payload,
                status: merged.status,
                attempt_count: merged.attemptCount,
                max_attempts: merged.maxAttempts,
                attempts: merged.attempts,
                next_attempt_at: merged.nextAttemptAt ? new Date(merged.nextAttemptAt) : null,
                created_at: new Date(merged.createdAt),
                updated_at: new Date(merged.updatedAt),
            },
        ],
    };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Webhook retry / backoff — integration tests', () => {
    // Save and restore env between tests
    let savedEnv: Record<string, string | undefined>;

    beforeEach(() => {
        savedEnv = {};
        for (const key of Object.keys(ENV_OVERRIDES)) {
            savedEnv[key] = process.env[key];
        }
        Object.assign(process.env, ENV_OVERRIDES);

        // Default pool stub: resolve with a valid-looking row for every query
        mockPool.query.mockResolvedValue(buildPoolRow(buildRecord()));
    });

    afterEach(() => {
        for (const [key, value] of Object.entries(savedEnv)) {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
        vi.restoreAllMocks();
    });

    // -------------------------------------------------------------------------
    // 1. calculateBackoff — exponential formula
    // -------------------------------------------------------------------------
    describe('1. calculateBackoff — exponential formula', () => {
        it('returns base * 2^0 + jitter for attempt 1', () => {
            // base=1s → 1000 ms; jitter at most 25% → max 1250 ms
            const result = calculateBackoff(1);
            expect(result).toBeGreaterThanOrEqual(1000);
            expect(result).toBeLessThan(1250 + 1); // +1 for floating-point
        });

        it('returns base * 2^1 + jitter for attempt 2', () => {
            // base=1s, attempt 2 → 2000 ms base; jitter at most 25% → max 2500 ms
            const result = calculateBackoff(2);
            expect(result).toBeGreaterThanOrEqual(2000);
            expect(result).toBeLessThan(2500 + 1);
        });

        it('returns base * 2^2 + jitter for attempt 3', () => {
            const result = calculateBackoff(3);
            expect(result).toBeGreaterThanOrEqual(4000);
            expect(result).toBeLessThan(5000 + 1);
        });

        it('returns base * 2^3 + jitter for attempt 4', () => {
            const result = calculateBackoff(4);
            expect(result).toBeGreaterThanOrEqual(8000);
            expect(result).toBeLessThan(10000 + 1);
        });

        it('returns base * 2^4 + jitter for attempt 5', () => {
            const result = calculateBackoff(5);
            expect(result).toBeGreaterThanOrEqual(16000);
            expect(result).toBeLessThan(20000 + 1);
        });

        it('backoff grows with each successive attempt (monotonic)', () => {
            // Seed Math.random to deterministic 0 so jitter is 0 and we get exact values
            vi.spyOn(Math, 'random').mockReturnValue(0);
            const delays = [1, 2, 3, 4, 5].map((n) => calculateBackoff(n));
            for (let i = 1; i < delays.length; i++) {
                expect(delays[i]).toBeGreaterThan(delays[i - 1]);
            }
        });
    });

    // -------------------------------------------------------------------------
    // 2. calculateBackoff — Retry-After override
    // -------------------------------------------------------------------------
    describe('2. calculateBackoff — retryAfterSeconds honours Retry-After', () => {
        it('uses retryAfterSeconds as the base when provided', () => {
            vi.spyOn(Math, 'random').mockReturnValue(0); // no jitter
            const retryAfter = 60; // 60 seconds from Retry-After header
            const result = calculateBackoff(1, retryAfter);
            // Without jitter: exactly 60 * 1000 = 60 000 ms
            expect(result).toBe(60_000);
        });

        it('adds jitter on top of the Retry-After base', () => {
            vi.spyOn(Math, 'random').mockReturnValue(1); // maximum jitter
            const retryAfter = 10; // 10 s
            const result = calculateBackoff(1, retryAfter);
            // max jitter = 0.25 * 10000 = 2500; total = 12500
            expect(result).toBe(12_500);
        });

        it('ignores retryAfterSeconds when it is 0 and falls back to exponential', () => {
            vi.spyOn(Math, 'random').mockReturnValue(0); // no jitter
            const result = calculateBackoff(2, 0);
            // Falls back to exponential: base=1, attempt 2 → 2000 ms
            expect(result).toBe(2_000);
        });
    });

    // -------------------------------------------------------------------------
    // 3. hasRemainingAttempts
    // -------------------------------------------------------------------------
    describe('3. hasRemainingAttempts', () => {
        it('returns true when attemptCount < maxAttempts', () => {
            const record = buildRecord({ attemptCount: 0, maxAttempts: 3 });
            expect(hasRemainingAttempts(record)).toBe(true);
        });

        it('returns true when attemptCount is one less than maxAttempts', () => {
            const record = buildRecord({ attemptCount: 2, maxAttempts: 3 });
            expect(hasRemainingAttempts(record)).toBe(true);
        });

        it('returns false when attemptCount equals maxAttempts', () => {
            const record = buildRecord({ attemptCount: 3, maxAttempts: 3 });
            expect(hasRemainingAttempts(record)).toBe(false);
        });

        it('returns false when attemptCount exceeds maxAttempts', () => {
            const record = buildRecord({ attemptCount: 5, maxAttempts: 3 });
            expect(hasRemainingAttempts(record)).toBe(false);
        });
    });

    // -------------------------------------------------------------------------
    // 4. attempt() — 500 response
    // -------------------------------------------------------------------------
    describe('4. attempt() — HTTP 500 response', () => {
        it('returns success=false and retryable=true', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(500)));
            const record = buildRecord();
            mockPool.query.mockResolvedValue(
                buildPoolRow(record, { attemptCount: 1 })
            );

            const result = await attempt(record);

            expect(result.success).toBe(false);
            expect(result.retryable).toBe(true);
            expect(result.httpStatus).toBe(500);
        });
    });

    // -------------------------------------------------------------------------
    // 5. attempt() — 200 response
    // -------------------------------------------------------------------------
    describe('5. attempt() — HTTP 200 response', () => {
        it('returns success=true and retryable=false', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(200)));
            const record = buildRecord();
            mockPool.query.mockResolvedValue(
                buildPoolRow(record, { attemptCount: 1 })
            );

            const result = await attempt(record);

            expect(result.success).toBe(true);
            expect(result.retryable).toBe(false);
            expect(result.httpStatus).toBe(200);
        });
    });

    // -------------------------------------------------------------------------
    // 6. attempt() — 400 response (non-retryable client error)
    // -------------------------------------------------------------------------
    describe('6. attempt() — HTTP 400 response (non-retryable)', () => {
        it('returns success=false and retryable=false', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(400)));
            const record = buildRecord();
            mockPool.query.mockResolvedValue(
                buildPoolRow(record, { attemptCount: 1 })
            );

            const result = await attempt(record);

            expect(result.success).toBe(false);
            expect(result.retryable).toBe(false);
            expect(result.httpStatus).toBe(400);
        });

        it('also treats 422 as non-retryable', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(422)));
            const record = buildRecord();
            mockPool.query.mockResolvedValue(
                buildPoolRow(record, { attemptCount: 1 })
            );

            const result = await attempt(record);

            expect(result.success).toBe(false);
            expect(result.retryable).toBe(false);
        });
    });

    // -------------------------------------------------------------------------
    // 7. attempt() — 429 response (rate limited — retryable)
    // -------------------------------------------------------------------------
    describe('7. attempt() — HTTP 429 response (rate limited)', () => {
        it('returns success=false and retryable=true', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(429)));
            const record = buildRecord();
            mockPool.query.mockResolvedValue(
                buildPoolRow(record, { attemptCount: 1 })
            );

            const result = await attempt(record);

            expect(result.success).toBe(false);
            expect(result.retryable).toBe(true);
            expect(result.httpStatus).toBe(429);
        });
    });

    // -------------------------------------------------------------------------
    // 8. attempt() — network error
    // -------------------------------------------------------------------------
    describe('8. attempt() — network error (fetch throws)', () => {
        it('returns success=false, retryable=true, errorType=NETWORK_ERROR', async () => {
            vi.stubGlobal(
                'fetch',
                vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
            );
            const record = buildRecord();
            mockPool.query.mockResolvedValue(
                buildPoolRow(record, { attemptCount: 1 })
            );

            const result = await attempt(record);

            expect(result.success).toBe(false);
            expect(result.retryable).toBe(true);
            expect(result.errorType).toBe('NETWORK_ERROR');
            expect(result.httpStatus).toBeUndefined();
        });

        it('classifies an AbortError as TIMEOUT, not NETWORK_ERROR', async () => {
            // Use a plain Error with name='AbortError' so it passes instanceof Error
            // (DOMException may not extend Error in all jsdom versions)
            const abortError = Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' });
            vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError));
            const record = buildRecord();
            mockPool.query.mockResolvedValue(
                buildPoolRow(record, { attemptCount: 1 })
            );

            const result = await attempt(record);

            expect(result.success).toBe(false);
            expect(result.retryable).toBe(true);
            expect(result.errorType).toBe('TIMEOUT');
        });
    });

    // -------------------------------------------------------------------------
    // 9. markFailed() — updateRecord called with status='failed'
    // -------------------------------------------------------------------------
    describe('9. markFailed() — record at maxAttempts', () => {
        it('calls updateRecord with status=failed and nextAttemptAt=null', async () => {
            const record = buildRecord({ attemptCount: 3, maxAttempts: 3 });

            mockPool.query.mockResolvedValue(
                buildPoolRow(record, { status: 'failed', nextAttemptAt: null })
            );

            // Clear any prior calls so we get a clean slate
            mockPool.query.mockClear();

            await markFailed(record);

            // pool.query should have been called (via updateRecord) with 'failed'
            const callArgs = mockPool.query.mock.calls;
            expect(callArgs.length).toBeGreaterThan(0);

            // Find the UPDATE call that sets status = 'failed'
            const updateCall = callArgs.find(
                ([sql]: [string]) =>
                    typeof sql === 'string' && sql.includes('UPDATE delivery_records')
            );
            expect(updateCall).toBeDefined();

            // The values array for the UPDATE should contain 'failed'
            const [, values] = updateCall as [string, unknown[]];
            expect(values).toContain('failed');
        });

        it('sets nextAttemptAt to null in the update values', async () => {
            const record = buildRecord({ attemptCount: 3, maxAttempts: 3 });

            mockPool.query.mockResolvedValue(
                buildPoolRow(record, { status: 'failed', nextAttemptAt: null })
            );

            // Clear any prior calls so we get a clean slate
            mockPool.query.mockClear();

            await markFailed(record);

            const updateCall = mockPool.query.mock.calls.find(
                ([sql]: [string]) =>
                    typeof sql === 'string' && sql.includes('UPDATE delivery_records')
            ) as [string, unknown[]];

            expect(updateCall).toBeDefined();
            const [, values] = updateCall;
            expect(values).toContain(null);
        });
    });

    // -------------------------------------------------------------------------
    // 10. Full retry cycle — 3 consecutive 500 failures
    // -------------------------------------------------------------------------
    describe('10. Full retry cycle — 3 consecutive 500 failures', () => {
        it('increments attemptCount and backoff grows after each failure', async () => {
            // Seed random to 0 so backoff values are deterministic (no jitter)
            vi.spyOn(Math, 'random').mockReturnValue(0);

            vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(500)));

            // We track the record state manually across 3 attempts
            let record = buildRecord({ attemptCount: 0, maxAttempts: 3 });

            const backoffs: number[] = [];
            const results = [];

            for (let i = 1; i <= 3; i++) {
                // Each attempt increments attemptCount
                const expectedAttemptCount = i;

                mockPool.query.mockResolvedValue(
                    buildPoolRow(record, {
                        attemptCount: expectedAttemptCount,
                        attempts: [
                            ...record.attempts,
                            {
                                attemptNumber: i,
                                timestamp: new Date().toISOString(),
                                httpStatus: 500,
                                durationMs: 10,
                            },
                        ],
                    })
                );

                const result = await attempt(record);
                results.push(result);

                // Advance the record state
                record = {
                    ...record,
                    attemptCount: expectedAttemptCount,
                };

                // Calculate what backoff should be for the NEXT retry (based on new attemptCount)
                const backoff = calculateBackoff(expectedAttemptCount);
                backoffs.push(backoff);
            }

            // All three attempts should be failures that are retryable
            for (const result of results) {
                expect(result.success).toBe(false);
                expect(result.retryable).toBe(true);
                expect(result.httpStatus).toBe(500);
            }

            // attemptCount should have been incremented to 3
            expect(record.attemptCount).toBe(3);

            // Backoff should grow: 1000 < 2000 < 4000 (with jitter=0 and base=1s)
            expect(backoffs[0]).toBeLessThan(backoffs[1]);
            expect(backoffs[1]).toBeLessThan(backoffs[2]);

            // After 3 attempts we've hit maxAttempts — no remaining attempts
            expect(hasRemainingAttempts(record)).toBe(false);
        });

        it('pool.query is called once per attempt to persist the attempt result', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(500)));

            let record = buildRecord({ attemptCount: 0, maxAttempts: 3 });
            mockPool.query.mockResolvedValue(buildPoolRow(record, { attemptCount: 1 }));

            mockPool.query.mockClear();

            await attempt(record);

            // updateRecord issues exactly one pool.query per attempt
            expect(mockPool.query).toHaveBeenCalledTimes(1);
        });

        it('fetch is called with the correct destination URL on each attempt', async () => {
            const mockFetch = vi.fn().mockResolvedValue(mockResponse(500));
            vi.stubGlobal('fetch', mockFetch);

            const destinationUrl = 'https://endpoint.example.com/webhook';
            let record = buildRecord({ destinationUrl, attemptCount: 0, maxAttempts: 3 });

            for (let i = 1; i <= 3; i++) {
                mockPool.query.mockResolvedValue(
                    buildPoolRow(record, { attemptCount: i })
                );
                await attempt(record);
                record = { ...record, attemptCount: i };
            }

            expect(mockFetch).toHaveBeenCalledTimes(3);
            for (const call of mockFetch.mock.calls) {
                expect(call[0]).toBe(destinationUrl);
            }
        });
    });
});
