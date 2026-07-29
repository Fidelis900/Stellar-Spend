import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePollPayoutStatus } from '../usePollPayoutStatus';

vi.mock('@/lib/polling/polling-manager', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/polling/polling-manager')>();
  return {
    ...actual,
    usePollingManager: vi.fn(() => ({
      start: vi.fn(),
    })),
  };
});

vi.mock('@/lib/transaction-storage', () => ({
  TransactionStorage: {
    update: vi.fn(),
  },
}));

describe('usePollPayoutStatus', () => {
  let mockStart: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { usePollingManager } = await import('@/lib/polling/polling-manager');
    mockStart = vi.fn();
    (usePollingManager as ReturnType<typeof vi.fn>).mockReturnValue({ start: mockStart });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should expose a pollPayoutStatus function', () => {
    const { result } = renderHook(() => usePollPayoutStatus());
    expect(typeof result.current.pollPayoutStatus).toBe('function');
  });

  it('should call onSettling when status is "validated"', async () => {
    mockStart.mockResolvedValueOnce({ status: 'validated', id: 'order-1', isTerminal: true });

    const { result } = renderHook(() => usePollPayoutStatus());
    const onSettling = vi.fn();
    const onStepChange = vi.fn();

    await act(async () => {
      await result.current.pollPayoutStatus('order-1', {
        transactionId: 'tx-1',
        onStepChange,
        onSettling,
      });
    });

    expect(onSettling).toHaveBeenCalledTimes(1);
  });

  it('should call onSettling when status is "settled"', async () => {
    mockStart.mockResolvedValueOnce({ status: 'settled', id: 'order-1', isTerminal: true });

    const { result } = renderHook(() => usePollPayoutStatus());
    const onSettling = vi.fn();
    const onStepChange = vi.fn();

    await act(async () => {
      await result.current.pollPayoutStatus('order-1', {
        transactionId: 'tx-1',
        onStepChange,
        onSettling,
      });
    });

    expect(onSettling).toHaveBeenCalledTimes(1);
  });

  it('should throw a descriptive error when status is "refunded"', async () => {
    mockStart.mockResolvedValueOnce({ status: 'refunded', id: 'order-1', isTerminal: true });

    const { result } = renderHook(() => usePollPayoutStatus());
    const onStepChange = vi.fn();

    await act(async () => {
      await expect(
        result.current.pollPayoutStatus('order-1', { transactionId: 'tx-1', onStepChange }),
      ).rejects.toThrow(/refunded/i);
    });
  });

  it('should throw a descriptive error when status is "expired"', async () => {
    mockStart.mockResolvedValueOnce({ status: 'expired', id: 'order-1', isTerminal: true });

    const { result } = renderHook(() => usePollPayoutStatus());
    const onStepChange = vi.fn();

    await act(async () => {
      await expect(
        result.current.pollPayoutStatus('order-1', { transactionId: 'tx-1', onStepChange }),
      ).rejects.toThrow(/expired/i);
    });
  });

  it('should throw "Payout polling timeout" on DurationExceededError', async () => {
    const { DurationExceededError } = await import('@/lib/polling/polling-manager');
    mockStart.mockRejectedValueOnce(new DurationExceededError('timed out'));

    const { result } = renderHook(() => usePollPayoutStatus());
    const onStepChange = vi.fn();

    await act(async () => {
      await expect(
        result.current.pollPayoutStatus('order-1', { transactionId: 'tx-1', onStepChange }),
      ).rejects.toThrow(/timeout/i);
    });
  });

  it('should throw a connectivity error on ConsecutiveErrorsExceededError', async () => {
    const { ConsecutiveErrorsExceededError } = await import('@/lib/polling/polling-manager');
    mockStart.mockRejectedValueOnce(new ConsecutiveErrorsExceededError('consecutive'));

    const { result } = renderHook(() => usePollPayoutStatus());
    const onStepChange = vi.fn();

    await act(async () => {
      await expect(
        result.current.pollPayoutStatus('order-1', { transactionId: 'tx-1', onStepChange }),
      ).rejects.toThrow(/network errors/i);
    });
  });
});
