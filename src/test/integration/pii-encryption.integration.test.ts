/**
 * Integration tests for PII field-level encryption — #792
 *
 * Verifies:
 *  1. End-to-end round-trip: write PII → stored ciphertext ≠ plaintext → read back plaintext
 *  2. Ciphertext is stored at rest (raw store never sees plaintext)
 *  3. All save/update/list/query paths preserve encryption invariant
 *  4. Key rotation procedure: re-encrypt rows, verify new key works, old key does not
 *  5. Legacy rows (pre-encryption) are returned as-is (migration safety)
 *
 * Key rotation procedure is documented inline in the
 * "Key Rotation Procedure" describe block below.
 *
 * No real database is required — uses InMemoryTransactionRepository as the
 * backing store so tests are hermetic and fast.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  encryptField,
  decryptField,
  isEncrypted,
  rotateFieldEncryption,
  type RotationResult,
} from '@/lib/security/field-encryption';
import { EncryptedTransactionRepository } from '@/lib/repositories/implementations/encrypted-transaction';
import { InMemoryTransactionRepository } from '@/lib/repositories/implementations/in-memory-transaction';
import type { Transaction } from '@/lib/repositories/transaction';

// ── Constants ─────────────────────────────────────────────────────────────────

const OLD_KEY = '0x' + 'aa'.repeat(32); // 32-byte hex key (AES-256)
const NEW_KEY = '0x' + 'bb'.repeat(32);

// ── Factories ─────────────────────────────────────────────────────────────────

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx_pii_001',
    timestamp: 1_700_000_000_000,
    userAddress: 'GCFXTESTADDRESSAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    amount: '200.00',
    currency: 'USDC',
    beneficiary: {
      institution: 'ACCESS_BANK',
      accountIdentifier: '0123456789', // PII
      accountName: 'Test Beneficiary',  // PII
      currency: 'NGN',
    },
    status: 'pending',
    ...overrides,
  };
}

// ── Test setup ────────────────────────────────────────────────────────────────

let inner: InMemoryTransactionRepository;
let repo: EncryptedTransactionRepository;

function setupEncryptedRepo() {
  process.env.ENCRYPTION_KEY = OLD_KEY;
  inner = new InMemoryTransactionRepository();
  repo = new EncryptedTransactionRepository(inner);
}

function teardownEncryptedRepo() {
  delete process.env.ENCRYPTION_KEY;
  delete process.env.NEW_ENCRYPTION_KEY;
}

// ── #792 — PII round-trip test ────────────────────────────────────────────────

describe('PII round-trip: write → read', () => {
  beforeEach(setupEncryptedRepo);
  afterEach(teardownEncryptedRepo);

  it('save then getById returns original plaintext PII fields', async () => {
    const tx = makeTx();
    await repo.save(tx);

    const loaded = await repo.getById(tx.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.beneficiary.accountIdentifier).toBe('0123456789');
    expect(loaded!.beneficiary.accountName).toBe('Test Beneficiary');
  });

  it('non-PII fields are preserved unchanged', async () => {
    const tx = makeTx();
    await repo.save(tx);

    const loaded = await repo.getById(tx.id);
    expect(loaded!.id).toBe('tx_pii_001');
    expect(loaded!.amount).toBe('200.00');
    expect(loaded!.currency).toBe('USDC');
    expect(loaded!.beneficiary.institution).toBe('ACCESS_BANK');
    expect(loaded!.beneficiary.currency).toBe('NGN');
    expect(loaded!.status).toBe('pending');
  });

  it('update with new PII re-encrypts and round-trips correctly', async () => {
    const tx = makeTx();
    await repo.save(tx);

    await repo.update(tx.id, {
      beneficiary: {
        ...tx.beneficiary,
        accountIdentifier: '9999999999',
        accountName: 'Updated Name',
      },
    });

    const loaded = await repo.getById(tx.id);
    expect(loaded!.beneficiary.accountIdentifier).toBe('9999999999');
    expect(loaded!.beneficiary.accountName).toBe('Updated Name');
  });

  it('getAll decrypts every row', async () => {
    await repo.save(makeTx({ id: 'tx_001' }));
    await repo.save(makeTx({ id: 'tx_002' }));
    await repo.save(makeTx({ id: 'tx_003' }));

    const all = await repo.getAll();
    expect(all).toHaveLength(3);
    for (const t of all) {
      expect(t.beneficiary.accountIdentifier).toBe('0123456789');
      expect(t.beneficiary.accountName).toBe('Test Beneficiary');
    }
  });

  it('getByUser decrypts results', async () => {
    const tx = makeTx({ userAddress: 'GCFXUSER001' });
    await repo.save(tx);

    const results = await repo.getByUser('GCFXUSER001');
    expect(results).toHaveLength(1);
    expect(results[0].beneficiary.accountIdentifier).toBe('0123456789');
  });

  it('getByPayoutOrderId decrypts result', async () => {
    const tx = makeTx({ payoutOrderId: 'order_xyz', status: 'completed' });
    await repo.save(tx);

    const found = await repo.getByPayoutOrderId('order_xyz');
    expect(found).not.toBeNull();
    expect(found!.beneficiary.accountIdentifier).toBe('0123456789');
    expect(found!.beneficiary.accountName).toBe('Test Beneficiary');
  });
});

// ── #792 — Ciphertext verified at rest ───────────────────────────────────────

describe('Ciphertext verified at rest', () => {
  beforeEach(setupEncryptedRepo);
  afterEach(teardownEncryptedRepo);

  it('raw inner store holds ciphertext — not plaintext — for accountIdentifier', async () => {
    const tx = makeTx();
    await repo.save(tx);

    const rawStored = await inner.getById(tx.id);
    expect(rawStored).not.toBeNull();

    const storedIdentifier = rawStored!.beneficiary.accountIdentifier;
    // Must not equal the original plaintext
    expect(storedIdentifier).not.toBe('0123456789');
    // Must be recognisable as an encrypted field (version prefix + base64)
    expect(isEncrypted(storedIdentifier)).toBe(true);
  });

  it('raw inner store holds ciphertext — not plaintext — for accountName', async () => {
    const tx = makeTx();
    await repo.save(tx);

    const rawStored = await inner.getById(tx.id);
    const storedName = rawStored!.beneficiary.accountName;

    expect(storedName).not.toBe('Test Beneficiary');
    expect(isEncrypted(storedName)).toBe(true);
  });

  it('each save produces a different ciphertext (IV randomness)', async () => {
    const tx1 = makeTx({ id: 'tx_a' });
    const tx2 = makeTx({ id: 'tx_b' });
    await repo.save(tx1);
    await repo.save(tx2);

    const raw1 = await inner.getById('tx_a');
    const raw2 = await inner.getById('tx_b');

    // Same plaintext but different ciphertext because each encryption uses a random IV
    expect(raw1!.beneficiary.accountIdentifier).not.toBe(
      raw2!.beneficiary.accountIdentifier,
    );
  });

  it('ciphertext survives an update — raw store still holds ciphertext after update', async () => {
    const tx = makeTx();
    await repo.save(tx);

    await repo.update(tx.id, {
      beneficiary: { ...tx.beneficiary, accountIdentifier: '5555555555' },
    });

    const rawAfterUpdate = await inner.getById(tx.id);
    expect(rawAfterUpdate!.beneficiary.accountIdentifier).not.toBe('5555555555');
    expect(isEncrypted(rawAfterUpdate!.beneficiary.accountIdentifier)).toBe(true);
  });

  it('non-PII fields are stored as plaintext (no over-encryption)', async () => {
    const tx = makeTx();
    await repo.save(tx);

    const raw = await inner.getById(tx.id);
    // Fields that should remain plaintext
    expect(raw!.amount).toBe('200.00');
    expect(raw!.beneficiary.institution).toBe('ACCESS_BANK');
    expect(raw!.beneficiary.currency).toBe('NGN');
    expect(isEncrypted(raw!.amount)).toBe(false);
    expect(isEncrypted(raw!.beneficiary.institution)).toBe(false);
  });
});

// ── #792 — Legacy row migration safety ───────────────────────────────────────

describe('Legacy (pre-encryption) rows', () => {
  beforeEach(setupEncryptedRepo);
  afterEach(teardownEncryptedRepo);

  it('plaintext rows saved directly to inner store are returned as-is', async () => {
    // Simulate a row that was written before encryption was introduced
    const plainTx = makeTx();
    await inner.save(plainTx); // bypass EncryptedTransactionRepository

    const loaded = await repo.getById(plainTx.id);
    expect(loaded!.beneficiary.accountIdentifier).toBe('0123456789');
    expect(loaded!.beneficiary.accountName).toBe('Test Beneficiary');
  });
});

// ── #792 — Key Rotation Procedure ────────────────────────────────────────────
/**
 * KEY ROTATION PROCEDURE (as documented here)
 * ============================================
 * 1. Generate a new AES-256 key and set it as NEW_ENCRYPTION_KEY env var.
 *    Keep the current key as ENCRYPTION_KEY (still used for decryption).
 *
 * 2. Fetch all rows that contain encrypted PII from the database.
 *
 * 3. Call rotateFieldEncryption(rows, fields) — this:
 *    a. Decrypts each PII field using ENCRYPTION_KEY (old key).
 *    b. Re-encrypts using NEW_ENCRYPTION_KEY.
 *    c. Mutates the rows in place and returns a RotationResult summary.
 *
 * 4. Persist the mutated rows back to the database (bulk update).
 *
 * 5. Verify a sample of rows by decrypting with NEW_ENCRYPTION_KEY.
 *
 * 6. Promote: set ENCRYPTION_KEY = NEW_ENCRYPTION_KEY in your secrets
 *    manager / Kubernetes secret, remove the old key. Restart services.
 *
 * 7. Confirm: NEW_ENCRYPTION_KEY env var can be cleared after promotion.
 */
