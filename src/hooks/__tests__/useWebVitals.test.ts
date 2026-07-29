/**
 * Tests for useWebVitals hook (#835)
 *
 * Covers:
 *  - Registers all 6 web-vitals observers on mount (CLS, FCP, FID, INP, LCP, TTFB)
 *  - Sends metric via sendBeacon when available
 *  - Falls back to fetch when sendBeacon is unavailable
 *  - Correctly rounds CLS value (* 1000) vs other metrics (round to integer)
 *  - Payload shape: name, value, rating, id, url, ts fields
 *  - Does not throw during mount or unmount
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// ── Mock web-vitals ─────────────────────────────────────────────────────────
// We intercept the observer callbacks so we can fire fake metrics in tests.

const onCLSMock = vi.fn();
const onFCPMock = vi.fn();
const onFIDMock = vi.fn();
const onINPMock = vi.fn();
const onLCPMock = vi.fn();
const onTTFBMock = vi.fn();

vi.mock('web-vitals', () => ({
  onCLS: onCLSMock,
  onFCP: onFCPMock,
  onFID: onFIDMock,
  onINP: onINPMock,
  onLCP: onLCPMock,
  onTTFB: onTTFBMock,
}));

import { useWebVitals } from '../useWebVitals';

/** Helper: fire a fake metric through the registered observer callback */
function fireMockMetric(
  mockFn: ReturnType<typeof vi.fn>,
  metric: { name: string; value: number; rating: string; id: string },
) {
  // The hook passes a callback to each onXxx(); get it and call it directly.
  expect(mockFn).toHaveBeenCalled();
  const callback = mockFn.mock.calls[0][0] as (m: typeof metric) => void;
  callback(metric);
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('useWebVitals', () => {
  const mockSendBeacon = vi.fn().mockReturnValue(true);
  const mockFetch = vi.fn().mockResolvedValue({ ok: true });

  beforeEach(() => {
    vi.clearAllMocks();

    Object.defineProperty(navigator, 'sendBeacon', {
      writable: true,
      value: mockSendBeacon,
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    Object.defineProperty(window, 'location', {
      writable: true,
      value: { pathname: '/test-page' },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Observer registration ──────────────────────────────────────────────

  it('registers onCLS observer on mount', () => {
    renderHook(() => useWebVitals());
    expect(onCLSMock).toHaveBeenCalledOnce();
  });

  it('registers onFCP observer on mount', () => {
    renderHook(() => useWebVitals());
    expect(onFCPMock).toHaveBeenCalledOnce();
  });

  it('registers onFID observer on mount', () => {
    renderHook(() => useWebVitals());
    expect(onFIDMock).toHaveBeenCalledOnce();
  });

  it('registers onINP observer on mount', () => {
    renderHook(() => useWebVitals());
    expect(onINPMock).toHaveBeenCalledOnce();
  });

  it('registers onLCP observer on mount', () => {
    renderHook(() => useWebVitals());
    expect(onLCPMock).toHaveBeenCalledOnce();
  });

  it('registers onTTFB observer on mount', () => {
    renderHook(() => useWebVitals());
    expect(onTTFBMock).toHaveBeenCalledOnce();
  });

  it('registers all 6 observers in a single mount', () => {
    renderHook(() => useWebVitals());
    expect(onCLSMock).toHaveBeenCalledOnce();
    expect(onFCPMock).toHaveBeenCalledOnce();
    expect(onFIDMock).toHaveBeenCalledOnce();
    expect(onINPMock).toHaveBeenCalledOnce();
    expect(onLCPMock).toHaveBeenCalledOnce();
    expect(onTTFBMock).toHaveBeenCalledOnce();
  });

  // ── sendBeacon path ────────────────────────────────────────────────────

  it('sends LCP metric via sendBeacon', () => {
    renderHook(() => useWebVitals());

    fireMockMetric(onLCPMock, {
      name: 'LCP',
      value: 1500.7,
      rating: 'good',
      id: 'v1-123',
    });

    expect(mockSendBeacon).toHaveBeenCalledWith(
      '/api/monitoring/vitals',
      expect.any(Blob),
    );
  });

  it('sends FCP metric via sendBeacon', () => {
    renderHook(() => useWebVitals());

    fireMockMetric(onFCPMock, {
      name: 'FCP',
      value: 800,
      rating: 'good',
      id: 'v1-456',
    });

    expect(mockSendBeacon).toHaveBeenCalledOnce();
  });

  // ── CLS value scaling ──────────────────────────────────────────────────

  it('multiplies CLS value by 1000 (rounds to integer)', async () => {
    renderHook(() => useWebVitals());

    fireMockMetric(onCLSMock, {
      name: 'CLS',
      value: 0.05,
      rating: 'good',
      id: 'v1-cls',
    });

    expect(mockSendBeacon).toHaveBeenCalledOnce();

    const blobArg = mockSendBeacon.mock.calls[0][1] as Blob;
    const text = await blobArg.text();
    const payload = JSON.parse(text) as { name: string; value: number };

    // 0.05 * 1000 = 50
    expect(payload.name).toBe('CLS');
    expect(payload.value).toBe(50);
  });

  it('rounds non-CLS metric values (LCP)', async () => {
    renderHook(() => useWebVitals());

    fireMockMetric(onLCPMock, {
      name: 'LCP',
      value: 1234.9,
      rating: 'needs-improvement',
      id: 'v1-lcp',
    });

    const blobArg = mockSendBeacon.mock.calls[0][1] as Blob;
    const text = await blobArg.text();
    const payload = JSON.parse(text) as { name: string; value: number };

    // Math.round(1234.9) = 1235
    expect(payload.value).toBe(1235);
  });

  // ── Payload shape ──────────────────────────────────────────────────────

  it('payload contains name, value, rating, id, url, ts fields', async () => {
    renderHook(() => useWebVitals());

    fireMockMetric(onTTFBMock, {
      name: 'TTFB',
      value: 200,
      rating: 'good',
      id: 'v1-ttfb-abc',
    });

    const blobArg = mockSendBeacon.mock.calls[0][1] as Blob;
    const text = await blobArg.text();
    const payload = JSON.parse(text) as Record<string, unknown>;

    expect(payload).toMatchObject({
      name: 'TTFB',
      value: 200,
      rating: 'good',
      id: 'v1-ttfb-abc',
      url: '/test-page',
    });
    expect(typeof payload.ts).toBe('number');
  });

  // ── fetch fallback ─────────────────────────────────────────────────────

  it('falls back to fetch when sendBeacon is unavailable', async () => {
    Object.defineProperty(navigator, 'sendBeacon', {
      writable: true,
      value: undefined,
    });

    renderHook(() => useWebVitals());

    fireMockMetric(onINPMock, {
      name: 'INP',
      value: 75,
      rating: 'good',
      id: 'v1-inp',
    });

    await vi.waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/monitoring/vitals',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  // ── Stability ──────────────────────────────────────────────────────────

  it('does not throw on mount', () => {
    expect(() => renderHook(() => useWebVitals())).not.toThrow();
  });

  it('does not throw on unmount', () => {
    const { unmount } = renderHook(() => useWebVitals());
    expect(() => unmount()).not.toThrow();
  });

  it('useWebVitals returns void (no return value)', () => {
    const { result } = renderHook(() => useWebVitals());
    expect(result.current).toBeUndefined();
  });
});
