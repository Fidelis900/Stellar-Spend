import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useClipboard } from '../useClipboard';

describe('useClipboard', () => {
  const mockWriteText = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, 'clipboard', {
      writable: true,
      value: { writeText: mockWriteText },
    });
    mockWriteText.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should initialise with isCopied = false', () => {
    const { result } = renderHook(() => useClipboard());
    expect(result.current.isCopied).toBe(false);
  });

  it('should set isCopied to true after successful copy', async () => {
    const { result } = renderHook(() => useClipboard());

    await act(async () => {
      const success = await result.current.copy('hello world');
      expect(success).toBe(true);
    });

    expect(result.current.isCopied).toBe(true);
  });

  it('should reset isCopied to false after the timeout', async () => {
    const { result } = renderHook(() => useClipboard(500));

    await act(async () => {
      await result.current.copy('text');
    });
    expect(result.current.isCopied).toBe(true);

    act(() => { vi.advanceTimersByTime(500); });
    expect(result.current.isCopied).toBe(false);
  });

  it('should return false and not set isCopied when clipboard is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', { writable: true, value: undefined });
    const { result } = renderHook(() => useClipboard());

    await act(async () => {
      const success = await result.current.copy('text');
      expect(success).toBe(false);
    });

    expect(result.current.isCopied).toBe(false);
  });

  it('should return false when clipboard.writeText rejects', async () => {
    mockWriteText.mockRejectedValueOnce(new Error('Permission denied'));
    const { result } = renderHook(() => useClipboard());

    await act(async () => {
      const success = await result.current.copy('text');
      expect(success).toBe(false);
    });

    expect(result.current.isCopied).toBe(false);
  });

  it('should respect a custom timeout value', async () => {
    const { result } = renderHook(() => useClipboard(1000));

    await act(async () => { await result.current.copy('text'); });
    expect(result.current.isCopied).toBe(true);

    act(() => { vi.advanceTimersByTime(999); });
    expect(result.current.isCopied).toBe(true);

    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current.isCopied).toBe(false);
  });
});
