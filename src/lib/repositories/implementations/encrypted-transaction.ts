/**
 * EncryptedTransactionRepository — #692
 *
 * Wraps any TransactionRepository implementation and transparently
 * encrypts `beneficiary.accountIdentifier` and `beneficiary.accountName`
 * before write and decrypts them after read.
 *
 * Usage:
 *   const repo = new EncryptedTransactionRepository(
 *     new DatabaseTransactionRepository()
 *   );
 *   // All saves/updates automatically encrypt PII.
 *   // All reads automatically decrypt PII.
 */

import type { TransactionRepository, Transaction } from '../transaction';
import {
  encryptField,
  decryptField,
  maskPiiForLog,
  isEncrypted,
} from '../../security/field-encryption';
import { logger } from '../../logger';

function encryptBeneficiary(beneficiary: Transaction['beneficiary']): Transaction['beneficiary'] {
  return {
    ...beneficiary,
    accountIdentifier: encryptField(beneficiary.accountIdentifier),
    accountName: encryptField(beneficiary.accountName),
  };
}

function decryptBeneficiary(beneficiary: Transaction['beneficiary']): Transaction['beneficiary'] {
  try {
    return {
      ...beneficiary,
      accountIdentifier: isEncrypted(beneficiary.accountIdentifier)
        ? decryptField(beneficiary.accountIdentifier)
        : beneficiary.accountIdentifier,
      accountName: isEncrypted(beneficiary.accountName)
        ? decryptField(beneficiary.accountName)
        : beneficiary.accountName,
    };
  } catch (err) {
    logger.error('encrypted_repo.decrypt_failed', maskPiiForLog({ id: 'unknown' }), err);
    throw err;
  }
}

export class EncryptedTransactionRepository implements TransactionRepository {
  constructor(private readonly inner: TransactionRepository) {}

  async save(transaction: Transaction): Promise<void> {
    const encrypted: Transaction = {
      ...transaction,
      beneficiary: encryptBeneficiary(transaction.beneficiary),
    };
    logger.debug('encrypted_repo.save', maskPiiForLog({ id: transaction.id }));
    return this.inner.save(encrypted);
  }

  async update(id: string, updates: Partial<Transaction>): Promise<void> {
    const safeUpdates = { ...updates };
    if (updates.beneficiary) {
      safeUpdates.beneficiary = encryptBeneficiary(updates.beneficiary);
    }
    return this.inner.update(id, safeUpdates);
  }

  async getById(id: string): Promise<Transaction | null> {
    const row = await this.inner.getById(id);
    if (!row) return null;
    return { ...row, beneficiary: decryptBeneficiary(row.beneficiary) };
  }

  async delete(id: string): Promise<void> {
    return this.inner.delete(id);
  }

  async getAll(): Promise<Transaction[]> {
    const rows = await this.inner.getAll();
    return rows.map((row) => ({ ...row, beneficiary: decryptBeneficiary(row.beneficiary) }));
  }

  async getByUser(userAddress: string): Promise<Transaction[]> {
    const rows = await this.inner.getByUser(userAddress);
    return rows.map((row) => ({ ...row, beneficiary: decryptBeneficiary(row.beneficiary) }));
  }

  async getByPayoutOrderId(orderId: string): Promise<Transaction | null> {
    const row = await this.inner.getByPayoutOrderId(orderId);
    if (!row) return null;
    return { ...row, beneficiary: decryptBeneficiary(row.beneficiary) };
  }
}
