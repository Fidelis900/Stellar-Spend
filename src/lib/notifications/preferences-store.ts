import { pool } from '@/lib/db';
import type { ChannelEventRouting, NotificationPreferences } from '@/lib/notifications';

export class NotificationPreferenceStoreError extends Error {
  constructor(
    message: string,
    public readonly cause: unknown,
  ) {
    super(message);
    this.name = 'NotificationPreferenceStoreError';
  }
}

function rowToPreferences(row: Record<string, unknown>): NotificationPreferences {
  return {
    userAddress: row.user_address as string,
    email: (row.email as string | null) ?? undefined,
    phoneNumber: (row.phone_number as string | null) ?? undefined,
    pushToken: (row.push_token as string | null) ?? undefined,
    emailEnabled: Boolean(row.email_enabled),
    smsEnabled: Boolean(row.sms_enabled),
    pushEnabled: Boolean(row.push_enabled),
    notifyOnPending: Boolean(row.notify_on_pending),
    notifyOnCompleted: Boolean(row.notify_on_completed),
    notifyOnFailed: Boolean(row.notify_on_failed),
    channelRouting: (row.channel_routing as ChannelEventRouting | null) ?? undefined,
    locale: (row.locale as string | null) ?? undefined,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export async function getNotificationPreferences(
  userAddress: string,
): Promise<NotificationPreferences | null> {
  try {
    const result = await pool.query(
      `SELECT * FROM transaction_notification_preferences WHERE LOWER(user_address) = LOWER($1)`,
      [userAddress],
    );
    return result.rows[0] ? rowToPreferences(result.rows[0]) : null;
  } catch (error) {
    throw new NotificationPreferenceStoreError(
      `Failed to get notification preferences for ${userAddress}`,
      error,
    );
  }
}

export async function upsertNotificationPreferences(
  input: Omit<NotificationPreferences, 'createdAt' | 'updatedAt'> & {
    createdAt?: number;
    updatedAt?: number;
  },
): Promise<NotificationPreferences> {
  const now = Date.now();
  const createdAt = input.createdAt ?? now;
  const updatedAt = input.updatedAt ?? now;

  try {
    const result = await pool.query(
      `
        INSERT INTO transaction_notification_preferences (
          user_address, email, phone_number, push_token,
          email_enabled, sms_enabled, push_enabled,
          notify_on_pending, notify_on_completed, notify_on_failed,
          channel_routing, locale, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14)
        ON CONFLICT (user_address)
        DO UPDATE SET
          email = EXCLUDED.email,
          phone_number = EXCLUDED.phone_number,
          push_token = EXCLUDED.push_token,
          email_enabled = EXCLUDED.email_enabled,
          sms_enabled = EXCLUDED.sms_enabled,
          push_enabled = EXCLUDED.push_enabled,
          notify_on_pending = EXCLUDED.notify_on_pending,
          notify_on_completed = EXCLUDED.notify_on_completed,
          notify_on_failed = EXCLUDED.notify_on_failed,
          channel_routing = EXCLUDED.channel_routing,
          locale = EXCLUDED.locale,
          updated_at = EXCLUDED.updated_at
        RETURNING *
      `,
      [
        input.userAddress,
        input.email ?? null,
        input.phoneNumber ?? null,
        input.pushToken ?? null,
        input.emailEnabled,
        input.smsEnabled,
        input.pushEnabled,
        input.notifyOnPending,
        input.notifyOnCompleted,
        input.notifyOnFailed,
        JSON.stringify(input.channelRouting ?? null),
        input.locale ?? null,
        createdAt,
        updatedAt,
      ],
    );

    return rowToPreferences(result.rows[0]);
  } catch (error) {
    throw new NotificationPreferenceStoreError(
      `Failed to upsert notification preferences for ${input.userAddress}`,
      error,
    );
  }
}
