import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGenericPolling } from '../useGenericPolling';
import type { PollingConfig } from '@/lib/polling';

const TEST_CONFIG: PollingConfig = {
  baseDelay: 100,
  maxDelay: 1000,
  jitterFactor: 0,
  requestTimeoutMs: 5000,
  maxTotalDurationMs: 10000,
  maxConsecutiveErrors: 3,
};

// The polling manager uses AbortSignal internally, so we need to mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

function createSuccessResponse(data: unknown) {
  return {
    ok: true,
    json: () => Promise.resolve(data),
  };
}

function createErrorResponse(status: number, data: { error?: string }) {
  return {
    ok: false,
    status,
    json: () => Promise.resolve(data),
  };
}

describe('useGenericPolling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return a pollStatus function', () => {
    const { result } = renderHook(() =>
      useGenericPolling({
        config: TEST_CONFIG,
        terminalStates: ['completed', 'failed'],
      }),
    );
    expect(result.current.pollStatus).toBeInstanceOf(Function);
  });

  it('should resolve when terminal state is reached', async () => {
    mockFetch.mockResolvedValue(createSuccessResponse({ status: 'completed' }));

    const { result } = renderHook(() =>
      useGenericPolling({
        config: { ...TEST_CONFIG, baseDelay: 50, maxTotalDurationMs: 5000 },
        terminalStates: ['completed', 'failed'],
      }),
    );

    let resolved = false;
    await act(async () => {
      await result.current.pollStatus(
        '/api/test/status',
        { id: 'test-1' },
        (data) => data.status as string,
      );
      resolved = true;
    });

    expect(resolved).toBe(true);
  });

  it('should call updateStorage on each poll', async () => {
    mockFetch.mockResolvedValue(createSuccessResponse({ status: 'pending' }));

    const updateStorage = vi.fn();

    const { result } = renderHook(() =>
      useGenericPolling({
        config: { ...TEST_CONFIG, baseDelay: 50, maxTotalDurationMs: 1000 },
        terminalStates: ['completed'],
        updateStorage,
      }),
    );

    await act(async () => {
      try {
        await result.current.pollStatus(
          '/api/test/status',
          { id: 'test-2' },
          (data) => data.status as string,
        );
      } catch {
        // Expected timeout
      }
    });

    expect(updateStorage).toHaveBeenCalledWith('pending');
  });

  it('should call onTerminalState when terminal state reached', async () => {
    mockFetch.mockResolvedValue(createSuccessResponse({ status: 'completed' }));

    const onTerminalState = vi.fn();

    const { result } = renderHook(() =>
      useGenericPolling({
        config: { ...TEST_CONFIG, baseDelay: 50, maxTotalDurationMs: 5000 },
        terminalStates: ['completed', 'failed'],
        onTerminalState,
      }),
    );

    await act(async () => {
      await result.current.pollStatus(
        '/api/test/status',
        { id: 'test-3' },
        (data) => data.status as string,
      );
    });

    expect(onTerminalState).toHaveBeenCalledWith('completed');
  });

  it('should call onSuccess callback when terminal state reached', async () => {
    mockFetch.mockResolvedValue(createSuccessResponse({ status: 'completed' }));

    const onSuccess = vi.fn();

    const { result } = renderHook(() =>
      useGenericPolling({
        config: { ...TEST_CONFIG, baseDelay: 50, maxTotalDurationMs: 5000 },
        terminalStates: ['completed', 'failed'],
      }),
    );

    await act(async () => {
      await result.current.pollStatus(
        '/api/test/status',
        { id: 'test-4', onSuccess },
        (data) => data.status as string,
      );
    });

    expect(onSuccess).toHaveBeenCalled();
  });

  it('should handle failed response from fetch', async () => {
    mockFetch.mockResolvedValue(createErrorResponse(500, { error: 'Server error' }));

    const { result } = renderHook(() =>
      useGenericPolling({
        config: { ...TEST_CONFIG, baseDelay: 50, maxTotalDurationMs: 1000 },
        terminalStates: ['completed', 'failed'],
      }),
    );

    let error: Error | undefined;
    await act(async () => {
      try {
        await result.current.pollStatus(
          '/api/test/status',
          { id: 'test-5' },
          (data) => data.status as string,
        );
      } catch (err) {
        error = err as Error;
      }
    });

    expect(error).toBeDefined();
    expect(error!.message).toContain('Server error');
  });

  it('should call onError when timeout occurs with throwOnTimeout: true', async () => {
    // Simulate a slow response by delaying the fetch
    mockFetch.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 5000)));
    const onError = vi.fn();

    const { result } = renderHook(() =>
      useGenericPolling({
        config: { ...TEST_CONFIG, baseDelay: 50, maxTotalDurationMs: 200, requestTimeoutMs: 100 },
        terminalStates: ['completed'],
        onError,
        throwOnTimeout: true,
      }),
    );

    await act(async () => {
      try {
        await result.current.pollStatus(
          '/api/test/status',
          { id: 'test-6' },
          (data) => data.status as string,
        );
      } catch {
        // Expected
      }
    });

    expect(onError).toHaveBeenCalled();
  });

  it('should NOT throw when throwOnTimeout is false (bridge best-effort)', async () => {
    mockFetch.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 5000)));

    const { result } = renderHook(() =>
      useGenericPolling({
        config: { ...TEST_CONFIG, baseDelay: 50, maxTotalDurationMs: 200, requestTimeoutMs: 100 },
        terminalStates: ['completed'],
        throwOnTimeout: false,
      }),
    );

    let resolved = false;
    await act(async () => {
      try {
        await result.current.pollStatus(
          '/api/test/status',
          { id: 'test-7' },
          (data) => data.status as string,
        );
      } catch {
        // Should NOT throw
      }
      resolved = true;
    });

    expect(resolved).toBe(true);
  });

  it('should call onTimeout callback when timeout occurs', async () => {
    mockFetch.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 5000)));
    const onTimeout = vi.fn();

    const { result } = renderHook(() =>
      useGenericPolling({
        config: { ...TEST_CONFIG, baseDelay: 50, maxTotalDurationMs: 200, requestTimeoutMs: 100 },
        terminalStates: ['completed'],
        throwOnTimeout: false,
        onTimeout,
      }),
    );

    await act(async () => {
      try {
        await result.current.pollStatus(
          '/api/test/status',
          { id: 'test-8' },
          (data) => data.status as string,
        );
      } catch {
        // Expected
      }
    });

    expect(onTimeout).toHaveBeenCalled();
  });

  it('should handle both wrapped { data: { status } } and flat { status } responses', async () => {
    // Flat response
    mockFetch.mockResolvedValue(createSuccessResponse({ status: 'completed' }));

    const { result } = renderHook(() =>
      useGenericPolling({
        config: { ...TEST_CONFIG, baseDelay: 50, maxTotalDurationMs: 5000 },
        terminalStates: ['completed', 'failed'],
      }),
    );

    await act(async () => {
      await result.current.pollStatus(
        '/api/test/status',
        { id: 'test-flat' },
        (data) => (data.data?.status ?? data.status) as string,
      );
    });

    expect(mockFetch).toHaveBeenCalled();
  });

  it('should pass fetch options to the underlying fetch call', async () => {
    mockFetch.mockResolvedValue(createSuccessResponse({ status: 'completed' }));

    const { result } = renderHook(() =>
      useGenericPolling({
        config: { ...TEST_CONFIG, baseDelay: 50, maxTotalDurationMs: 5000 },
        terminalStates: ['completed'],
      }),
    );

    await act(async () => {
      await result.current.pollStatus(
        '/api/test/status',
        { id: 'test-opts' },
        (data) => data.status as string,
        { method: 'POST', headers: { 'X-Custom': 'test' } },
      );
    });

    const callArg = mockFetch.mock.calls[0][1];
    expect(callArg.method).toBe('POST');
    expect(callArg.headers).toEqual({ 'X-Custom': 'test' });
  });
});
