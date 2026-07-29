import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePollBridgeStatus } from '../usePollBridgeStatus';

// Mock the polling-manager so we control start() behaviour
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

describe('usePollBridgeStatus', () => {
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

  it('should expose a pollBridgeStatus function', () => {
    const { result } = renderHook(() => usePollBridgeStatus());
    expect(typeof result.current.pollBridgeStatus).toBe('function');
  });

  it('should call onBridgeComplete when status is "completed"', async () => {
    mockStart.mockResolvedValueOnce({ status: 'completed', id: 'tx-hash', isTerminal: true });

    const { result } = renderHook(() => usePollBridgeStatus());
    const onBridgeComplete = vi.fn();

    await act(async () => {
      await result.current.pollBridgeStatus('tx-hash', {
        transactionId: 'local-tx-1',
        onBridgeComplete,
      });
    });

    expect(onBridgeComplete).toHaveBeenCalledTimes(1);
  });

  it('should throw when status is "failed"', async () => {
    mockStart.mockResolvedValueOnce({ status: 'failed', id: 'tx-hash', isTerminal: true });

    const { result } = renderHook(() => usePollBridgeStatus());

    await act(async () => {
      await expect(
        result.current.pollBridgeStatus('tx-hash', { transactionId: 'local-tx-1' }),
      ).rejects.toThrow(/failed/i);
    });
  });

  it('should throw when status is "expired"', async () => {
    mockStart.mockResolvedValueOnce({ status: 'expired', id: 'tx-hash', isTerminal: true });

    const { result } = renderHook(() => usePollBridgeStatus());

    await act(async () => {
      await expect(
        result.current.pollBridgeStatus('tx-hash', { transactionId: 'local-tx-1' }),
      ).rejects.toThrow(/expired/i);
    });
  });

  it('should resolve silently on DurationExceededError (best-effort)', async () => {
    const { DurationExceededError } = await import('@/lib/polling/polling-manager');
    mockStart.mockRejectedValueOnce(new DurationExceededError('timeout'));

    const { result } = renderHook(() => usePollBridgeStatus());

    await act(async () => {
      // Should NOT throw
      await result.current.pollBridgeStatus('tx-hash', { transactionId: 'local-tx-1' });
    });
  });

  it('should resolve silently on ConsecutiveErrorsExceededError', async () => {
    const { ConsecutiveErrorsExceededError } = await import('@/lib/polling/polling-manager');
    mockStart.mockRejectedValueOnce(new ConsecutiveErrorsExceededError('too many errors'));

    const { result } = renderHook(() => usePollBridgeStatus());

    await act(async () => {
      await result.current.pollBridgeStatus('tx-hash', { transactionId: 'local-tx-1' });
    });
  });
});
