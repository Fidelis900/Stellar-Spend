import type { Transaction } from '@/lib/transaction-storage';

export type NotificationChannel = 'email' | 'sms' | 'push';
export type NotificationDeliveryStatus = 'sent' | 'failed' | 'skipped';
export type TransactionNotificationEvent = 'pending' | 'completed' | 'failed';

/** Which channels are enabled per event type for a given user */
export type ChannelEventRouting = Partial<
  Record<TransactionNotificationEvent, NotificationChannel[]>
>;

export interface NotificationPreferences {
  userAddress: string;
  email?: string;
  phoneNumber?: string;
  pushToken?: string;
  emailEnabled: boolean;
  smsEnabled: boolean;
  pushEnabled: boolean;
  notifyOnPending: boolean;
  notifyOnCompleted: boolean;
  notifyOnFailed: boolean;
  /** Optional per-event channel overrides. Falls back to enabled flags when absent. */
  channelRouting?: ChannelEventRouting;
  locale?: string;
  createdAt: number;
  updatedAt: number;
}

export interface NotificationTemplate {
  templateId: string;
  subject: string;
  message: string;
}

export interface NotificationDeliveryRecord {
  id: string;
  transactionId: string;
  userAddress: string;
  eventType: TransactionNotificationEvent;
  channel: NotificationChannel;
  destination?: string;
  status: NotificationDeliveryStatus;
  templateId: string;
  subject?: string;
  message: string;
  providerMessageId?: string;
  errorMessage?: string;
  attemptCount: number;
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  sentAt?: number;
}

export interface NotificationContext {
  transaction: Transaction;
  previousStatus?: Transaction['status'];
  previousPayoutStatus?: string;
  source: 'webhook' | 'refund' | 'timeout' | 'manual_update';
}

export interface DeliveryResult {
  status: NotificationDeliveryStatus;
  providerMessageId?: string;
  errorMessage?: string;
}

/** A channel adapter delivers a single notification and returns a DeliveryResult */
export interface ChannelAdapter {
  readonly channel: NotificationChannel;
  send(destination: string, subject: string, message: string): Promise<DeliveryResult>;
}
