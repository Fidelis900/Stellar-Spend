import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSyncSettings } from '../useSyncSettings';

vi.mock('@/lib/sync-storage', () => {
  const defaultSettings = {
    syncEnabled: false,
    lastSyncAt: 0,
    lastServerSyncAt: 0,
    conflictResolutionStrategy: 'last-write-wins' as const,
  };

  return {
    SyncStorage: {
      getDefaultSettings: () => ({ ...defaultSettings }),
      getSettings: vi.fn(() => ({ ...defaultSettings })),
      toggleSync: vi.fn((enabled: boolean) => ({ ...defaultSettings, syncEnabled: enabled })),
      getQueue: vi.fn(() => []),
    },
  };
});

const mockFetch = vi.fn();

describe('useSyncSettings', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should load settings on mount', () => {
    const { result } = renderHook(() => useSyncSettings('GCFX...'));
    expect(result.current.settings).toBeDefined();
    expect(result.current.settings.syncEnabled).toBe(false);
  });

  it('should initialise loading as false and error as null', () => {
    const { result } = renderHook(() => useSyncSettings());
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should enable sync and update state when toggleSync succeeds', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    const { result } = renderHook(() => useSyncSettings('GCFX...'));

    let success: boolean | undefined;
    await act(async () => {
      success = await result.current.toggleSync(true);
    });

    expect(success).toBe(true);
    expect(result.current.settings.syncEnabled).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('should return false and set error when no userAddress is provided', async () => {
    const { result } = renderHook(() => useSyncSettings()); // no address

    let success: boolean | undefined;
    await act(async () => {
      success = await result.current.toggleSync(true);
    });

    expect(success).toBe(false);
    expect(result.current.error).toMatch(/address/i);
  });

  it('should return false and set error when the server request fails', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });

    const { result } = renderHook(() => useSyncSettings('GCFX...'));

    let success: boolean | undefined;
    await act(async () => {
      success = await result.current.toggleSync(true);
    });

    expect(success).toBe(false);
    expect(result.current.error).not.toBeNull();
  });

  it('should expose syncStatus with formattedLastSync = "Never" when lastSyncAt is 0', () => {
    const { result } = renderHook(() => useSyncSettings());
    expect(result.current.syncStatus.formattedLastSync).toBe('Never');
  });

  it('should report isPending as false when the queue is empty', () => {
    const { result } = renderHook(() => useSyncSettings());
    expect(result.current.syncStatus.isPending).toBe(false);
  });
});
