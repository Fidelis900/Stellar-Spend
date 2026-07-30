import { eventBus } from '@/lib/events';
import { recordFeeCapture, seedStandardAccounts } from './entries';
import { logger } from '@/lib/logger';

let seeded = false;

export function subscribeLedgerEvents() {
  eventBus.on('transaction.completed', async (event) => {
    try {
      if (!seeded) {
        await seedStandardAccounts();
        seeded = true;
      }

      const tx = event.data as Record<string, unknown>;
      const txId = (tx.id ?? tx.transactionId ?? event.data.id) as string;
      if (!txId) return;

      const fees = tx.fees as Record<string, string> | undefined;
      if (fees) {
        if (fees.stablecoinFee || fees.bridgeFee) {
          const amount = fees.stablecoinFee ?? fees.bridgeFee ?? '0';
          await recordFeeCapture(txId, amount, (tx.fiatCurrency as string) ?? 'USD', 'stablecoin');
        }
        if (fees.payoutFee) {
          await recordFeeCapture(
            txId,
            fees.payoutFee,
            (tx.fiatCurrency as string) ?? 'USD',
            'payout',
          );
        }
      }
    } catch (err) {
      logger.error('ledger.fee_capture_error', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
