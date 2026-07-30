'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { PriceAlertStorage, type PriceAlert } from '@/lib/price-alerts';
import type { NotificationDeliveryRecord } from '@/lib/notifications';

export type NotificationCenterEventType =
  | 'price_alert'
  | 'transaction_update'
  | 'tier_change'
  | 'payout_update';

export interface NotificationCenterEvent {
  id: string;
  type: NotificationCenterEventType;
  title: string;
  description: string;
  read: boolean;
  createdAt: number;
  link?: {
    href: string;
    label: string;
  };
  metadata?: Record<string, unknown>;
}

interface NotificationCenterState {
  events: NotificationCenterEvent[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
}

const STORAGE_KEY = 'stellar_spend_notification_center';
const MAX_EVENTS = 100;

/**
 * useNotificationCenter
 *
 * Aggregates notifications from multiple sources:
 * - Price alerts (from price-alerts.ts)
 * - Transaction updates (from notifications/service.ts)
 * - Payout status updates (from polling/transaction-timeout.ts)
 * - Tier changes (custom events)
 *
 * Manages read/unread state with localStorage persistence.
 * Provides deep links to relevant contexts.
 */
export function useNotificationCenter(userAddress: string | null) {
  const [state, setState] = useState<NotificationCenterState>({
    events: [],
    unreadCount: 0,
    loading: true,
    error: null,
  });

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Load persisted events from localStorage
  const loadPersistedEvents = useCallback(() => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const events: NotificationCenterEvent[] = JSON.parse(stored);
        return events.sort((a, b) => b.createdAt - a.createdAt);
      }
    } catch (err) {
      console.error('Failed to load persisted events:', err);
    }
    return [];
  }, []);

  // Save events to localStorage
  const persistEvents = useCallback((events: NotificationCenterEvent[]) => {
    if (typeof window === 'undefined') return;
    try {
      // Keep only the most recent MAX_EVENTS
      const toSave = events.slice(0, MAX_EVENTS);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch (err) {
      console.error('Failed to persist events:', err);
    }
  }, []);

  // Add or update an event
  const addEvent = useCallback(
    (event: NotificationCenterEvent) => {
      setState((prev) => {
        // Check if event already exists (by id)
        const existingIndex = prev.events.findIndex((e) => e.id === event.id);
        let updatedEvents: NotificationCenterEvent[];

        if (existingIndex >= 0) {
          // Update existing event
          updatedEvents = [...prev.events];
          updatedEvents[existingIndex] = event;
        } else {
          // Add new event at the beginning
          updatedEvents = [event, ...prev.events].slice(0, MAX_EVENTS);
        }

        // Calculate unread count
        const unreadCount = updatedEvents.filter((e) => !e.read).length;

        // Persist to localStorage
        persistEvents(updatedEvents);

        return {
          ...prev,
          events: updatedEvents,
          unreadCount,
        };
      });
    },
    [persistEvents],
  );

  // Mark event as read
  const markAsRead = useCallback(
    (eventId: string) => {
      setState((prev) => {
        const updatedEvents = prev.events.map((e) => (e.id === eventId ? { ...e, read: true } : e));
        const unreadCount = updatedEvents.filter((e) => !e.read).length;
        persistEvents(updatedEvents);

        return {
          ...prev,
          events: updatedEvents,
          unreadCount,
        };
      });
    },
    [persistEvents],
  );

  // Mark all as read
  const markAllAsRead = useCallback(() => {
    setState((prev) => {
      const updatedEvents = prev.events.map((e) => ({ ...e, read: true }));
      persistEvents(updatedEvents);
      return {
        ...prev,
        events: updatedEvents,
        unreadCount: 0,
      };
    });
  }, [persistEvents]);

  // Remove an event
  const removeEvent = useCallback(
    (eventId: string) => {
      setState((prev) => {
        const updatedEvents = prev.events.filter((e) => e.id !== eventId);
        const unreadCount = updatedEvents.filter((e) => !e.read).length;
        persistEvents(updatedEvents);

        return {
          ...prev,
          events: updatedEvents,
          unreadCount,
        };
      });
    },
    [persistEvents],
  );

  // Clear all events
  const clearAll = useCallback(() => {
    persistEvents([]);
    setState((prev) => ({
      ...prev,
      events: [],
      unreadCount: 0,
    }));
  }, [persistEvents]);

  // Aggregate price alerts from storage
  const aggregatePriceAlerts = useCallback(() => {
    try {
      // Get recent alerts from storage that have been triggered
      const allAlerts = PriceAlertStorage.getAllAlerts();

      // Only show triggered alerts as notifications
      const triggeredAlerts = allAlerts.filter(
        (a) => a.status === 'triggered' || a.triggeredCount > 0,
      );

      // Convert to events
      triggeredAlerts.forEach((alert) => {
        const lastTrigger = alert.triggerHistory?.[0];
        if (lastTrigger) {
          const alertEventId = `price-alert-${alert.id}`;
          const event: NotificationCenterEvent = {
            id: alertEventId,
            type: 'price_alert',
            title: `Price Alert: ${alert.currency}`,
            description: `Your alert for ${alert.currency} at ₦${alert.targetPrice.toLocaleString()} has been triggered at ₦${lastTrigger.priceAtTrigger.toLocaleString()}`,
            read: false,
            createdAt: lastTrigger.timestamp,
            link: {
              href: `/price-alerts/${alert.id}`,
              label: 'View Alert',
            },
            metadata: {
              alertId: alert.id,
              currency: alert.currency,
              targetPrice: alert.targetPrice,
              triggerPrice: lastTrigger.priceAtTrigger,
            },
          };

          addEvent(event);
        }
      });
    } catch (err) {
      console.error('Failed to aggregate price alerts:', err);
    }
  }, [addEvent]);

  // Aggregate transaction updates
  const aggregateTransactionUpdates = useCallback(
    (deliveries: NotificationDeliveryRecord[]) => {
      try {
        deliveries.forEach((delivery) => {
          const txEventId = `tx-${delivery.transactionId}-${delivery.eventType}`;

          // Map event type to human readable text
          const eventTypeText =
            {
              pending: 'Transaction Pending',
              completed: 'Transaction Completed',
              failed: 'Transaction Failed',
            }[delivery.eventType] || 'Transaction Update';

          const event: NotificationCenterEvent = {
            id: txEventId,
            type: 'transaction_update',
            title: eventTypeText,
            description: delivery.message || `Your transaction has been ${delivery.eventType}`,
            read: delivery.metadata?.read === true,
            createdAt: delivery.createdAt,
            link: {
              href: `/transaction/${delivery.transactionId}`,
              label: 'View Transaction',
            },
            metadata: {
              transactionId: delivery.transactionId,
              eventType: delivery.eventType,
              status: delivery.status,
            },
          };

          addEvent(event);
        });
      } catch (err) {
        console.error('Failed to aggregate transaction updates:', err);
      }
    },
    [addEvent],
  );

  // Aggregate payout status updates
  const aggregatePayoutUpdates = useCallback(
    (transactions: Array<{ id: string; payoutStatus?: string; updatedAt: number }>) => {
      try {
        transactions.forEach((tx) => {
          if (!tx.payoutStatus) return;

          const payoutEventId = `payout-${tx.id}`;

          const statusText =
            {
              pending: 'Payout Pending',
              processing: 'Payout Processing',
              settled: 'Payout Settled',
              failed: 'Payout Failed',
              refunded: 'Payout Refunded',
              expired: 'Payout Expired',
            }[tx.payoutStatus] || 'Payout Update';

          const event: NotificationCenterEvent = {
            id: payoutEventId,
            type: 'payout_update',
            title: statusText,
            description: `Your payout status has been updated to ${tx.payoutStatus}`,
            read: false,
            createdAt: tx.updatedAt,
            link: {
              href: `/transaction/${tx.id}?tab=payout`,
              label: 'View Payout',
            },
            metadata: {
              transactionId: tx.id,
              payoutStatus: tx.payoutStatus,
            },
          };

          addEvent(event);
        });
      } catch (err) {
        console.error('Failed to aggregate payout updates:', err);
      }
    },
    [addEvent],
  );

  // Aggregate tier changes
  const addTierChangeEvent = useCallback(
    (tier: string, previousTier?: string) => {
      const event: NotificationCenterEvent = {
        id: `tier-change-${Date.now()}`,
        type: 'tier_change',
        title: 'Tier Changed',
        description: `Your tier has been ${previousTier ? `upgraded from ${previousTier} to ${tier}` : `set to ${tier}`}`,
        read: false,
        createdAt: Date.now(),
        link: {
          href: '/account/tier',
          label: 'View Tier Details',
        },
        metadata: {
          tier,
          previousTier,
        },
      };

      addEvent(event);
    },
    [addEvent],
  );

  // Initialize and load persisted events
  useEffect(() => {
    if (!userAddress) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: 'No user address provided',
      }));
      return;
    }

    try {
      // Load persisted events
      const persisted = loadPersistedEvents();
      const unreadCount = persisted.filter((e) => !e.read).length;

      setState((prev) => ({
        ...prev,
        events: persisted,
        unreadCount,
        loading: false,
        error: null,
      }));

      // Aggregate current events from sources
      aggregatePriceAlerts();
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load events',
      }));
    }
  }, [userAddress, loadPersistedEvents, aggregatePriceAlerts]);

  // Poll for new events periodically
  useEffect(() => {
    if (!userAddress) return;

    const pollForUpdates = () => {
      aggregatePriceAlerts();
      // Additional polling for transaction updates would go here
    };

    // Poll every 30 seconds for new events
    pollIntervalRef.current = setInterval(pollForUpdates, 30000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [userAddress, aggregatePriceAlerts]);

  // Format unread badge text (show "99+" for counts > 99)
  const unreadBadgeText = state.unreadCount > 99 ? '99+' : String(state.unreadCount);

  return {
    ...state,
    markAsRead,
    markAllAsRead,
    removeEvent,
    clearAll,
    addEvent,
    addTierChangeEvent,
    aggregateTransactionUpdates,
    aggregatePayoutUpdates,
    unreadBadgeText,
  };
}