describe('Key rotation procedure', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = OLD_KEY;
  });

  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
    delete process.env.NEW_ENCRYPTION_KEY;
  });

  it('re-encrypts PII fields with new key — decryptable with new key only', () => {
    // Step 1: Simulate rows already encrypted with the old key
    const plain = '0123456789';
    const encWithOldKey = encryptField(plain);
    expect(decryptField(encWithOldKey)).toBe(plain);

    const rows: Record<string, unknown>[] = [
      { beneficiary: { accountIdentifier: encWithOldKey, accountName: encryptField('Test Beneficiary') } },
    ];

    // Step 2: Set the new key and rotate
    process.env.NEW_ENCRYPTION_KEY = NEW_KEY;
    const result: RotationResult = rotateFieldEncryption(rows as any, [
      'beneficiary.accountIdentifier',
      'beneficiary.accountName',
    ]);

    // Step 3: Verify rotation counts
    expect(result.rotated).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(0);

    // Step 4: Old ciphertext is gone
    const newIdentifierCipher = (rows[0].beneficiary as any).accountIdentifier;
    expect(newIdentifierCipher).not.toBe(encWithOldKey);
    expect(isEncrypted(newIdentifierCipher)).toBe(true);

    // Step 5: New key decrypts successfully
    process.env.ENCRYPTION_KEY = NEW_KEY;
    expect(decryptField(newIdentifierCipher)).toBe(plain);
    expect(decryptField((rows[0].beneficiary as any).accountName)).toBe('Test Beneficiary');
  });

  it('old key cannot decrypt after rotation', () => {
    const plain = '0123456789';
    const rows: Record<string, unknown>[] = [
      { accountIdentifier: encryptField(plain) },
    ];

    process.env.NEW_ENCRYPTION_KEY = NEW_KEY;
    rotateFieldEncryption(rows as any, ['accountIdentifier']);

    // Try to decrypt new ciphertext with old key — should throw (AEAD auth tag failure)
    process.env.ENCRYPTION_KEY = OLD_KEY;
    expect(() => decryptField(rows[0].accountIdentifier as string)).toThrow();
  });

  it('plaintext fields are encrypted (first-time encryption during rotation)', () => {
    const rows: Record<string, unknown>[] = [{ accountIdentifier: 'plaintext_number' }];
    process.env.NEW_ENCRYPTION_KEY = NEW_KEY;

    const result = rotateFieldEncryption(rows as any, ['accountIdentifier']);
    expect(result.rotated).toBe(1);

    process.env.ENCRYPTION_KEY = NEW_KEY;
    expect(decryptField(rows[0].accountIdentifier as string)).toBe('plaintext_number');
  });

  it('rotation fails gracefully when NEW_ENCRYPTION_KEY is not set', () => {
    const rows: Record<string, unknown>[] = [
      { accountIdentifier: encryptField('secret') },
    ];
    // Do NOT set NEW_ENCRYPTION_KEY

    const result = rotateFieldEncryption(rows as any, ['accountIdentifier']);
    expect(result.failed).toBe(1);
    expect(result.errors[0]).toMatch(/NEW_ENCRYPTION_KEY/);
  });

  it('handles multiple rows in a single rotation batch', () => {
    const count = 10;
    process.env.ENCRYPTION_KEY = OLD_KEY;
    const rows = Array.from({ length: count }, (_, i) => ({
      beneficiary: {
        accountIdentifier: encryptField(`account_${i}`),
        accountName: encryptField(`name_${i}`),
      },
    }));

    process.env.NEW_ENCRYPTION_KEY = NEW_KEY;
    const result = rotateFieldEncryption(rows as any, [
      'beneficiary.accountIdentifier',
      'beneficiary.accountName',
    ]);

    expect(result.rotated).toBe(count * 2); // 2 fields × 10 rows
    expect(result.failed).toBe(0);

    // Spot-check: verify first and last rows with new key
    process.env.ENCRYPTION_KEY = NEW_KEY;
    expect(decryptField((rows[0].beneficiary as any).accountIdentifier)).toBe('account_0');
    expect(decryptField((rows[count - 1].beneficiary as any).accountName)).toBe(`name_${count - 1}`);
  });
});

// ── #792 — Encryption utility correctness ────────────────────────────────────

describe('encryptField / decryptField integrity', () => {
  beforeEach(() => { process.env.ENCRYPTION_KEY = OLD_KEY; });
  afterEach(() => { delete process.env.ENCRYPTION_KEY; });

  it('decrypts to the exact original plaintext including Unicode', () => {
    const inputs = ['1234567890', 'Alice Ọlá', 'Müller', '이름', '🇳🇬'];
    for (const plain of inputs) {
      expect(decryptField(encryptField(plain))).toBe(plain);
    }
  });

  it('tampered auth tag causes decryption to throw', () => {
    const cipher = encryptField('secret');
    const [ver, b64] = cipher.split(':');
    const buf = Buffer.from(b64, 'base64');
    buf[buf.length - 1] ^= 0xff;
    expect(() => decryptField(`${ver}:${buf.toString('base64')}`)).toThrow();
  });

  it('isEncrypted correctly discriminates ciphertext from plaintext', () => {
    expect(isEncrypted(encryptField('hello'))).toBe(true);
    expect(isEncrypted('1234567890')).toBe(false);
    expect(isEncrypted('plain text with spaces')).toBe(false);
  });
});
