import { logger } from '@/lib/logger';
('use client');

import { useEffect, useState } from 'react';

interface NotificationPermission {
  status: 'granted' | 'denied' | 'default';
  isSupported: boolean;
}

export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>({
    status: 'default',
    isSupported: false,
  });

  useEffect(() => {
    const isSupported = 'serviceWorker' in navigator && 'Notification' in window;
    setPermission((prev) => ({ ...prev, isSupported }));

    if (isSupported && Notification.permission !== 'default') {
      setPermission((prev) => ({ ...prev, status: Notification.permission as any }));
    }
  }, []);

  const requestPermission = async () => {
    if (!permission.isSupported) {
      logger.warn('Push notifications not supported');
      return false;
    }

    try {
      const result = await Notification.requestPermission();
      setPermission((prev) => ({ ...prev, status: result as any }));
      return result === 'granted';
    } catch (err) {
      logger.error('Failed to request notification permission:', {}, err);
      return false;
    }
  };

  const sendNotification = async (title: string, options?: NotificationOptions) => {
    if (!permission.isSupported || permission.status !== 'granted') {
      logger.warn('Notifications not permitted');
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, {
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-192x192.png',
        ...options,
      });
    } catch (err) {
      logger.error('Failed to send notification:', {}, err);
    }
  };

  return {
    permission,
    requestPermission,
    sendNotification,
  };
}

export function notifyTransactionStatus(
  status: 'pending' | 'completed' | 'failed',
  amount: string,
  currency: string,
) {
  const titles = {
    pending: 'Transaction Pending',
    completed: 'Transaction Completed',
    failed: 'Transaction Failed',
  };

  const bodies = {
    pending: `Your ${amount} ${currency} offramp is being processed...`,
    completed: `Successfully converted ${amount} ${currency}! Check your bank account.`,
    failed: `Failed to process ${amount} ${currency}. Please try again.`,
  };

  const icons = {
    pending: '⏳',
    completed: '✅',
    failed: '❌',
  };

  return {
    title: `${icons[status]} ${titles[status]}`,
    body: bodies[status],
    tag: `transaction-${status}`,
    requireInteraction: status === 'failed',
  };
}
