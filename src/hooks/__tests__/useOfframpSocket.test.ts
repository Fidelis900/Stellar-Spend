import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOfframpSocket } from '../useOfframpSocket';

// Capture the callbacks passed to connectWebSocket
let capturedOnMessage: ((push: unknown) => void) | null = null;
let capturedOnClose: (() => void) | null = null;
const mockDisconnect = vi.fn();

vi.mock('@/lib/polling/websocket-client', () => ({
  connectWebSocket: vi.fn((
    _id: string,
    onMessage: (push: unknown) => void,
    onClose: () => void,
  ) => {
    capturedOnMessage = onMessage;
    capturedOnClose = onClose;
    return mockDisconnect;
  }),
}));

describe('useOfframpSocket', () => {
  beforeEach(() => {
    capturedOnMessage = null;
    capturedOnClose = null;
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
  });

  it('should start as "disconnected" when id is null', () => {
    const { result } = renderHook(() =>
      useOfframpSocket({ id: null, onStatusUpdate: vi.fn() }),
    );
    expect(result.current.socketState).toBe('disconnected');
    expect(result.current.isConnected).toBe(false);
  });

  it('should start connecting when id and enabled are provided', async () => {
    const { result } = renderHook(() =>
      useOfframpSocket({ id: 'order-1', onStatusUpdate: vi.fn() }),
    );

    // After mount the hook calls connect() synchronously → state is 'connecting'
    expect(result.current.socketState).toBe('connecting');
  });

  it('should transition to "connected" when a message arrives', () => {
    const onStatusUpdate = vi.fn();
    const { result } = renderHook(() =>
      useOfframpSocket({ id: 'order-1', onStatusUpdate }),
    );

    act(() => {
      capturedOnMessage?.({ type: 'status_update', status: 'pending', orderId: 'order-1' });
    });

    expect(result.current.socketState).toBe('connected');
    expect(result.current.isConnected).toBe(true);
    expect(onStatusUpdate).toHaveBeenCalledTimes(1);
  });

  it('should transition to "disconnected" and schedule reconnect when connection closes', () => {
    const { result } = renderHook(() =>
      useOfframpSocket({ id: 'order-1', onStatusUpdate: vi.fn() }),
    );

    // Simulate a successful connection first so retryCount resets
    act(() => {
      capturedOnMessage?.({ type: 'status_update', status: 'pending', orderId: 'order-1' });
    });

    // Now simulate a disconnect
    act(() => { capturedOnClose?.(); });

    expect(result.current.socketState).toBe('disconnected');
  });

  it('should stay disconnected when enabled = false', () => {
    const { result } = renderHook(() =>
      useOfframpSocket({ id: 'order-1', onStatusUpdate: vi.fn(), enabled: false }),
    );
    expect(result.current.socketState).toBe('disconnected');
  });

  it('should call the disconnect function on unmount', () => {
    const { unmount } = renderHook(() =>
      useOfframpSocket({ id: 'order-1', onStatusUpdate: vi.fn() }),
    );

    unmount();

    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  it('should always call the latest onStatusUpdate callback (stable ref)', () => {
    const firstCallback = vi.fn();
    const secondCallback = vi.fn();

    const { rerender } = renderHook(
      ({ cb }: { cb: typeof firstCallback }) =>
        useOfframpSocket({ id: 'order-1', onStatusUpdate: cb }),
      { initialProps: { cb: firstCallback } },
    );

    rerender({ cb: secondCallback });

    act(() => {
      capturedOnMessage?.({ type: 'status_update', status: 'pending', orderId: 'order-1' });
    });

    expect(secondCallback).toHaveBeenCalledTimes(1);
    expect(firstCallback).not.toHaveBeenCalled();
  });
});
