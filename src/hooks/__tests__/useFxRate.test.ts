import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFxRate, QUOTE_TTL_SECONDS } from '../useFxRate';

const mockFetch = vi.fn();

describe('useFxRate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', mockFetch);
    // Ensure visibilityState is visible by default
    Object.defineProperty(document, 'visibilityState', { writable: true, value: 'visible' });
  });

  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('should start with rate = null', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    const { result } = renderHook(() => useFxRate());
    expect(result.current.rate).toBeNull();
  });

  it('should fetch the rate on mount and update state', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ rate: 1598 }),
    });

    const { result } = renderHook(() => useFxRate());

    await act(async () => {
      await vi.runAllTicks();
    });

    expect(result.current.rate).toBe(1598);
  });

  it('should set flash to true briefly after a rate update', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ rate: 1600 }),
    });

    const { result } = renderHook(() => useFxRate());

    await act(async () => { await vi.runAllTicks(); });

    expect(result.current.flash).toBe(true);

    act(() => { vi.advanceTimersByTime(600); });

    expect(result.current.flash).toBe(false);
  });

  it('should count down secondsUntilRefresh from QUOTE_TTL_SECONDS', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ rate: 1598 }),
    });

    const { result } = renderHook(() => useFxRate());
    await act(async () => { await vi.runAllTicks(); });

    expect(result.current.secondsUntilRefresh).toBe(QUOTE_TTL_SECONDS);

    act(() => { vi.advanceTimersByTime(5000); });

    expect(result.current.secondsUntilRefresh).toBe(QUOTE_TTL_SECONDS - 5);
  });

  it('should mark isStale when countdown reaches 0', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ rate: 1598 }),
    });

    const { result } = renderHook(() => useFxRate());
    await act(async () => { await vi.runAllTicks(); });

    expect(result.current.isStale).toBe(false);

    act(() => { vi.advanceTimersByTime(QUOTE_TTL_SECONDS * 1000); });

    expect(result.current.isStale).toBe(true);
  });

  it('should silently ignore a failed fetch', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    const { result } = renderHook(() => useFxRate());

    await act(async () => { await vi.runAllTicks(); });

    expect(result.current.rate).toBeNull();
    // Should not throw
  });

  it('should not fetch when document is hidden', async () => {
    Object.defineProperty(document, 'visibilityState', { writable: true, value: 'hidden' });
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ rate: 1598 }) });

    renderHook(() => useFxRate());

    await act(async () => { await vi.runAllTicks(); });

    expect(mockFetch).not.toHaveBeenCalled();
  });
});
