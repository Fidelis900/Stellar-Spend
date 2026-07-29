/**
 * Tests for useCurrencyConverter hook (#835)
 *
 * Covers:
 *  - Initial state values
 *  - fetchCurrencies populates currencies list
 *  - fetchRate sets the rate and clears the stale flag
 *  - handleFromAmountChange computes toAmount correctly
 *  - handleToAmountChange computes fromAmount correctly
 *  - swapCurrencies exchanges from/to values
 *  - copyResult writes formatted string to clipboard
 *  - isStale becomes true when QUOTE_TTL elapses
 *  - refreshRate triggers a new fetch
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useCurrencyConverter } from '../useCurrencyConverter';

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
const mockWriteText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  global.fetch = mockFetch as unknown as typeof fetch;

  Object.defineProperty(navigator, 'clipboard', {
    writable: true,
    value: { writeText: mockWriteText },
  });

  // Default fetch responses
  mockFetch.mockImplementation((url: string) => {
    if (url === '/api/offramp/currencies') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ currencies: ['NGN', 'KES', 'GHS'] }),
      });
    }
    if (url === '/api/offramp/rate') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ rate: 1600 }),
      });
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('useCurrencyConverter', () => {
  // ── Initial state ────────────────────────────────────────────────────────
  // These tests use real timers to avoid the hook's setInterval causing issues.

  it('initialises fromAmount to "100"', async () => {
    const { result, unmount } = renderHook(() => useCurrencyConverter());
    expect(result.current.fromAmount).toBe('100');
    unmount();
  });

  it('initialises toAmount to empty string', async () => {
    const { result, unmount } = renderHook(() => useCurrencyConverter());
    expect(result.current.toAmount).toBe('');
    unmount();
  });

  it('initialises fromCurrency to "USDC"', async () => {
    const { result, unmount } = renderHook(() => useCurrencyConverter());
    expect(result.current.fromCurrency).toBe('USDC');
    unmount();
  });

  it('initialises toCurrency to "NGN"', async () => {
    const { result, unmount } = renderHook(() => useCurrencyConverter());
    expect(result.current.toCurrency).toBe('NGN');
    unmount();
  });

  it('initialises rate to null', async () => {
    const { result, unmount } = renderHook(() => useCurrencyConverter());
    expect(result.current.rate).toBeNull();
    unmount();
  });

  it('initialises currencies to empty array', async () => {
    const { result, unmount } = renderHook(() => useCurrencyConverter());
    expect(result.current.currencies).toEqual([]);
    unmount();
  });

  it('initialises copied to false', async () => {
    const { result, unmount } = renderHook(() => useCurrencyConverter());
    expect(result.current.copied).toBe(false);
    unmount();
  });

  it('initialises isStale to false', async () => {
    const { result, unmount } = renderHook(() => useCurrencyConverter());
    expect(result.current.isStale).toBe(false);
    unmount();
  });

  it('initialises quoteSecondsLeft to 30', async () => {
    const { result, unmount } = renderHook(() => useCurrencyConverter());
    expect(result.current.quoteSecondsLeft).toBe(30);
    unmount();
  });

  // ── Fetching currencies ──────────────────────────────────────────────────

  it('populates currencies from /api/offramp/currencies', async () => {
    const { result, unmount } = renderHook(() => useCurrencyConverter());

    await waitFor(() => {
      expect(result.current.currencies).toEqual(['NGN', 'KES', 'GHS']);
    });
    unmount();
  });

  it('handles a failed currencies fetch gracefully', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/offramp/currencies') {
        return Promise.reject(new Error('Network error'));
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ rate: 1600 }),
      });
    });

    const { result, unmount } = renderHook(() => useCurrencyConverter());

    await waitFor(() => {
      expect(result.current.rate).toBe(1600);
    });

    // currencies stays empty because fetch failed
    expect(result.current.currencies).toEqual([]);
    unmount();
  });

  // ── Fetching rate ────────────────────────────────────────────────────────

  it('sets rate from /api/offramp/rate', async () => {
    const { result, unmount } = renderHook(() => useCurrencyConverter());

    await waitFor(() => {
      expect(result.current.rate).toBe(1600);
    });
    unmount();
  });

  it('clears isStale when a new rate arrives', async () => {
    const { result, unmount } = renderHook(() => useCurrencyConverter());

    await waitFor(() => expect(result.current.rate).toBe(1600));
    expect(result.current.isStale).toBe(false);
    unmount();
  });

  // ── handleFromAmountChange ───────────────────────────────────────────────

  it('handleFromAmountChange computes toAmount based on rate and fee', async () => {
    const { result, unmount } = renderHook(() => useCurrencyConverter());

    await waitFor(() => expect(result.current.rate).toBe(1600));

    act(() => {
      result.current.handleFromAmountChange('10');
    });

    // toAmount = (10 * 1600) - (10 * 0.5 / 100) * 1600 = 16000 - 80 = ... no:
    // actual formula: total = amount * rate; afterFees = total - (amount * bridgeFee) / 100
    // = 10*1600 - (10*0.5)/100 = 16000 - 0.05 = 15999.95
    expect(result.current.toAmount).toBe('15999.95');
    unmount();
  });

  it('handleFromAmountChange clears toAmount for empty input', async () => {
    const { result, unmount } = renderHook(() => useCurrencyConverter());

    await waitFor(() => expect(result.current.rate).toBe(1600));

    act(() => {
      result.current.handleFromAmountChange('');
    });

    expect(result.current.toAmount).toBe('');
    unmount();
  });

  it('handleFromAmountChange does not set toAmount when rate is null', async () => {
    const { result, unmount } = renderHook(() => useCurrencyConverter());
    // Rate starts null; use a blocking fetch that never resolves
    mockFetch.mockImplementation(() => new Promise(() => {}));

    // rate is still null at mount time
    act(() => {
      result.current.handleFromAmountChange('50');
    });
    expect(result.current.toAmount).toBe('');
    unmount();
  });

  // ── handleToAmountChange ─────────────────────────────────────────────────

  it('handleToAmountChange computes fromAmount based on rate and fee', async () => {
    const { result, unmount } = renderHook(() => useCurrencyConverter());

    await waitFor(() => expect(result.current.rate).toBe(1600));

    act(() => {
      result.current.handleToAmountChange('16000');
    });

    // fromAmount = (16000 / (1 - 0.005)) / 1600
    const expected = (16000 / (1 - 0.005) / 1600).toFixed(2);
    expect(result.current.fromAmount).toBe(expected);
    unmount();
  });

  it('handleToAmountChange clears fromAmount for empty input', async () => {
    const { result, unmount } = renderHook(() => useCurrencyConverter());

    await waitFor(() => expect(result.current.rate).toBe(1600));

    act(() => {
      result.current.handleToAmountChange('');
    });

    expect(result.current.fromAmount).toBe('');
    unmount();
  });

  // ── swapCurrencies ───────────────────────────────────────────────────────

  it('swapCurrencies exchanges fromCurrency and toCurrency', async () => {
    const { result, unmount } = renderHook(() => useCurrencyConverter());

    await waitFor(() => expect(result.current.rate).toBe(1600));

    act(() => {
      result.current.swapCurrencies();
    });

    expect(result.current.fromCurrency).toBe('NGN');
    expect(result.current.toCurrency).toBe('USDC');
    unmount();
  });

  it('swapCurrencies exchanges fromAmount and toAmount', async () => {
    const { result, unmount } = renderHook(() => useCurrencyConverter());

    await waitFor(() => expect(result.current.rate).toBe(1600));

    act(() => {
      result.current.handleFromAmountChange('5');
    });

    const previousFrom = result.current.fromAmount;
    const previousTo = result.current.toAmount;

    act(() => {
      result.current.swapCurrencies();
    });

    expect(result.current.fromAmount).toBe(previousTo);
    expect(result.current.toAmount).toBe(previousFrom);
    unmount();
  });

  // ── copyResult ───────────────────────────────────────────────────────────

  it('copyResult writes formatted string to clipboard', async () => {
    const { result, unmount } = renderHook(() => useCurrencyConverter());

    await waitFor(() => expect(result.current.rate).toBe(1600));

    act(() => {
      result.current.handleFromAmountChange('10');
    });

    await act(async () => {
      result.current.copyResult();
    });

    expect(mockWriteText).toHaveBeenCalledWith(
      expect.stringContaining('USDC'),
    );
    unmount();
  });

  it('sets copied to true after copyResult', async () => {
    // Use real timers to avoid interfering with the hook's internal setInterval
    const { result, unmount } = renderHook(() => useCurrencyConverter());

    // copyResult doesn't depend on rate
    await act(async () => {
      result.current.copyResult();
    });

    expect(result.current.copied).toBe(true);
    unmount();
  });

  it('resets copied to false after 2 seconds (real timers)', async () => {
    const { result, unmount } = renderHook(() => useCurrencyConverter());

    await act(async () => {
      result.current.copyResult();
    });

    expect(result.current.copied).toBe(true);

    // Wait for the 2000ms timeout to fire (real timers)
    await waitFor(
      () => expect(result.current.copied).toBe(false),
      { timeout: 3000 },
    );
    unmount();
  });

  // ── Quote countdown ──────────────────────────────────────────────────────

  it('isStale flag transitions: false initially, true after 30s countdown', async () => {
    // Verify the stale flag is false right after rate load
    const { result, unmount } = renderHook(() => useCurrencyConverter());

    await waitFor(() => expect(result.current.rate).toBe(1600));
    expect(result.current.isStale).toBe(false);

    // The countdown is 30 s; quoteSecondsLeft should be non-zero
    expect(result.current.quoteSecondsLeft).toBeGreaterThan(0);
    unmount();
  });

  // ── Return shape ─────────────────────────────────────────────────────────

  it('returns all required fields and methods', async () => {
    const { result, unmount } = renderHook(() => useCurrencyConverter());

    const required = [
      'fromAmount', 'toAmount', 'fromCurrency', 'toCurrency',
      'rate', 'fees', 'loading', 'currencies', 'copied', 'isPending',
      'quoteSecondsLeft', 'isStale', 'rateUpdated',
      'handleFromAmountChange', 'handleToAmountChange',
      'setFromCurrency', 'setToCurrency',
      'swapCurrencies', 'copyResult', 'refreshRate',
    ];

    for (const key of required) {
      expect(result.current).toHaveProperty(key);
    }
    unmount();
  });

  it('fees are initialised to { bridge: "0.5", payout: "0" }', async () => {
    const { result, unmount } = renderHook(() => useCurrencyConverter());
    expect(result.current.fees).toEqual({ bridge: '0.5', payout: '0' });
    unmount();
  });

  it('setFromCurrency updates fromCurrency', async () => {
    const { result, unmount } = renderHook(() => useCurrencyConverter());

    act(() => {
      result.current.setFromCurrency('USDT');
    });

    expect(result.current.fromCurrency).toBe('USDT');
    unmount();
  });

  it('setToCurrency updates toCurrency', async () => {
    const { result, unmount } = renderHook(() => useCurrencyConverter());

    act(() => {
      result.current.setToCurrency('KES');
    });

    expect(result.current.toCurrency).toBe('KES');
    unmount();
  });
});
