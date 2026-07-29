/**
 * Tests for useFeatureFlag hook (#835)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useFeatureFlag } from '../useFeatureFlag';

const mockFetch = vi.fn();

describe('useFeatureFlag', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('should start in loading state with no flags', () => {
    mockFetch.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useFeatureFlag());
    expect(result.current.isLoading).toBe(true);
    expect(result.current.flags).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('should load flags from the API and set isLoading = false', async () => {
    const flagData = { onramp: { enabled: true }, offRamp: { enabled: false } };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: flagData }),
    });

    const { result } = renderHook(() => useFeatureFlag());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.flags).toEqual(flagData);
    expect(result.current.error).toBeNull();
  });

  it('should append userId as a query param when provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: {} }),
    });

    renderHook(() => useFeatureFlag('user-42'));

    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('userId=user-42'),
      ),
    );
  });

  it('should set error state when fetch fails (non-ok response)', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });

    const { result } = renderHook(() => useFeatureFlag());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toMatch(/feature flags/i);
  });

  it('should set error state when fetch throws a network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useFeatureFlag());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error?.message).toBe('Network error');
  });

  it('isEnabled should return true for a deeply nested enabled flag', async () => {
    const flagData = { payments: { crypto: { enabled: true } } };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: flagData }),
    });

    const { result } = renderHook(() => useFeatureFlag());

    await waitFor(() => expect(result.current.flags).not.toBeNull());

    expect(result.current.isEnabled('payments.crypto')).toBe(true);
  });

  it('isEnabled should return false for a non-existent flag path', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: {} }),
    });

    const { result } = renderHook(() => useFeatureFlag());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isEnabled('missing.flag')).toBe(false);
  });

  it('isEnabled should return false before flags are loaded', () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useFeatureFlag());
    expect(result.current.isEnabled('anything')).toBe(false);
  });

  it('isEnabled should return false when flags is null', () => {
    mockFetch.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useFeatureFlag());
    expect(result.current.isEnabled('any.flag')).toBe(false);
  });

  it('isEnabled should return the boolean value directly for a flag set to true', async () => {
    const flagData = { darkMode: true };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: flagData }),
    });

    const { result } = renderHook(() => useFeatureFlag());

    await waitFor(() => expect(result.current.flags).not.toBeNull());

    expect(result.current.isEnabled('darkMode')).toBe(true);
  });
});
