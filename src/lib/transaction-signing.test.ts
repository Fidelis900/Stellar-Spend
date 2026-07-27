import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TransactionSigningService, TransactionSignature } from './transaction-signing';

// Mock the database pool and logger
vi.mock('./db/client', () => ({
  pool: {
    query: vi.fn(),
  },
}));

vi.mock('./logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock crypto module
vi.mock('crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('crypto')>();
  return {
    ...actual,
    randomBytes: vi.fn(() => Buffer.from('12345678', 'hex')),
  };
});

import { pool } from './db/client';
import { logger } from './logger';
import * as crypto from 'crypto';

const mockPool = pool as any;
const mockLogger = logger as any;
const mockCrypto = crypto as any;

describe('TransactionSigningService', () => {
  let service: TransactionSigningService;

  beforeEach(() => {
    service = new TransactionSigningService();
    vi.clearAllMocks();
    // Mock Date.now() for consistent testing
    const realDate = Date;
    vi.spyOn(global.Date, 'now').mockReturnValue(1000000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('signTransaction', () => {
    it('should sign a transaction and insert into database', async () => {
      const transactionId = 'tx_123';
      const userAddress = 'GA1234567890123456789012345678901234567890123456789012';
      const signature = 'a'.repeat(128);
      const publicKey = 'b'.repeat(64);

      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.signTransaction(
        transactionId,
        userAddress,
        signature,
        publicKey
      );

      expect(result).toMatchObject({
        transactionId,
        userAddress,
        signature,
        publicKey,
        algorithm: 'ed25519',
        signedAt: 1000000,
      });

      // Verify the signature ID format (sig_<timestamp>_<random_hex>)
      expect(result.id).toMatch(/^sig_1000000_[a-f0-9]{16}$/);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO transaction_signatures'),
        [result.id, transactionId, userAddress, signature, publicKey, 'ed25519', 1000000]
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Transaction signed',
        expect.objectContaining({
          signatureId: result.id,
          transactionId,
          userId: userAddress,
          algorithm: 'ed25519',
        })
      );
    });

    it('should support custom algorithms', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.signTransaction(
        'tx_456',
        'GA1234567890123456789012345678901234567890123456789012',
        'c'.repeat(128),
        'd'.repeat(64),
        'ecdsa'
      );

      expect(result.algorithm).toBe('ecdsa');
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['ecdsa'])
      );
    });

    it('should handle database insertion errors', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('Database error'));

      await expect(
        service.signTransaction(
          'tx_789',
          'GA1234567890123456789012345678901234567890123456789012',
          'e'.repeat(128),
          'f'.repeat(64)
        )
      ).rejects.toThrow('Database error');
    });

    it('should generate unique signature IDs', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const sig1 = await service.signTransaction(
        'tx_1',
        'user1',
        'a'.repeat(128),
        'b'.repeat(64)
      );

      mockCrypto.randomBytes.mockReturnValueOnce(Buffer.from('87654321', 'hex'));

      const sig2 = await service.signTransaction(
        'tx_2',
        'user2',
        'c'.repeat(128),
        'd'.repeat(64)
      );

      expect(sig1.id).not.toBe(sig2.id);
    });
  });

  describe('verifySignature', () => {
    it('should verify a valid ed25519 signature', async () => {
      const signatureId = 'sig_123';
      const validSignature = 'a'.repeat(128);
      const validPublicKey = 'b'.repeat(64);

      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: signatureId,
            signature: validSignature,
            public_key: validPublicKey,
            algorithm: 'ed25519',
          },
        ],
      });

      mockPool.query.mockResolvedValueOnce({ rows: [] }); // UPDATE query
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // INSERT log query

      const result = await service.verifySignature(signatureId);

      expect(result).toBe(true);

      expect(mockPool.query).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('SELECT'),
        [signatureId]
      );
      expect(mockPool.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('UPDATE transaction_signatures'),
        expect.arrayContaining([1000000, true, signatureId])
      );
      expect(mockPool.query).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining('INSERT INTO signature_verification_logs'),
        expect.arrayContaining([signatureId, 'verified'])
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Signature verified',
        expect.objectContaining({ signatureId, isValid: true })
      );
    });

    it('should fail verification for invalid signature format', async () => {
      const signatureId = 'sig_456';
      const invalidSignature = 'not-hex'; // Invalid hex
      const validPublicKey = 'b'.repeat(64);

      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: signatureId,
            signature: invalidSignature,
            public_key: validPublicKey,
            algorithm: 'ed25519',
          },
        ],
      });

      mockPool.query.mockResolvedValueOnce({ rows: [] }); // UPDATE query
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // INSERT log query

      const result = await service.verifySignature(signatureId);

      expect(result).toBe(false);

      expect(mockPool.query).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('SELECT'),
        [signatureId]
      );
      expect(mockPool.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('UPDATE transaction_signatures'),
        expect.arrayContaining([1000000, false, signatureId])
      );
    });

    it('should fail verification for invalid public key format', async () => {
      const signatureId = 'sig_789';
      const validSignature = 'a'.repeat(128);
      const invalidPublicKey = 'not-hex'; // Invalid hex

      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: signatureId,
            signature: validSignature,
            public_key: invalidPublicKey,
            algorithm: 'ed25519',
          },
        ],
      });

      mockPool.query.mockResolvedValueOnce({ rows: [] }); // UPDATE query
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // INSERT log query

      const result = await service.verifySignature(signatureId);

      expect(result).toBe(false);
    });

    it('should return false for non-existent signature', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.verifySignature('sig_nonexistent');

      expect(result).toBe(false);
      expect(mockPool.query).toHaveBeenCalledTimes(1);
    });

    it('should handle verification errors and log them', async () => {
      const signatureId = 'sig_error';

      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: signatureId,
            signature: 'a'.repeat(128),
            public_key: 'b'.repeat(64),
            algorithm: 'ed25519',
          },
        ],
      });

      // Simulate an error in the verification process (UPDATE fails)
      mockPool.query.mockRejectedValueOnce(new Error('Verification failed'));

      // The implementation catches errors and returns false
      const result = await service.verifySignature(signatureId);
      expect(result).toBe(false);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Signature verification error',
        expect.objectContaining({ signatureId })
      );
    });

    it('should handle verification errors gracefully', async () => {
      const signatureId = 'sig_error2';

      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: signatureId,
            signature: 'a'.repeat(128),
            public_key: 'b'.repeat(64),
            algorithm: 'ed25519',
          },
        ],
      });

      // Mock the UPDATE to fail
      mockPool.query.mockRejectedValueOnce(new Error('Update failed'));

      // The implementation catches errors and returns false
      const result = await service.verifySignature(signatureId);
      expect(result).toBe(false);
    });
  });

  describe('getTransactionSignatures', () => {
    it('should retrieve all signatures for a transaction', async () => {
      const transactionId = 'tx_multi';
      const mockSignatures = [
        {
          id: 'sig_1',
          transaction_id: transactionId,
          user_address: 'user1',
          signature: 'sig1',
          public_key: 'key1',
          algorithm: 'ed25519',
          signed_at: 1000000,
          verified_at: 1000100,
          is_valid: true,
          verification_error: null,
        },
        {
          id: 'sig_2',
          transaction_id: transactionId,
          user_address: 'user2',
          signature: 'sig2',
          public_key: 'key2',
          algorithm: 'ed25519',
          signed_at: 1000050,
          verified_at: null,
          is_valid: null,
          verification_error: null,
        },
      ];

      mockPool.query.mockResolvedValueOnce({ rows: mockSignatures });

      const result = await service.getTransactionSignatures(transactionId);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: 'sig_1',
        transactionId,
        userAddress: 'user1',
        isValid: true,
        verifiedAt: 1000100,
      });
      expect(result[1]).toMatchObject({
        id: 'sig_2',
        userAddress: 'user2',
        isValid: undefined,
        verifiedAt: undefined,
      });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        [transactionId]
      );
    });

    it('should return empty array when no signatures found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.getTransactionSignatures('tx_empty');

      expect(result).toEqual([]);
    });

    it('should order signatures by signed_at descending', async () => {
      const mockSignatures = [
        {
          id: 'sig_1',
          transaction_id: 'tx_1',
          user_address: 'user1',
          signature: 'sig1',
          public_key: 'key1',
          algorithm: 'ed25519',
          signed_at: 2000000,
          verified_at: null,
          is_valid: null,
          verification_error: null,
        },
        {
          id: 'sig_2',
          transaction_id: 'tx_1',
          user_address: 'user2',
          signature: 'sig2',
          public_key: 'key2',
          algorithm: 'ed25519',
          signed_at: 1000000,
          verified_at: null,
          is_valid: null,
          verification_error: null,
        },
      ];

      mockPool.query.mockResolvedValueOnce({ rows: mockSignatures });

      const result = await service.getTransactionSignatures('tx_1');

      expect(result[0].signedAt).toBe(2000000);
      expect(result[1].signedAt).toBe(1000000);
    });
  });

  describe('getSignatureStatus', () => {
    it('should retrieve signature status by ID', async () => {
      const signatureId = 'sig_123';
      const mockSignature = {
        id: signatureId,
        transaction_id: 'tx_123',
        user_address: 'user1',
        signature: 'sig_data',
        public_key: 'key_data',
        algorithm: 'ed25519',
        signed_at: 1000000,
        verified_at: 1000100,
        is_valid: true,
        verification_error: null,
      };

      mockPool.query.mockResolvedValueOnce({ rows: [mockSignature] });

      const result = await service.getSignatureStatus(signatureId);

      expect(result).toMatchObject({
        id: signatureId,
        transactionId: 'tx_123',
        userAddress: 'user1',
        isValid: true,
        verifiedAt: 1000100,
      });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        [signatureId]
      );
    });

    it('should return null for non-existent signature', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.getSignatureStatus('sig_nonexistent');

      expect(result).toBeNull();
    });

    it('should handle undefined verification fields', async () => {
      const mockSignature = {
        id: 'sig_456',
        transaction_id: 'tx_456',
        user_address: 'user2',
        signature: 'sig_data',
        public_key: 'key_data',
        algorithm: 'ed25519',
        signed_at: 1000000,
        verified_at: null,
        is_valid: null,
        verification_error: null,
      };

      mockPool.query.mockResolvedValueOnce({ rows: [mockSignature] });

      const result = await service.getSignatureStatus('sig_456');

      expect(result).toMatchObject({
        id: 'sig_456',
        isValid: undefined,
        verifiedAt: undefined,
        verificationError: undefined,
      });
    });
  });

  describe('getVerificationLogs', () => {
    it('should retrieve verification logs for a signature', async () => {
      const signatureId = 'sig_123';
      const mockLogs = [
        {
          id: 'log_1',
          signature_id: signatureId,
          verification_status: 'verified',
          verified_by: 'system',
          verified_at: 1000100,
          details: 'Signature verified successfully',
        },
        {
          id: 'log_2',
          signature_id: signatureId,
          verification_status: 'pending',
          verified_by: null,
          verified_at: 1000000,
          details: 'Verification pending',
        },
      ];

      mockPool.query.mockResolvedValueOnce({ rows: mockLogs });

      const result = await service.getVerificationLogs(signatureId);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: 'log_1',
        signatureId,
        verificationStatus: 'verified',
        verifiedBy: 'system',
        details: 'Signature verified successfully',
      });
      expect(result[1]).toMatchObject({
        verificationStatus: 'pending',
        verifiedBy: undefined,
      });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        [signatureId]
      );
    });

    it('should return empty array when no logs found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.getVerificationLogs('sig_nologs');

      expect(result).toEqual([]);
    });

    it('should order logs by verified_at descending', async () => {
      const mockLogs = [
        {
          id: 'log_1',
          signature_id: 'sig_1',
          verification_status: 'verified',
          verified_by: null,
          verified_at: 2000000,
          details: 'Latest',
        },
        {
          id: 'log_2',
          signature_id: 'sig_1',
          verification_status: 'pending',
          verified_by: null,
          verified_at: 1000000,
          details: 'Earlier',
        },
      ];

      mockPool.query.mockResolvedValueOnce({ rows: mockLogs });

      const result = await service.getVerificationLogs('sig_1');

      expect(result[0].verifiedAt).toBe(2000000);
      expect(result[1].verifiedAt).toBe(1000000);
    });
  });

  describe('verifySignatureData (private method testing)', () => {
    it('should verify valid ed25519 signature format', () => {
      const validSignature = 'a'.repeat(128);
      const validPublicKey = 'b'.repeat(64);

      // Use 'any' to access private method for testing
      const result = (service as any).verifySignatureData(
        validSignature,
        validPublicKey,
        'ed25519'
      );

      expect(result).toBe(true);
    });

    it('should reject invalid ed25519 signature format (too short)', () => {
      const invalidSignature = 'a'.repeat(127);
      const validPublicKey = 'b'.repeat(64);

      const result = (service as any).verifySignatureData(
        invalidSignature,
        validPublicKey,
        'ed25519'
      );

      expect(result).toBe(false);
    });

    it('should reject invalid ed25519 signature format (too long)', () => {
      const invalidSignature = 'a'.repeat(129);
      const validPublicKey = 'b'.repeat(64);

      const result = (service as any).verifySignatureData(
        invalidSignature,
        validPublicKey,
        'ed25519'
      );

      expect(result).toBe(false);
    });

    it('should reject invalid ed25519 signature format (non-hex)', () => {
      const invalidSignature = 'x'.repeat(128);
      const validPublicKey = 'b'.repeat(64);

      const result = (service as any).verifySignatureData(
        invalidSignature,
        validPublicKey,
        'ed25519'
      );

      expect(result).toBe(false);
    });

    it('should reject invalid public key format (too short)', () => {
      const validSignature = 'a'.repeat(128);
      const invalidPublicKey = 'b'.repeat(63);

      const result = (service as any).verifySignatureData(
        validSignature,
        invalidPublicKey,
        'ed25519'
      );

      expect(result).toBe(false);
    });

    it('should reject invalid public key format (too long)', () => {
      const validSignature = 'a'.repeat(128);
      const invalidPublicKey = 'b'.repeat(65);

      const result = (service as any).verifySignatureData(
        validSignature,
        invalidPublicKey,
        'ed25519'
      );

      expect(result).toBe(false);
    });

    it('should reject invalid public key format (non-hex)', () => {
      const validSignature = 'a'.repeat(128);
      const invalidPublicKey = 'x'.repeat(64);

      const result = (service as any).verifySignatureData(
        validSignature,
        invalidPublicKey,
        'ed25519'
      );

      expect(result).toBe(false);
    });

    it('should return false for unsupported algorithms', () => {
      const validSignature = 'a'.repeat(128);
      const validPublicKey = 'b'.repeat(64);

      const result = (service as any).verifySignatureData(
        validSignature,
        validPublicKey,
        'rsa'
      );

      expect(result).toBe(false);
    });

    it('should return false for empty algorithm', () => {
      const validSignature = 'a'.repeat(128);
      const validPublicKey = 'b'.repeat(64);

      const result = (service as any).verifySignatureData(
        validSignature,
        validPublicKey,
        ''
      );

      expect(result).toBe(false);
    });
  });

  describe('Integration scenarios', () => {
    it('should handle multi-sig transaction flow', async () => {
      const transactionId = 'tx_multisig';

      // Sign with multiple users
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      const sig1 = await service.signTransaction(
        transactionId,
        'user1',
        'a'.repeat(128),
        'b'.repeat(64)
      );

      mockPool.query.mockResolvedValueOnce({ rows: [] });
      const sig2 = await service.signTransaction(
        transactionId,
        'user2',
        'c'.repeat(128),
        'd'.repeat(64)
      );

      // Retrieve all signatures
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: sig1.id,
            transaction_id: transactionId,
            user_address: 'user1',
            signature: 'a'.repeat(128),
            public_key: 'b'.repeat(64),
            algorithm: 'ed25519',
            signed_at: sig1.signedAt,
            verified_at: null,
            is_valid: null,
            verification_error: null,
          },
          {
            id: sig2.id,
            transaction_id: transactionId,
            user_address: 'user2',
            signature: 'c'.repeat(128),
            public_key: 'd'.repeat(64),
            algorithm: 'ed25519',
            signed_at: sig2.signedAt,
            verified_at: null,
            is_valid: null,
            verification_error: null,
          },
        ],
      });

      const signatures = await service.getTransactionSignatures(transactionId);

      expect(signatures).toHaveLength(2);
      expect(signatures.map(s => s.userAddress)).toEqual(['user1', 'user2']);
    });

    it('should track complete signature lifecycle', async () => {
      const transactionId = 'tx_lifecycle';
      const userAddress = 'user_test';
      const signature = 'a'.repeat(128);
      const publicKey = 'b'.repeat(64);

      // 1. Sign transaction
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      const sig = await service.signTransaction(transactionId, userAddress, signature, publicKey);

      // 2. Get initial status (unverified)
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: sig.id,
            transaction_id: transactionId,
            user_address: userAddress,
            signature,
            public_key: publicKey,
            algorithm: 'ed25519',
            signed_at: sig.signedAt,
            verified_at: null,
            is_valid: null,
            verification_error: null,
          },
        ],
      });

      const statusBefore = await service.getSignatureStatus(sig.id);
      expect(statusBefore?.isValid).toBeUndefined();

      // 3. Verify signature
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: sig.id,
            signature,
            public_key: publicKey,
            algorithm: 'ed25519',
          },
        ],
      });
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // UPDATE
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // INSERT log

      const verified = await service.verifySignature(sig.id);
      expect(verified).toBe(true);

      // 4. Get verification logs
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'log_1',
            signature_id: sig.id,
            verification_status: 'verified',
            verified_by: null,
            verified_at: 1000100,
            details: 'Signature verified successfully',
          },
        ],
      });

      const logs = await service.getVerificationLogs(sig.id);
      expect(logs).toHaveLength(1);
      expect(logs[0].verificationStatus).toBe('verified');
    });
  });
});
