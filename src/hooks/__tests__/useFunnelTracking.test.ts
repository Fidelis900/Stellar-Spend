import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFunnelTracking } from '../useFunnelTracking';

const mockSendBeacon = vi.fn();

describe('useFunnelTracking', () => {
  beforeEach(() => {
    sessionStorage.clear();
    Object.defineProperty(navigator, 'sendBeacon', {
      writable: true,
      value: mockSendBeacon,
    });
    mockSendBeacon.mockReturnValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should expose a trackStep function', () => {
    const { result } = renderHook(() => useFunnelTracking());
    expect(typeof result.current.trackStep).toBe('function');
  });

  it('should call navigator.sendBeacon when tracking a step', () => {
    const { result } = renderHook(() => useFunnelTracking());

    act(() => {
      result.current.trackStep('wallet_connect');
    });

    expect(mockSendBeacon).toHaveBeenCalledTimes(1);
    const [url, blob] = mockSendBeacon.mock.calls[0];
    expect(url).toMatch(/\/api\/monitoring\/vitals/);
    expect(blob).toBeInstanceOf(Blob);
  });

  it('should create a new session when the step is "wallet_connect"', async () => {
    const { result } = renderHook(() => useFunnelTracking());

    act(() => { result.current.trackStep('wallet_connect'); });

    const stored = sessionStorage.getItem('funnel_session');
    expect(stored).not.toBeNull();
    const session = JSON.parse(stored!);
    expect(session).toHaveProperty('sessionId');
    expect(session.steps).toHaveLength(1);
  });

  it('should accumulate steps within the same session', () => {
    const { result } = renderHook(() => useFunnelTracking());

    act(() => {
      result.current.trackStep('wallet_connect');
      result.current.trackStep('amount_entered');
      result.current.trackStep('bank_details');
    });

    expect(mockSendBeacon).toHaveBeenCalledTimes(3);
  });

  it('should reset the session when "wallet_connect" is tracked again', () => {
    const { result } = renderHook(() => useFunnelTracking());

    act(() => {
      result.current.trackStep('wallet_connect');
      result.current.trackStep('amount_entered');
    });

    const firstSession = JSON.parse(sessionStorage.getItem('funnel_session')!);

    act(() => {
      result.current.trackStep('wallet_connect'); // starts a new session
    });

    const newSession = JSON.parse(sessionStorage.getItem('funnel_session')!);
    expect(newSession.sessionId).not.toBe(firstSession.sessionId);
  });

  it('should fall back to fetch when sendBeacon is unavailable', async () => {
    Object.defineProperty(navigator, 'sendBeacon', { writable: true, value: undefined });
    const mockFetch = vi.fn().mockResolvedValueOnce({ ok: true });
    vi.stubGlobal('fetch', mockFetch);

    const { result } = renderHook(() => useFunnelTracking());

    act(() => { result.current.trackStep('wallet_connect'); });

    // fetch is called async (fire-and-forget)
    await act(async () => { await vi.runAllTicks(); });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/monitoring/vitals',
      expect.objectContaining({ method: 'POST' }),
    );

    vi.unstubAllGlobals();
  });
});
