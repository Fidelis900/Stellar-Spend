import { randomUUID } from 'crypto';
import { pool } from '@/lib/db';
import type {
  NotificationDeliveryRecord,
  NotificationDeliveryStatus,
} from '@/lib/notifications';

export class NotificationDeliveryStoreError extends Error {
  constructor(
    message: string,
    public readonly cause: unknown,
  ) {
    super(message);
    this.name = 'NotificationDeliveryStoreError';
  }
}

function rowToDelivery(row: Record<string, unknown>): NotificationDeliveryRecord {
  return {
    id: row.id as string,
    transactionId: row.transaction_id as string,
    userAddress: row.user_address as string,
    eventType: row.event_type as NotificationDeliveryRecord['eventType'],
    channel: row.channel as NotificationDeliveryRecord['channel'],
    destination: (row.destination as string | null) ?? undefined,
    status: row.status as NotificationDeliveryStatus,
    templateId: row.template_id as string,
    subject: (row.subject as string | null) ?? undefined,
    message: row.message as string,
    providerMessageId: (row.provider_message_id as string | null) ?? undefined,
    errorMessage: (row.error_message as string | null) ?? undefined,
    attemptCount: Number(row.attempt_count),
    metadata: (row.metadata as Record<string, unknown> | null) ?? undefined,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    sentAt: row.sent_at ? Number(row.sent_at) : undefined,
  };
}

export async function createNotificationDelivery(
  input: Omit<NotificationDeliveryRecord, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<NotificationDeliveryRecord> {
  const now = Date.now();
  const id = randomUUID();

  try {
    const result = await pool.query(
      `
        INSERT INTO transaction_notification_deliveries (
          id, transaction_id, user_address, event_type, channel, destination, status,
          template_id, subject, message, provider_message_id, error_message,
          attempt_count, metadata, created_at, updated_at, sent_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12,
          $13, $14::jsonb, $15, $15, $16
        )
        RETURNING *
      `,
      [
        id,
        input.transactionId,
        input.userAddress,
        input.eventType,
        input.channel,
        input.destination ?? null,
        input.status,
        input.templateId,
        input.subject ?? null,
        input.message,
        input.providerMessageId ?? null,
        input.errorMessage ?? null,
        input.attemptCount,
        JSON.stringify(input.metadata ?? {}),
        now,
        input.sentAt ?? null,
      ],
    );

    return rowToDelivery(result.rows[0]);
  } catch (error) {
    throw new NotificationDeliveryStoreError('Failed to create notification delivery', error);
  }
}

export async function updateNotificationDelivery(
  id: string,
  patch: {
    status: NotificationDeliveryStatus;
    attemptCount: number;
    providerMessageId?: string;
    errorMessage?: string;
    sentAt?: number;
  },
): Promise<void> {
  try {
    await pool.query(
      `
        UPDATE transaction_notification_deliveries
        SET status = $2,
            attempt_count = $3,
            provider_message_id = COALESCE($4, provider_message_id),
            error_message = $5,
            updated_at = $6,
            sent_at = COALESCE($7, sent_at)
        WHERE id = $1
      `,
      [
        id,
        patch.status,
        patch.attemptCount,
        patch.providerMessageId ?? null,
        patch.errorMessage ?? null,
        Date.now(),
        patch.sentAt ?? null,
      ],
    );
  } catch (error) {
    throw new NotificationDeliveryStoreError(`Failed to update notification delivery ${id}`, error);
  }
}

export async function retryNotificationDelivery(
  id: string,
  result: { status: NotificationDeliveryStatus; providerMessageId?: string; errorMessage?: string },
  newAttemptCount: number,
): Promise<void> {
  return updateNotificationDelivery(id, {
    status: result.status,
    attemptCount: newAttemptCount,
    providerMessageId: result.providerMessageId,
    errorMessage: result.errorMessage,
    sentAt: result.status === 'sent' ? Date.now() : undefined,
  });
}

export async function getNotificationDeliveriesForTransaction(
  transactionId: string,
): Promise<NotificationDeliveryRecord[]> {
  try {
    const result = await pool.query(
      `
        SELECT *
        FROM transaction_notification_deliveries
        WHERE transaction_id = $1
        ORDER BY created_at DESC
      `,
      [transactionId],
    );
    return result.rows.map((row) => rowToDelivery(row));
  } catch (error) {
    throw new NotificationDeliveryStoreError(
      `Failed to get notification deliveries for transaction ${transactionId}`,
      error,
    );
  }
}
