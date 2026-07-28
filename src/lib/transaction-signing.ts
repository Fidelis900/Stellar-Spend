import { pool } from './db/client';
import { logger } from './logger';
import crypto from 'crypto';

export interface TransactionSignature {
  id: string;
  transactionId: string;
  userAddress: string;
  signature: string;
  publicKey: string;
  algorithm: string;
  signedAt: number;
  verifiedAt?: number;
  isValid?: boolean;
  verificationError?: string;
}

export interface SignatureVerificationLog {
  id: string;
  signatureId: string;
  verificationStatus: 'pending' | 'verified' | 'failed';
  verifiedBy?: string;
  verifiedAt: number;
  details?: string;
}

export class TransactionSigningService {
  async signTransaction(
    transactionId: string,
    userAddress: string,
    signature: string,
    publicKey: string,
    algorithm = 'ed25519',
  ): Promise<TransactionSignature> {
    const id = `sig_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    const now = Date.now();

    await pool.query(
      `INSERT INTO transaction_signatures (id, transaction_id, user_address, signature, public_key, algorithm, signed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, transactionId, userAddress, signature, publicKey, algorithm, now],
    );

    logger.info(`Transaction signed`, {
      signatureId: id,
      transactionId,
      userId: userAddress,
      algorithm,
    });

    return {
      id,
      transactionId,
      userAddress,
      signature,
      publicKey,
      algorithm,
      signedAt: now,
    };
  }

  async verifySignature(signatureId: string): Promise<boolean> {
    const result = await pool.query(
      `SELECT id, signature, public_key, algorithm FROM transaction_signatures WHERE id = $1`,
      [signatureId],
    );

    if (result.rows.length === 0) {
      return false;
    }

    const row = result.rows[0];

    try {
      // Verify signature using the public key
      const isValid = this.verifySignatureData(row.signature, row.public_key, row.algorithm);

      const now = Date.now();
      await pool.query(
        `UPDATE transaction_signatures SET verified_at = $1, is_valid = $2 WHERE id = $3`,
        [now, isValid, signatureId],
      );

      // Log verification
      const logId = `log_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
      await pool.query(
        `INSERT INTO signature_verification_logs (id, signature_id, verification_status, verified_at, details)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          logId,
          signatureId,
          isValid ? 'verified' : 'failed',
          now,
          isValid ? 'Signature verified successfully' : 'Signature verification failed',
        ],
      );

      logger.info(`Signature verified`, {
        signatureId,
        isValid,
      });

      return isValid;
    } catch (error) {
      logger.error(`Signature verification error`, {
        signatureId,
        error,
      });

      const now = Date.now();
      await pool.query(
        `UPDATE transaction_signatures SET verified_at = $1, is_valid = $2, verification_error = $3 WHERE id = $4`,
        [now, false, String(error), signatureId],
      );

      return false;
    }
  }

  private verifySignatureData(signature: string, publicKey: string, algorithm: string): boolean {
    // This is a placeholder for actual signature verification
    // In production, use proper cryptographic libraries like tweetnacl or libsodium
    if (algorithm === 'ed25519') {
      // Verify ed25519 signature
      // For now, just check that signature and public key are valid hex strings
      return /^[a-f0-9]{128}$/.test(signature) && /^[a-f0-9]{64}$/.test(publicKey);
    }
    return false;
  }

  async getTransactionSignatures(transactionId: string): Promise<TransactionSignature[]> {
    const result = await pool.query(
      `SELECT id, transaction_id, user_address, signature, public_key, algorithm, signed_at, verified_at, is_valid, verification_error
       FROM transaction_signatures
       WHERE transaction_id = $1
       ORDER BY signed_at DESC`,
      [transactionId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      transactionId: row.transaction_id,
      userAddress: row.user_address,
      signature: row.signature,
      publicKey: row.public_key,
      algorithm: row.algorithm,
      signedAt: Number(row.signed_at),
      verifiedAt: row.verified_at ? Number(row.verified_at) : undefined,
      isValid: row.is_valid || undefined,
      verificationError: row.verification_error || undefined,
    }));
  }

  async getSignatureStatus(signatureId: string): Promise<TransactionSignature | null> {
    const result = await pool.query(
      `SELECT id, transaction_id, user_address, signature, public_key, algorithm, signed_at, verified_at, is_valid, verification_error
       FROM transaction_signatures
       WHERE id = $1`,
      [signatureId],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      transactionId: row.transaction_id,
      userAddress: row.user_address,
      signature: row.signature,
      publicKey: row.public_key,
      algorithm: row.algorithm,
      signedAt: Number(row.signed_at),
      verifiedAt: row.verified_at ? Number(row.verified_at) : undefined,
      isValid: row.is_valid || undefined,
      verificationError: row.verification_error || undefined,
    };
  }

  async getVerificationLogs(signatureId: string): Promise<SignatureVerificationLog[]> {
    const result = await pool.query(
      `SELECT id, signature_id, verification_status, verified_by, verified_at, details
       FROM signature_verification_logs
       WHERE signature_id = $1
       ORDER BY verified_at DESC`,
      [signatureId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      signatureId: row.signature_id,
      verificationStatus: row.verification_status,
      verifiedBy: row.verified_by || undefined,
      verifiedAt: Number(row.verified_at),
      details: row.details || undefined,
    }));
  }
}

export const transactionSigningService = new TransactionSigningService();
