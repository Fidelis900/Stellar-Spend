import { logger } from '@/lib/logger';
import type { NotificationContext } from '@/lib/notifications';

/**
 * Shows a browser notification if permissions are granted
 */
export function showBrowserNotification(title: string, options: NotificationOptions = {}): void {
  // Check if notifications are supported
  if (!('Notification' in window)) {
    logger.warn('Browser notifications are not supported in this browser.');
    return;
  }

  // Check if permission is already granted
  if (Notification.permission === 'granted') {
    new Notification(title, {
      body: options.body || '',
      icon: options.icon || '/icon-192x192.png',
      ...options,
    });
    return;
  }

  // Otherwise, we need to request permission
  Notification.requestPermission().then((permission) => {
    if (permission === 'granted') {
      new Notification(title, {
        body: options.body || '',
        icon: options.icon || '/icon-192x192.png',
        ...options,
      });
    }
  });
}

/**
 * Request notification permission from the user
 */
export function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    return Promise.reject(new Error('Browser notifications are not supported'));
  }

  return Notification.permission === 'default'
    ? Notification.requestPermission()
    : Promise.resolve(Notification.permission);
}

/**
 * Check if notification permission is granted
 */
export function isNotificationPermissionGranted(): boolean {
  if (!('Notification' in window)) {
    return false;
  }
  return Notification.permission === 'granted';
}
