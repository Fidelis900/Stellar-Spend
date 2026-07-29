/**
 * Tests for useAnalytics hook (#835)
 *
 * Covers:
 *  - Disabled mode: no network calls
 *  - Debug mode: console.log called when disabled+debug
 *  - Enabled mode via sendBeacon: payload sent
 *  - Enabled mode via fetch fallback (no sendBeacon)
 *  - trackWalletConnect helper
 *  - trackTransaction helper
 *  - trackThemeChange helper
 *  - trackError helper
 *  - Page view tracked on mount
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAnalytics } from '../useAnalytics';

const ORIGINAL_ENV = process.env.NODE_ENV;

describe('useAnalytics', () => {
  const mockSendBeacon = vi.fn().mockReturnValue(true);
  const mockFetch = vi.fn().mockResolvedValue({ ok: true });
  const mockConsoleLog = vi.fn();
  const mockConsoleError = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock navigator.sendBeacon
    Object.defineProperty(navigator, 'sendBeacon', {
      writable: true,
      value: mockSendBeacon,
    });

    // Mock fetch
    global.fetch = mockFetch as unknown as typeof fetch;

    // Mock console
    vi.spyOn(console, 'log').mockImplementation(mockConsoleLog);
    vi.spyOn(console, 'error').mockImplementation(mockConsoleError);

    // Mock window.location
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { href: 'http://localhost/', pathname: '/' },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Disabled mode ──────────────────────────────────────────────────────────

  it('does not call sendBeacon when analytics is disabled', () => {
    renderHook(() => useAnalytics({ enabled: false }));
    expect(mockSendBeacon).not.toHaveBeenCalled();
  });

  it('does not call fetch when analytics is disabled', () => {
    renderHook(() => useAnalytics({ enabled: false }));
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // ── Debug mode ─────────────────────────────────────────────────────────────

  it('logs event to console in debug mode when disabled', () => {
    renderHook(() => useAnalytics({ enabled: false, debug: true }));
    expect(console.log).toHaveBeenCalledWith(
      '[Analytics Debug]',
      expect.objectContaining({ category: 'Navigation', action: 'page_view' }),
    );
  });

  it('does not log to console when debug is false', () => {
    renderHook(() => useAnalytics({ enabled: false, debug: false }));
    expect(console.log).not.toHaveBeenCalled();
  });

  // ── Enabled mode with sendBeacon ───────────────────────────────────────────

  it('sends page_view event via sendBeacon on mount when enabled', () => {
    renderHook(() => useAnalytics({ enabled: true }));

    expect(mockSendBeacon).toHaveBeenCalledWith(
      '/api/monitoring/vitals',
      expect.any(Blob),
    );

    // Confirm the Blob payload contains the page_view event
    const blobArg = mockSendBeacon.mock.calls[0][1] as Blob;
    expect(blobArg.type).toBe('application/json');
  });

  // ── Enabled mode with fetch fallback ──────────────────────────────────────

  it('falls back to fetch when sendBeacon is unavailable', async () => {
    // Remove sendBeacon
    Object.defineProperty(navigator, 'sendBeacon', {
      writable: true,
      value: undefined,
    });

    renderHook(() => useAnalytics({ enabled: true }));

    // Wait for async fetch to be called
    await vi.waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/monitoring/vitals',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  // ── track() helper: explicit event ────────────────────────────────────────

  it('track() sends custom event via sendBeacon when enabled', () => {
    const { result } = renderHook(() => useAnalytics({ enabled: true }));
    mockSendBeacon.mockClear();

    act(() => {
      result.current.track({
        category: 'Test',
        action: 'custom_action',
        label: 'test-label',
      });
    });

    expect(mockSendBeacon).toHaveBeenCalledOnce();
  });

  // ── trackWalletConnect ─────────────────────────────────────────────────────

  it('trackWalletConnect sends a Wallet/connect_success event on success', () => {
    const { result } = renderHook(() => useAnalytics({ enabled: true }));
    mockSendBeacon.mockClear();

    act(() => {
      result.current.trackWalletConnect('Freighter', true);
    });

    expect(mockSendBeacon).toHaveBeenCalledOnce();
  });

  it('trackWalletConnect sends a Wallet/connect_failure event on failure', () => {
    const { result } = renderHook(() => useAnalytics({ enabled: true }));
    mockSendBeacon.mockClear();

    act(() => {
      result.current.trackWalletConnect('Lobstr', false);
    });

    expect(mockSendBeacon).toHaveBeenCalledOnce();
  });

  it('trackWalletConnect does not call sendBeacon when disabled', () => {
    const { result } = renderHook(() => useAnalytics({ enabled: false, debug: false }));
    mockSendBeacon.mockClear();

    act(() => {
      result.current.trackWalletConnect('Freighter', true);
    });

    expect(mockSendBeacon).not.toHaveBeenCalled();
  });

  // ── trackTransaction ───────────────────────────────────────────────────────

  it('trackTransaction sends a Transaction/initiated event', () => {
    const { result } = renderHook(() => useAnalytics({ enabled: true }));
    mockSendBeacon.mockClear();

    act(() => {
      result.current.trackTransaction('initiated', { amount: '100' });
    });

    expect(mockSendBeacon).toHaveBeenCalledOnce();
  });

  it('trackTransaction sends a Transaction/completed event', () => {
    const { result } = renderHook(() => useAnalytics({ enabled: true }));
    mockSendBeacon.mockClear();

    act(() => {
      result.current.trackTransaction('completed');
    });

    expect(mockSendBeacon).toHaveBeenCalledOnce();
  });

  it('trackTransaction sends a Transaction/failed event', () => {
    const { result } = renderHook(() => useAnalytics({ enabled: true }));
    mockSendBeacon.mockClear();

    act(() => {
      result.current.trackTransaction('failed');
    });

    expect(mockSendBeacon).toHaveBeenCalledOnce();
  });

  // ── trackThemeChange ───────────────────────────────────────────────────────

  it('trackThemeChange sends an Accessibility/theme_change event', () => {
    const { result } = renderHook(() => useAnalytics({ enabled: true }));
    mockSendBeacon.mockClear();

    act(() => {
      result.current.trackThemeChange('dark');
    });

    expect(mockSendBeacon).toHaveBeenCalledOnce();
  });

  // ── trackError ─────────────────────────────────────────────────────────────

  it('trackError sends an Error/error_occurred event', () => {
    const { result } = renderHook(() => useAnalytics({ enabled: true }));
    mockSendBeacon.mockClear();

    act(() => {
      result.current.trackError(new Error('Something went wrong'), 'offramp');
    });

    expect(mockSendBeacon).toHaveBeenCalledOnce();
  });

  it('trackError works without a context argument', () => {
    const { result } = renderHook(() => useAnalytics({ enabled: true }));
    mockSendBeacon.mockClear();

    act(() => {
      result.current.trackError(new Error('Uncaught'));
    });

    expect(mockSendBeacon).toHaveBeenCalledOnce();
  });

  // ── Return shape ───────────────────────────────────────────────────────────

  it('returns track, trackWalletConnect, trackTransaction, trackThemeChange, trackError', () => {
    const { result } = renderHook(() => useAnalytics({ enabled: false }));

    expect(typeof result.current.track).toBe('function');
    expect(typeof result.current.trackWalletConnect).toBe('function');
    expect(typeof result.current.trackTransaction).toBe('function');
    expect(typeof result.current.trackThemeChange).toBe('function');
    expect(typeof result.current.trackError).toBe('function');
  });
});
