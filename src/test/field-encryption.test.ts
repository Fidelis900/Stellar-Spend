/**
 * Tests for #692 — field-level encryption
 *
 * Covers:
 *  - Round-trip: encrypt → decrypt produces original plaintext
 *  - Ciphertext is never equal to plaintext
 *  - Each encryption call produces a different ciphertext (IV randomness)
 *  - Tampered ciphertext is rejected (AEAD auth tag)
 *  - isEncrypted correctly identifies encrypted values
 *  - maskPiiForLog redacts expected keys
 *  - Key rotation via rotateFieldEncryption
 *  - EncryptedTransactionRepository transparent encrypt/decrypt
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  encryptField,
  decryptField,
  isEncrypted,
  maskPiiForLog,
  rotateFieldEncryption,
} from '@/lib/security';
import { EncryptedTransactionRepository } from '@/lib/repositories';
import { InMemoryTransactionRepository } from '@/lib/repositories';
import type { Transaction } from '@/lib/repositories';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx_enc_001',
    timestamp: 1_700_000_000_000,
    userAddress: 'GCFXTESTADDRESSAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    amount: '100.00',
    currency: 'USDC',
    beneficiary: {
      institution: 'ACCESS',
      accountIdentifier: '1234567890',
      accountName: 'Alice Tester',
      currency: 'NGN',
    },
    status: 'pending',
    ...overrides,
  };
}

// ── encryptField / decryptField ───────────────────────────────────────────────

describe('encryptField / decryptField', () => {
  it('round-trips a bank account number', () => {
    const plain = '9876543210';
    const cipher = encryptField(plain);
    expect(decryptField(cipher)).toBe(plain);
  });

  it('round-trips a beneficiary name', () => {
    const plain = 'Alice Tester';
    expect(decryptField(encryptField(plain))).toBe(plain);
  });

  it('ciphertext never equals plaintext', () => {
    const plain = '1234567890';
    expect(encryptField(plain)).not.toBe(plain);
  });

  it('each call produces a different ciphertext (IV randomness)', () => {
    const plain = '1234567890';
    const c1 = encryptField(plain);
    const c2 = encryptField(plain);
    expect(c1).not.toBe(c2);
    // But both decrypt to the same value
    expect(decryptField(c1)).toBe(plain);
    expect(decryptField(c2)).toBe(plain);
  });

  it('round-trips empty string', () => {
    expect(decryptField(encryptField(''))).toBe('');
  });

  it('round-trips unicode / special characters', () => {
    const plain = 'Ọlúwafúnmiláyọ̀ Adéwálé 🇳🇬';
    expect(decryptField(encryptField(plain))).toBe(plain);
  });

  it('throws on tampered ciphertext (auth tag failure)', () => {
    const cipher = encryptField('secret');
    // Flip the last byte of the base64 payload
    const [ver, b64] = cipher.split(':');
    const buf = Buffer.from(b64, 'base64');
    buf[buf.length - 1] ^= 0xff;
    const tampered = `${ver}:${buf.toString('base64')}`;
    expect(() => decryptField(tampered)).toThrow();
  });

  it('throws on unknown version prefix', () => {
    expect(() => decryptField('99:somebase64==')).toThrow(/Unsupported encryption version/);
  });

  it('throws on missing version prefix', () => {
    expect(() => decryptField('justbase64withnocodon=')).toThrow(/Invalid encrypted field/);
  });
});

// ── isEncrypted ───────────────────────────────────────────────────────────────

describe('isEncrypted', () => {
  it('returns true for encrypted values', () => {
    expect(isEncrypted(encryptField('hello'))).toBe(true);
  });

  it('returns false for plaintext account numbers', () => {
    expect(isEncrypted('1234567890')).toBe(false);
  });

  it('returns false for names', () => {
    expect(isEncrypted('Alice Tester')).toBe(false);
  });
});

// ── maskPiiForLog ─────────────────────────────────────────────────────────────

describe('maskPiiForLog', () => {
  it('masks accountIdentifier', () => {
    const result = maskPiiForLog({ accountIdentifier: '1234567890', currency: 'NGN' });
    expect(result.accountIdentifier).toBe('[MASKED]');
    expect(result.currency).toBe('NGN');
  });

  it('masks accountName', () => {
    const result = maskPiiForLog({ accountName: 'Alice Tester', institution: 'ACCESS' });
    expect(result.accountName).toBe('[MASKED]');
    expect(result.institution).toBe('ACCESS');
  });

  it('masks nested beneficiary PII', () => {
    const result = maskPiiForLog({
      id: 'tx_001',
      beneficiary: {
        institution: 'ACCESS',
        accountIdentifier: '9876543210',
        accountName: 'Bob Mensah',
        currency: 'NGN',
      },
    });
    expect((result.beneficiary as Record<string, unknown>).accountIdentifier).toBe('[MASKED]');
    expect((result.beneficiary as Record<string, unknown>).accountName).toBe('[MASKED]');
    expect((result.beneficiary as Record<string, unknown>).institution).toBe('ACCESS');
    expect(result.id).toBe('tx_001');
  });

  it('passes through non-PII fields unchanged', () => {
    const result = maskPiiForLog({ id: 'tx_001', status: 'completed', amount: '100' });
    expect(result).toEqual({ id: 'tx_001', status: 'completed', amount: '100' });
  });
});

// ── rotateFieldEncryption ─────────────────────────────────────────────────────

describe('rotateFieldEncryption', () => {
  const OLD_KEY = '0x' + 'aa'.repeat(32);
  const NEW_KEY = '0x' + 'bb'.repeat(32);

  beforeEach(() => {
    process.env.ENCRYPTION_KEY = OLD_KEY;
  });

  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
    delete process.env.NEW_ENCRYPTION_KEY;
  });

  it('re-encrypts a field with the new key', () => {
    // Encrypt with old key
    const plain = '1234567890';
    const cipherOld = encryptField(plain);
    expect(decryptField(cipherOld)).toBe(plain); // old key works

    const records = [{ accountIdentifier: cipherOld }];
    process.env.NEW_ENCRYPTION_KEY = NEW_KEY;

    const result = rotateFieldEncryption(records, ['accountIdentifier']);

    expect(result.rotated).toBe(1);
    expect(result.failed).toBe(0);

    // New ciphertext is different from old
    expect(records[0].accountIdentifier).not.toBe(cipherOld);

    // Decryptable with new key
    process.env.ENCRYPTION_KEY = NEW_KEY;
    expect(decryptField(records[0].accountIdentifier as string)).toBe(plain);
  });

  it('encrypts a plaintext field during rotation (first-time encryption)', () => {
    const records = [{ accountIdentifier: 'plaintext_number' }];
    process.env.NEW_ENCRYPTION_KEY = NEW_KEY;

    const result = rotateFieldEncryption(records, ['accountIdentifier']);
    expect(result.rotated).toBe(1);

    process.env.ENCRYPTION_KEY = NEW_KEY;
    expect(decryptField(records[0].accountIdentifier as string)).toBe('plaintext_number');
  });

  it('reports failure when NEW_ENCRYPTION_KEY is not set', () => {
    const records = [{ accountIdentifier: encryptField('secret') }];
    // Do not set NEW_ENCRYPTION_KEY

    const result = rotateFieldEncryption(records, ['accountIdentifier']);
    expect(result.failed).toBe(1);
    expect(result.errors[0]).toMatch(/NEW_ENCRYPTION_KEY/);
  });

  it('skips null/undefined fields', () => {
    const records = [{ accountIdentifier: null }];
    process.env.NEW_ENCRYPTION_KEY = NEW_KEY;

    const result = rotateFieldEncryption(records as unknown as Record<string, unknown>[], [
      'accountIdentifier',
    ]);
    expect(result.skipped).toBe(1);
    expect(result.rotated).toBe(0);
  });

  it('handles nested field paths', () => {
    process.env.ENCRYPTION_KEY = OLD_KEY;
    const plain = 'Alice Tester';
    const records = [{ beneficiary: { accountName: encryptField(plain) } }];
    process.env.NEW_ENCRYPTION_KEY = NEW_KEY;

    const result = rotateFieldEncryption(records as unknown as Record<string, unknown>[], [
      'beneficiary.accountName',
    ]);
    expect(result.rotated).toBe(1);

    process.env.ENCRYPTION_KEY = NEW_KEY;
    expect(decryptField(records[0].beneficiary.accountName as string)).toBe(plain);
  });
});

// ── EncryptedTransactionRepository ───────────────────────────────────────────

describe('EncryptedTransactionRepository', () => {
  let inner: InMemoryTransactionRepository;
  let repo: EncryptedTransactionRepository;

  beforeEach(() => {
    // Use a fixed test key so tests are hermetic
    process.env.ENCRYPTION_KEY = '0x' + 'cc'.repeat(32);
    inner = new InMemoryTransactionRepository();
    repo = new EncryptedTransactionRepository(inner);
  });

  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
  });

  it('saves with encrypted PII and reads back plaintext', async () => {
    const tx = makeTransaction();
    await repo.save(tx);

    // Confirm the inner store holds ciphertext
    const rawStored = await inner.getById(tx.id);
    expect(rawStored).not.toBeNull();
    expect(isEncrypted(rawStored!.beneficiary.accountIdentifier)).toBe(true);
    expect(isEncrypted(rawStored!.beneficiary.accountName)).toBe(true);

    // Reading through the encrypted repo gives plaintext back
    const loaded = await repo.getById(tx.id);
    expect(loaded!.beneficiary.accountIdentifier).toBe('1234567890');
    expect(loaded!.beneficiary.accountName).toBe('Alice Tester');
  });

  it('getAll decrypts all rows', async () => {
    await repo.save(makeTransaction({ id: 'tx_001' }));
    await repo.save(makeTransaction({ id: 'tx_002' }));

    const all = await repo.getAll();
    expect(all).toHaveLength(2);
    for (const tx of all) {
      expect(tx.beneficiary.accountIdentifier).toBe('1234567890');
      expect(tx.beneficiary.accountName).toBe('Alice Tester');
    }
  });

  it('getByUser decrypts results', async () => {
    const tx = makeTransaction();
    await repo.save(tx);

    const byUser = await repo.getByUser(tx.userAddress);
    expect(byUser[0].beneficiary.accountIdentifier).toBe('1234567890');
  });

  it('update with new beneficiary re-encrypts', async () => {
    const tx = makeTransaction();
    await repo.save(tx);

    await repo.update(tx.id, {
      beneficiary: {
        ...tx.beneficiary,
        accountIdentifier: '9999999999',
        accountName: 'Bob Updated',
      },
    });

    // Raw inner store should still be encrypted
    const raw = await inner.getById(tx.id);
    expect(isEncrypted(raw!.beneficiary.accountIdentifier)).toBe(true);

    // Reading through encrypted repo gives new plaintext
    const loaded = await repo.getById(tx.id);
    expect(loaded!.beneficiary.accountIdentifier).toBe('9999999999');
    expect(loaded!.beneficiary.accountName).toBe('Bob Updated');
  });

  it('getByPayoutOrderId decrypts result', async () => {
    const tx = makeTransaction({ payoutOrderId: 'order_abc123', status: 'completed' });
    await repo.save(tx);

    const found = await repo.getByPayoutOrderId('order_abc123');
    expect(found).not.toBeNull();
    expect(found!.beneficiary.accountIdentifier).toBe('1234567890');
  });

  it('delete removes the row', async () => {
    const tx = makeTransaction();
    await repo.save(tx);
    await repo.delete(tx.id);
    expect(await repo.getById(tx.id)).toBeNull();
  });

  it('non-encrypted legacy rows are returned as-is (migration safety)', async () => {
    // Simulate a row that was saved before encryption was introduced
    const plainTx = makeTransaction();
    // Save directly to inner (bypassing encryption)
    await inner.save(plainTx);

    const loaded = await repo.getById(plainTx.id);
    // Since the stored value is not encrypted, isEncrypted returns false
    // and decryptBeneficiary returns it unchanged
    expect(loaded!.beneficiary.accountIdentifier).toBe('1234567890');
    expect(loaded!.beneficiary.accountName).toBe('Alice Tester');
  });
});
