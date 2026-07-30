'use client';

import { useState, useEffect, useCallback } from 'react';
import type {
  NotificationPreferences,
  NotificationDeliveryRecord,
  NotificationChannel,
} from '@/lib/notifications';
import {
  getOrCreateNotificationPreferences,
  upsertNotificationPreferences,
  getTransactionNotificationDeliveries,
} from '@/lib/notifications';

interface NotificationState {
  preferences: NotificationPreferences | null;
  deliveries: NotificationDeliveryRecord[];
  loading: boolean;
  error: string | null;
  unreadCount: number;
}

export function useNotifications(userAddress: string | null) {
  const [state, setState] = useState<NotificationState>({
    preferences: null,
    deliveries: [],
    loading: true,
    error: null,
    unreadCount: 0,
  });

  // Load preferences
  const loadPreferences = useCallback(async () => {
    if (!userAddress) return;

    try {
      const preferences = await getOrCreateNotificationPreferences(userAddress);
      setState((prev) => ({ ...prev, preferences, loading: false }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to load preferences',
        loading: false,
      }));
    }
  }, [userAddress]);

  // Load delivery history
  const loadDeliveries = useCallback(async (transactionId?: string) => {
    try {
      let deliveries: NotificationDeliveryRecord[] = [];
      if (transactionId) {
        deliveries = await getTransactionNotificationDeliveries(transactionId);
      } else {
        // For simplicity, we'll load all deliveries for the user
        // In a real app, you might want to paginate or filter this
        // This would require a new API endpoint
        console.log('Fetching all deliveries would require a new endpoint');
      }

      const unreadCount = deliveries.filter((d) => !d.metadata?.read).length;
      setState((prev) => ({
        ...prev,
        deliveries,
        unreadCount,
        loading: false,
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to load deliveries',
        loading: false,
      }));
    }
  }, []);

  // Update preferences
  const updatePreferences = useCallback(
    async (updates: Partial<NotificationPreferences>) => {
      if (!userAddress) return;

      try {
        const updatedPreferences = await upsertNotificationPreferences({
          userAddress,
          ...updates,
        });
        setState((prev) => ({ ...prev, preferences: updatedPreferences }));
        return updatedPreferences;
      } catch (error) {
        setState((prev) => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Failed to update preferences',
        }));
        throw error;
      }
    },
    [userAddress],
  );

  // Mark notification as read
  const markAsRead = useCallback(async (deliveryId: string) => {
    // In a real implementation, this would update the delivery record
    // For now, we'll simulate it by updating local state
    setState((prev) => ({
      ...prev,
      deliveries: prev.deliveries.map((d) =>
        d.id === deliveryId ? { ...d, metadata: { ...d.metadata, read: true } } : d,
      ),
      unreadCount: Math.max(0, prev.unreadCount - 1),
    }));
  }, []);

  // Group deliveries by date
  const groupedDeliveries = useCallback(() => {
    const grouped: Record<string, NotificationDeliveryRecord[]> = {};

    state.deliveries.forEach((delivery) => {
      const date = new Date(delivery.createdAt).toDateString();
      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(delivery);
    });

    return grouped;
  }, [state.deliveries]);

  // Initialize
  useEffect(() => {
    if (userAddress) {
      loadPreferences();
      loadDeliveries();
    }
  }, [userAddress, loadPreferences, loadDeliveries]);

  return {
    ...state,
    updatePreferences,
    markAsRead,
    groupedDeliveries: groupedDeliveries(),
    refresh: () => {
      loadPreferences();
      loadDeliveries();
    },
  };
}
