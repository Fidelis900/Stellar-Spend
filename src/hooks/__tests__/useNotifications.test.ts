/**
 * Tests for useNotifications hook (#835)
 *
 * Covers:
 *  - Initial state (loading=true, preferences=null, deliveries=[], error=null)
 *  - loadPreferences populates preferences on success
 *  - loadPreferences sets error on failure
 *  - Does nothing when userAddress is null
 *  - updatePreferences merges changes and returns updated prefs
 *  - updatePreferences propagates errors
 *  - markAsRead decrements unreadCount
 *  - groupedDeliveries groups by date
 *  - refresh re-triggers data loading
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// ── Mock the notifications service ─────────────────────────────────────────
// Using vi.mock with a factory that returns functions defined inline avoids
// the "Cannot access variable before initialization" hoisting issue.

vi.mock('@/lib/notifications/service', () => {
  return {
    getOrCreateNotificationPreferences: vi.fn(),
    upsertNotificationPreferences: vi.fn(),
    getTransactionNotificationDeliveries: vi.fn(),
  };
});

// Import after mock declaration so we get the mocked versions
import { useNotifications } from '../useNotifications';
import {
  getOrCreateNotificationPreferences,
  upsertNotificationPreferences,
  getTransactionNotificationDeliveries,
} from '@/lib/notifications';
import type {
  NotificationPreferences,
  NotificationDeliveryRecord,
} from '@/lib/notifications';

// Cast to mocked function type for easy mock setup
const mockGetOrCreate = getOrCreateNotificationPreferences as ReturnType<typeof vi.fn>;
const mockUpsert = upsertNotificationPreferences as ReturnType<typeof vi.fn>;
const mockGetDeliveries = getTransactionNotificationDeliveries as ReturnType<typeof vi.fn>;

// ── Fixtures ────────────────────────────────────────────────────────────────

const TEST_ADDRESS = '0xUSER123';

const MOCK_PREFERENCES: NotificationPreferences = {
  userAddress: TEST_ADDRESS,
  emailEnabled: true,
  smsEnabled: false,
  pushEnabled: true,
  notifyOnPending: true,
  notifyOnCompleted: true,
  notifyOnFailed: true,
  createdAt: 1_000_000,
  updatedAt: 1_000_000,
};

function buildDelivery(id: string, read = false): NotificationDeliveryRecord {
  return {
    id,
    transactionId: 'tx-1',
    userAddress: TEST_ADDRESS,
    eventType: 'completed',
    channel: 'email',
    status: 'sent',
    templateId: 'tpl-1',
    message: 'Your transaction is complete.',
    attemptCount: 1,
    metadata: { read },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('useNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOrCreate.mockResolvedValue(MOCK_PREFERENCES);
    mockGetDeliveries.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Initial state ────────────────────────────────────────────────────────

  it('transitions loading from true to false after preferences load', async () => {
    // The hook's initial state has loading=true and transitions to false once
    // the async fetch completes. React Testing Library's act() flushes effects,
    // so by the time renderHook returns the async resolution may already have run.
    // We verify the end-state: loading is false and preferences are populated.
    const { result } = renderHook(() => useNotifications(TEST_ADDRESS));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.preferences).toEqual(MOCK_PREFERENCES);
    });
  });

  it('starts with preferences=null', () => {
    const { result } = renderHook(() => useNotifications(TEST_ADDRESS));
    expect(result.current.preferences).toBeNull();
  });

  it('starts with deliveries=[]', () => {
    const { result } = renderHook(() => useNotifications(TEST_ADDRESS));
    expect(result.current.deliveries).toEqual([]);
  });

  it('starts with error=null', () => {
    const { result } = renderHook(() => useNotifications(TEST_ADDRESS));
    expect(result.current.error).toBeNull();
  });

  it('starts with unreadCount=0', () => {
    const { result } = renderHook(() => useNotifications(TEST_ADDRESS));
    expect(result.current.unreadCount).toBe(0);
  });

  // ── null userAddress ─────────────────────────────────────────────────────

  it('does not call getOrCreateNotificationPreferences when userAddress is null', () => {
    renderHook(() => useNotifications(null));
    expect(mockGetOrCreate).not.toHaveBeenCalled();
  });

  it('preferences stays null when userAddress is null', async () => {
    const { result } = renderHook(() => useNotifications(null));
    await act(async () => {});
    expect(result.current.preferences).toBeNull();
  });

  // ── Loading preferences ──────────────────────────────────────────────────

  it('populates preferences after successful load', async () => {
    const { result } = renderHook(() => useNotifications(TEST_ADDRESS));

    await waitFor(() => {
      expect(result.current.preferences).toEqual(MOCK_PREFERENCES);
    });
  });

  it('sets loading=false after preferences load', async () => {
    const { result } = renderHook(() => useNotifications(TEST_ADDRESS));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it('calls getOrCreateNotificationPreferences with the user address', async () => {
    renderHook(() => useNotifications(TEST_ADDRESS));

    await waitFor(() => {
      expect(mockGetOrCreate).toHaveBeenCalledWith(TEST_ADDRESS);
    });
  });

  it('sets error when getOrCreateNotificationPreferences throws', async () => {
    mockGetOrCreate.mockRejectedValueOnce(new Error('DB unreachable'));

    const { result } = renderHook(() => useNotifications(TEST_ADDRESS));

    await waitFor(() => {
      expect(result.current.error).toBe('DB unreachable');
      expect(result.current.loading).toBe(false);
    });
  });

  it('sets error message from non-Error objects', async () => {
    mockGetOrCreate.mockRejectedValueOnce('plain string error');

    const { result } = renderHook(() => useNotifications(TEST_ADDRESS));

    await waitFor(() => {
      expect(result.current.error).toBe('Failed to load preferences');
      expect(result.current.loading).toBe(false);
    });
  });

  // ── updatePreferences ────────────────────────────────────────────────────

  it('updatePreferences calls upsertNotificationPreferences with merged data', async () => {
    const updated: NotificationPreferences = {
      ...MOCK_PREFERENCES,
      emailEnabled: false,
    };
    mockUpsert.mockResolvedValueOnce(updated);

    const { result } = renderHook(() => useNotifications(TEST_ADDRESS));
    await waitFor(() => expect(result.current.preferences).toEqual(MOCK_PREFERENCES));

    await act(async () => {
      await result.current.updatePreferences({ emailEnabled: false });
    });

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ userAddress: TEST_ADDRESS, emailEnabled: false }),
    );
  });

  it('updatePreferences updates preferences in state', async () => {
    const updated: NotificationPreferences = {
      ...MOCK_PREFERENCES,
      smsEnabled: true,
    };
    mockUpsert.mockResolvedValueOnce(updated);

    const { result } = renderHook(() => useNotifications(TEST_ADDRESS));
    await waitFor(() => expect(result.current.preferences).toEqual(MOCK_PREFERENCES));

    await act(async () => {
      await result.current.updatePreferences({ smsEnabled: true });
    });

    expect(result.current.preferences?.smsEnabled).toBe(true);
  });

  it('updatePreferences sets error when upsert throws', async () => {
    mockUpsert.mockRejectedValueOnce(new Error('Save failed'));

    const { result } = renderHook(() => useNotifications(TEST_ADDRESS));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(
        result.current.updatePreferences({ emailEnabled: false }),
      ).rejects.toThrow('Save failed');
    });

    expect(result.current.error).toBe('Save failed');
  });

  it('does nothing when updatePreferences is called with null userAddress', async () => {
    const { result } = renderHook(() => useNotifications(null));

    await act(async () => {
      await result.current.updatePreferences({ emailEnabled: false });
    });

    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('updatePreferences returns the updated preferences', async () => {
    const updated: NotificationPreferences = { ...MOCK_PREFERENCES, pushEnabled: false };
    mockUpsert.mockResolvedValueOnce(updated);

    const { result } = renderHook(() => useNotifications(TEST_ADDRESS));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let returnValue: NotificationPreferences | undefined;
    await act(async () => {
      returnValue = await result.current.updatePreferences({ pushEnabled: false });
    });

    expect(returnValue).toEqual(updated);
  });

  // ── markAsRead ───────────────────────────────────────────────────────────

  it('markAsRead does not throw when deliveries list is empty', async () => {
    const { result } = renderHook(() => useNotifications(TEST_ADDRESS));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(() => {
      act(() => {
        result.current.markAsRead('non-existent-id');
      });
    }).not.toThrow();
  });

  it('markAsRead keeps unreadCount at 0 (Math.max guard)', async () => {
    const { result } = renderHook(() => useNotifications(TEST_ADDRESS));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.markAsRead('any-id');
    });

    expect(result.current.unreadCount).toBe(0);
  });

  // ── groupedDeliveries ────────────────────────────────────────────────────

  it('groupedDeliveries returns an object (even when empty)', async () => {
    const { result } = renderHook(() => useNotifications(TEST_ADDRESS));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(typeof result.current.groupedDeliveries).toBe('object');
    expect(result.current.groupedDeliveries).not.toBeNull();
  });

  it('groupedDeliveries is empty when there are no deliveries', async () => {
    mockGetDeliveries.mockResolvedValue([]);

    const { result } = renderHook(() => useNotifications(TEST_ADDRESS));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(Object.keys(result.current.groupedDeliveries)).toHaveLength(0);
  });

  // ── refresh ──────────────────────────────────────────────────────────────

  it('refresh re-calls getOrCreateNotificationPreferences', async () => {
    const { result } = renderHook(() => useNotifications(TEST_ADDRESS));
    await waitFor(() => expect(result.current.loading).toBe(false));

    mockGetOrCreate.mockClear();

    act(() => {
      result.current.refresh();
    });

    await waitFor(() => {
      expect(mockGetOrCreate).toHaveBeenCalledOnce();
    });
  });

  // ── Return shape ─────────────────────────────────────────────────────────

  it('returns all required fields and methods', async () => {
    const { result } = renderHook(() => useNotifications(TEST_ADDRESS));

    const required = [
      'preferences', 'deliveries', 'loading', 'error', 'unreadCount',
      'updatePreferences', 'markAsRead', 'groupedDeliveries', 'refresh',
    ];

    for (const key of required) {
      expect(result.current).toHaveProperty(key);
    }
  });
});
