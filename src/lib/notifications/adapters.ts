import type { ChannelAdapter, DeliveryResult } from '@/lib/notifications';

function getProviderMessageId(payload: unknown): string | undefined {
  if (payload && typeof payload === 'object') {
    const id = (payload as Record<string, unknown>).messageId;
    return typeof id === 'string' ? id : undefined;
  }
  return undefined;
}

export class EmailAdapter implements ChannelAdapter {
  readonly channel = 'email' as const;

  async send(to: string, subject: string, message: string): Promise<DeliveryResult> {
    const endpoint = process.env.EMAIL_NOTIFICATION_ENDPOINT;
    if (!endpoint) {
      return { status: 'skipped', errorMessage: 'EMAIL_NOTIFICATION_ENDPOINT not configured' };
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.EMAIL_NOTIFICATION_AUTH_TOKEN
          ? { Authorization: `Bearer ${process.env.EMAIL_NOTIFICATION_AUTH_TOKEN}` }
          : {}),
      },
      body: JSON.stringify({
        from: process.env.EMAIL_NOTIFICATION_FROM ?? 'noreply@stellar-spend.local',
        to,
        subject,
        text: message,
      }),
    });

    if (!response.ok) {
      return {
        status: 'failed',
        errorMessage: `Email endpoint responded with HTTP ${response.status}`,
      };
    }

    const payload = await response.json().catch(() => ({}));
    return { status: 'sent', providerMessageId: getProviderMessageId(payload) };
  }
}

export class SmsAdapter implements ChannelAdapter {
  readonly channel = 'sms' as const;

  async send(to: string, _subject: string, message: string): Promise<DeliveryResult> {
    const endpoint = process.env.SMS_NOTIFICATION_ENDPOINT;
    const enabled = process.env.SMS_NOTIFICATION_ENABLED?.toLowerCase() === 'true';
    if (!enabled || !endpoint) {
      return { status: 'skipped', errorMessage: 'SMS notifications not configured' };
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.SMS_NOTIFICATION_AUTH_TOKEN
          ? { Authorization: `Bearer ${process.env.SMS_NOTIFICATION_AUTH_TOKEN}` }
          : {}),
      },
      body: JSON.stringify({ to, message }),
    });

    if (!response.ok) {
      return {
        status: 'failed',
        errorMessage: `SMS endpoint responded with HTTP ${response.status}`,
      };
    }

    const payload = await response.json().catch(() => ({}));
    return { status: 'sent', providerMessageId: getProviderMessageId(payload) };
  }
}

/** Sandbox push adapter — calls the push endpoint with a Web Push-style payload */
export class PushAdapter implements ChannelAdapter {
  readonly channel = 'push' as const;

  async send(token: string, subject: string, message: string): Promise<DeliveryResult> {
    const endpoint = process.env.PUSH_NOTIFICATION_ENDPOINT;
    if (!endpoint) {
      return { status: 'skipped', errorMessage: 'PUSH_NOTIFICATION_ENDPOINT not configured' };
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.PUSH_NOTIFICATION_AUTH_TOKEN
          ? { Authorization: `Bearer ${process.env.PUSH_NOTIFICATION_AUTH_TOKEN}` }
          : {}),
      },
      body: JSON.stringify({ token, title: subject, body: message }),
    });

    if (!response.ok) {
      return {
        status: 'failed',
        errorMessage: `Push endpoint responded with HTTP ${response.status}`,
      };
    }

    const payload = await response.json().catch(() => ({}));
    return { status: 'sent', providerMessageId: getProviderMessageId(payload) };
  }
}

export const defaultAdapters: ChannelAdapter[] = [
  new EmailAdapter(),
  new SmsAdapter(),
  new PushAdapter(),
];
