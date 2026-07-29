import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useNotificationCenter, type NotificationCenterEvent } from '../useNotificationCenter';

describe('useNotificationCenter', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('initialization', () => {
    it('should initialize with empty state when no user address', () => {
      const { result } = renderHook(() => useNotificationCenter(null));

      expect(result.current.events).toEqual([]);
      expect(result.current.unreadCount).toBe(0);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe('No user address provided');
    });

    it('should initialize with loading state for valid user address', () => {
      const { result } = renderHook(() => useNotificationCenter('GABC123'));

      expect(result.current.loading).toBe(false); // Loads persisted events synchronously
    });
  });

  describe('event management', () => {
    it('should add new event', () => {
      const { result } = renderHook(() => useNotificationCenter('GABC123'));

      const event: NotificationCenterEvent = {
        id: 'test-1',
        type: 'price_alert',
        title: 'Price Alert',
        description: 'Alert triggered',
        read: false,
        createdAt: Date.now(),
      };

      act(() => {
        result.current.addEvent(event);
      });

      expect(result.current.events).toContainEqual(event);
      expect(result.current.unreadCount).toBe(1);
    });

    it('should update existing event by id', () => {
      const { result } = renderHook(() => useNotificationCenter('GABC123'));

      const event1: NotificationCenterEvent = {
        id: 'test-1',
        type: 'price_alert',
        title: 'Alert 1',
        description: 'Description',
        read: false,
        createdAt: Date.now(),
      };

      act(() => {
        result.current.addEvent(event1);
      });

      const updatedEvent: NotificationCenterEvent = {
        ...event1,
        title: 'Updated Alert',
        read: true,
      };

      act(() => {
        result.current.addEvent(updatedEvent);
      });

      expect(result.current.events).toHaveLength(1);
      expect(result.current.events[0].title).toBe('Updated Alert');
    });

    it('should mark event as read', () => {
      const { result } = renderHook(() => useNotificationCenter('GABC123'));

      const event: NotificationCenterEvent = {
        id: 'test-1',
        type: 'price_alert',
        title: 'Alert',
        description: 'Description',
        read: false,
        createdAt: Date.now(),
      };

      act(() => {
        result.current.addEvent(event);
      });

      expect(result.current.unreadCount).toBe(1);

      act(() => {
        result.current.markAsRead('test-1');
      });

      expect(result.current.unreadCount).toBe(0);
      expect(result.current.events[0].read).toBe(true);
    });

    it('should mark all events as read', () => {
      const { result } = renderHook(() => useNotificationCenter('GABC123'));

      const events: NotificationCenterEvent[] = [
        {
          id: 'test-1',
          type: 'price_alert',
          title: 'Alert 1',
          description: 'Desc 1',
          read: false,
          createdAt: Date.now(),
        },
        {
          id: 'test-2',
          type: 'transaction_update',
          title: 'Update',
          description: 'Desc 2',
          read: false,
          createdAt: Date.now(),
        },
      ];

      act(() => {
        events.forEach((e) => result.current.addEvent(e));
      });

      expect(result.current.unreadCount).toBe(2);

      act(() => {
        result.current.markAllAsRead();
      });

      expect(result.current.unreadCount).toBe(0);
      expect(result.current.events.every((e) => e.read)).toBe(true);
    });

    it('should remove event', () => {
      const { result } = renderHook(() => useNotificationCenter('GABC123'));

      const event: NotificationCenterEvent = {
        id: 'test-1',
        type: 'price_alert',
        title: 'Alert',
        description: 'Description',
        read: false,
        createdAt: Date.now(),
      };

      act(() => {
        result.current.addEvent(event);
      });

      expect(result.current.events).toHaveLength(1);

      act(() => {
        result.current.removeEvent('test-1');
      });

      expect(result.current.events).toHaveLength(0);
    });

    it('should clear all events', () => {
      const { result } = renderHook(() => useNotificationCenter('GABC123'));

      act(() => {
        result.current.addEvent({
          id: 'test-1',
          type: 'price_alert',
          title: 'Alert 1',
          description: 'Desc 1',
          read: false,
          createdAt: Date.now(),
        });
        result.current.addEvent({
          id: 'test-2',
          type: 'transaction_update',
          title: 'Alert 2',
          description: 'Desc 2',
          read: false,
          createdAt: Date.now(),
        });
      });

      expect(result.current.events).toHaveLength(2);

      act(() => {
        result.current.clearAll();
      });

      expect(result.current.events).toHaveLength(0);
      expect(result.current.unreadCount).toBe(0);
    });
  });

  describe('unread count tracking', () => {
    it('should correctly count unread events', () => {
      const { result } = renderHook(() => useNotificationCenter('GABC123'));

      act(() => {
        result.current.addEvent({
          id: 'test-1',
          type: 'price_alert',
          title: 'Alert 1',
          description: 'Desc',
          read: false,
          createdAt: Date.now(),
        });
        result.current.addEvent({
          id: 'test-2',
          type: 'price_alert',
          title: 'Alert 2',
          description: 'Desc',
          read: true,
          createdAt: Date.now(),
        });
        result.current.addEvent({
          id: 'test-3',
          type: 'price_alert',
          title: 'Alert 3',
          description: 'Desc',
          read: false,
          createdAt: Date.now(),
        });
      });

      expect(result.current.unreadCount).toBe(2);
    });

    it('should provide correct unread badge text', () => {
      const { result } = renderHook(() => useNotificationCenter('GABC123'));

      // Add 50 unread events
      act(() => {
        for (let i = 0; i < 50; i++) {
          result.current.addEvent({
            id: `test-${i}`,
            type: 'price_alert',
            title: `Alert ${i}`,
            description: 'Desc',
            read: false,
            createdAt: Date.now(),
          });
        }
      });

      expect(result.current.unreadBadgeText).toBe('50');

      // Add more events to exceed 99
      act(() => {
        for (let i = 50; i < 120; i++) {
          result.current.addEvent({
            id: `test-${i}`,
            type: 'price_alert',
            title: `Alert ${i}`,
            description: 'Desc',
            read: false,
            createdAt: Date.now(),
          });
        }
      });

      expect(result.current.unreadBadgeText).toBe('99+');
    });
  });

  describe('persistence', () => {
    it('should persist events to localStorage', () => {
      const { result } = renderHook(() => useNotificationCenter('GABC123'));

      const event: NotificationCenterEvent = {
        id: 'test-1',
        type: 'price_alert',
        title: 'Alert',
        description: 'Description',
        read: false,
        createdAt: Date.now(),
      };

      act(() => {
        result.current.addEvent(event);
      });

      const stored = localStorage.getItem('stellar_spend_notification_center');
      expect(stored).toBeTruthy();

      const parsed = JSON.parse(stored!);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].id).toBe('test-1');
    });

    it('should load persisted events on mount', () => {
      const event: NotificationCenterEvent = {
        id: 'test-1',
        type: 'price_alert',
        title: 'Alert',
        description: 'Description',
        read: false,
        createdAt: Date.now(),
      };

      localStorage.setItem('stellar_spend_notification_center', JSON.stringify([event]));

      const { result } = renderHook(() => useNotificationCenter('GABC123'));

      expect(result.current.events).toHaveLength(1);
      expect(result.current.events[0].id).toBe('test-1');
      expect(result.current.unreadCount).toBe(1);
    });

    it('should respect MAX_EVENTS limit', () => {
      const { result } = renderHook(() => useNotificationCenter('GABC123'));

      // Add 150 events (exceeds MAX_EVENTS of 100)
      act(() => {
        for (let i = 0; i < 150; i++) {
          result.current.addEvent({
            id: `test-${i}`,
            type: 'price_alert',
            title: `Alert ${i}`,
            description: 'Desc',
            read: false,
            createdAt: Date.now(),
          });
        }
      });

      expect(result.current.events).toHaveLength(100);

      const stored = JSON.parse(localStorage.getItem('stellar_spend_notification_center')!);
      expect(stored).toHaveLength(100);
    });
  });

  describe('event aggregation', () => {
    it('should aggregate transaction updates', () => {
      const { result } = renderHook(() => useNotificationCenter('GABC123'));

      const deliveries = [
        {
          id: 'delivery-1',
          transactionId: 'tx-1',
          userAddress: 'GABC123',
          eventType: 'completed' as const,
          channel: 'email' as const,
          status: 'sent' as const,
          templateId: 'template-1',
          message: 'Transaction completed',
          attemptCount: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      act(() => {
        result.current.aggregateTransactionUpdates(deliveries);
      });

      expect(result.current.events).toHaveLength(1);
      expect(result.current.events[0].type).toBe('transaction_update');
      expect(result.current.events[0].title).toBe('Transaction Completed');
    });

    it('should aggregate payout updates', () => {
      const { result } = renderHook(() => useNotificationCenter('GABC123'));

      const transactions = [
        {
          id: 'tx-1',
          payoutStatus: 'settled',
          updatedAt: Date.now(),
        },
      ];

      act(() => {
        result.current.aggregatePayoutUpdates(transactions);
      });

      expect(result.current.events).toHaveLength(1);
      expect(result.current.events[0].type).toBe('payout_update');
      expect(result.current.events[0].title).toBe('Payout Settled');
    });

    it('should add tier change event', () => {
      const { result } = renderHook(() => useNotificationCenter('GABC123'));

      act(() => {
        result.current.addTierChangeEvent('gold', 'silver');
      });

      expect(result.current.events).toHaveLength(1);
      expect(result.current.events[0].type).toBe('tier_change');
      expect(result.current.events[0].title).toBe('Tier Changed');
    });
  });

  describe('sorting and ordering', () => {
    it('should keep events sorted by date (newest first)', () => {
      const { result } = renderHook(() => useNotificationCenter('GABC123'));

      const now = Date.now();

      act(() => {
        // Add in out-of-order fashion
        result.current.addEvent({
          id: 'test-1',
          type: 'price_alert',
          title: 'Alert 1',
          description: 'Desc',
          read: false,
          createdAt: now - 5000,
        });
        result.current.addEvent({
          id: 'test-3',
          type: 'price_alert',
          title: 'Alert 3',
          description: 'Desc',
          read: false,
          createdAt: now,
        });
        result.current.addEvent({
          id: 'test-2',
          type: 'price_alert',
          title: 'Alert 2',
          description: 'Desc',
          read: false,
          createdAt: now - 2000,
        });
      });

      expect(result.current.events[0].id).toBe('test-3'); // Newest
      expect(result.current.events[1].id).toBe('test-2');
      expect(result.current.events[2].id).toBe('test-1'); // Oldest
    });
  });

  describe('edge cases', () => {
    it('should handle marking non-existent event as read gracefully', () => {
      const { result } = renderHook(() => useNotificationCenter('GABC123'));

      act(() => {
        expect(() => {
          result.current.markAsRead('non-existent');
        }).not.toThrow();
      });
    });

    it('should handle removing non-existent event gracefully', () => {
      const { result } = renderHook(() => useNotificationCenter('GABC123'));

      act(() => {
        expect(() => {
          result.current.removeEvent('non-existent');
        }).not.toThrow();
      });
    });

    it('should handle corrupted localStorage data', () => {
      localStorage.setItem('stellar_spend_notification_center', 'invalid json');

      const { result } = renderHook(() => useNotificationCenter('GABC123'));

      expect(result.current.events).toHaveLength(0);
      expect(result.current.error).toBeNull();
    });
  });
});
