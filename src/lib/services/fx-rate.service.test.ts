/**
 * Tests for the shared FxRateService (#801)
 * Covers: cache hits, TTL expiry, stale-while-revalidate, provider failure fallback.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FxRateService } from './fx-rate.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeFetchMock(rate: number | null, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status === 200,
    status,
    json: async () => (rate !== null ? { rate: String(rate) } : { rate: '0' }),
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('FxRateService', () => {
  let service: FxRateService;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    service = new FxRateService();
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // ── getRate ────────────────────────────────────────────────────────────────

  describe('getRate', () => {
    it('fetches and returns the rate on a cold cache', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({ rate: '1550.25' }),
      } as Response);

      const rate = await service.getRate('NGN');

      expect(rate).toBe(1550.25);
      expect(fetchSpy).toHaveBeenCalledOnce();
      expect(fetchSpy.mock.calls[0][0]).toContain('/NGN?network=base');
    });

    it('returns cached value within TTL without refetching', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({ rate: '1600' }),
      } as Response);

      await service.getRate('NGN');
      await service.getRate('NGN');

      expect(fetchSpy).toHaveBeenCalledOnce();
    });

    it('refetches after TTL expires', async () => {
      vi.useFakeTimers();
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({ rate: '1600' }),
      } as Response);

      await service.getRate('NGN');
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Advance past the 30 s TTL + 60 s stale window
      vi.advanceTimersByTime(91_000);

      await service.getRate('NGN');
      // Two separate synchronous fetch calls
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('returns stale value while revalidating in background (SWR window)', async () => {
      vi.useFakeTimers();
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({ rate: '1600' }),
      } as Response);

      await service.getRate('NGN');
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Advance into stale-while-revalidate window (31 s — past TTL but < TTL+SWR)
      vi.advanceTimersByTime(31_000);

      // Should return stale value immediately…
      const staleRate = await service.getRate('NGN');
      expect(staleRate).toBe(1600);

      // …and kick off a background fetch
      await vi.runAllTimersAsync();
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('falls back to stale cached value when provider fails', async () => {
      // Prime cache
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rate: '1600' }),
      } as Response);
      await service.getRate('NGN');

      // Expire the entry completely
      vi.useFakeTimers();
      vi.advanceTimersByTime(200_000);

      // Simulate provider failure
      fetchSpy.mockRejectedValueOnce(new Error('Network error'));

      const fallbackRate = await service.getRate('NGN');
      expect(fallbackRate).toBe(1600);
    });

    it('throws when provider fails with no cached fallback', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('Network error'));

      await expect(service.getRate('NGN')).rejects.toThrow('Network error');
    });

    it('throws for non-ok HTTP responses with no cache', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({}),
      } as Response);

      await expect(service.getRate('NGN')).rejects.toThrow('503');
    });

    it('throws for invalid (zero) rate with no cache', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rate: '0' }),
      } as Response);

      await expect(service.getRate('NGN')).rejects.toThrow('Invalid rate');
    });
  });

  // ── getRates ───────────────────────────────────────────────────────────────

  describe('getRates', () => {
    it('returns rates for all requested currencies', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({ rate: '1600' }),
      } as Response);

      const rates = await service.getRates(['NGN', 'KES', 'GHS']);
      expect(rates).toHaveLength(3);
      expect(rates.every((r) => r.rate === 1600)).toBe(true);
    });

    it('omits currencies that fail and returns the rest', async () => {
      fetchSpy
        .mockResolvedValueOnce({ ok: true, json: async () => ({ rate: '1600' }) } as Response)
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValueOnce({ ok: true, json: async () => ({ rate: '14' }) } as Response);

      const rates = await service.getRates(['NGN', 'KES', 'GHS']);
      expect(rates).toHaveLength(2);
      expect(rates.map((r) => r.currency)).toEqual(expect.arrayContaining(['NGN', 'GHS']));
    });

    it('returns empty array when all providers fail', async () => {
      fetchSpy.mockRejectedValue(new Error('All down'));
      const rates = await service.getRates(['NGN', 'KES']);
      expect(rates).toHaveLength(0);
    });
  });

  // ── invalidate ────────────────────────────────────────────────────────────

  describe('invalidate', () => {
    it('forces a fresh fetch after invalidation', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({ rate: '1600' }),
      } as Response);

      await service.getRate('NGN');
      service.invalidate('NGN');
      await service.getRate('NGN');

      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('invalidateAll clears all entries', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({ rate: '1600' }),
      } as Response);

      await service.getRate('NGN');
      await service.getRate('KES');
      service.invalidateAll();
      await service.getRate('NGN');
      await service.getRate('KES');

      expect(fetchSpy).toHaveBeenCalledTimes(4);
    });
  });
});
