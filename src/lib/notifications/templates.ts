import type {
  NotificationContext,
  NotificationTemplate,
  TransactionNotificationEvent,
} from '@/lib/notifications';

interface TemplateStrings {
  completedSubject: string;
  completedMessage: string;
  failedSubject: string;
  failedMessage: (error: string) => string;
  pendingSubject: string;
  pendingMessage: string;
}

const templateStrings: Record<string, TemplateStrings> = {
  en: {
    completedSubject: 'Transaction completed',
    completedMessage: 'Your payout has been settled successfully.',
    failedSubject: 'Transaction failed',
    failedMessage: (e) => e || 'Please review the transaction details.',
    pendingSubject: 'Transaction update',
    pendingMessage: 'Your payout is still being processed.',
  },
  fr: {
    completedSubject: 'Transaction terminée',
    completedMessage: 'Votre paiement a été réglé avec succès.',
    failedSubject: 'Transaction échouée',
    failedMessage: (e) => e || 'Veuillez vérifier les détails de la transaction.',
    pendingSubject: 'Mise à jour de transaction',
    pendingMessage: 'Votre paiement est toujours en cours de traitement.',
  },
};

function strings(locale?: string): TemplateStrings {
  return templateStrings[locale ?? 'en'] ?? templateStrings['en'];
}

function amountLabel(amount: string, currency: string): string {
  return `${amount} ${currency}`;
}

function baseMessage(context: NotificationContext): string {
  const tx = context.transaction;
  const beneficiary = tx.beneficiary.accountName || tx.beneficiary.accountIdentifier;
  return `Transaction ${tx.id} for ${amountLabel(tx.amount, tx.currency)} to ${beneficiary}.`;
}

export function deriveNotificationEvent(
  context: NotificationContext,
): TransactionNotificationEvent | null {
  const current = context.transaction.status;
  if (
    current === context.previousStatus &&
    context.transaction.payoutStatus === context.previousPayoutStatus
  ) {
    return null;
  }
  if (current === 'completed') return 'completed';
  if (current === 'failed') return 'failed';
  if (current === 'pending' && context.transaction.payoutStatus === 'pending') return 'pending';
  return null;
}

export function buildNotificationTemplate(
  context: NotificationContext,
  locale?: string,
): NotificationTemplate | null {
  const event = deriveNotificationEvent(context);
  if (!event) return null;

  const s = strings(locale);
  const base = baseMessage(context);

  if (event === 'completed') {
    return {
      templateId: 'transaction-completed-v1',
      subject: `${s.completedSubject}: ${context.transaction.id}`,
      message: `${base} Status: completed. ${s.completedMessage}`,
    };
  }

  if (event === 'failed') {
    return {
      templateId: 'transaction-failed-v1',
      subject: `${s.failedSubject}: ${context.transaction.id}`,
      message: `${base} Status: failed. ${s.failedMessage(context.transaction.error ?? '')}`,
    };
  }

  return {
    templateId: 'transaction-pending-v1',
    subject: `${s.pendingSubject}: ${context.transaction.id}`,
    message: `${base} Status: pending. ${s.pendingMessage}`,
  };
}
