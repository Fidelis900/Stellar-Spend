import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  encryptData,
  decryptData,
  encryptObject,
  decryptObject,
  hashData,
  verifyHash,
  generateEncryptionKey,
  encryptSensitiveFields,
  decryptSensitiveFields,
  encryptLocalStorageData,
  decryptLocalStorageData,
  encryptLogEntry,
  encryptBackupData,
  decryptBackupData,
} from './encryption';

describe('Encryption Module', () => {
  describe('encryptData and decryptData', () => {
    it('should encrypt and decrypt string data', () => {
      const plaintext = 'Hello, World!';
      const encrypted = encryptData(plaintext);
      const decrypted = decryptData(encrypted);

      expect(encrypted).not.toBe(plaintext);
      expect(decrypted).toBe(plaintext);
    });

    it('should encrypt and decrypt buffer data', () => {
      const plaintext = Buffer.from('Hello, World!');
      const encrypted = encryptData(plaintext);
      const decrypted = decryptData(encrypted);

      expect(encrypted).not.toBe(plaintext.toString());
      expect(decrypted).toBe(plaintext.toString());
    });

    it('should produce different ciphertexts for same plaintext', () => {
      const plaintext = 'Hello, World!';
      const encrypted1 = encryptData(plaintext);
      const encrypted2 = encryptData(plaintext);

      expect(encrypted1).not.toBe(encrypted2);
      expect(decryptData(encrypted1)).toBe(plaintext);
      expect(decryptData(encrypted2)).toBe(plaintext);
    });

    it('should handle empty strings', () => {
      const plaintext = '';
      const encrypted = encryptData(plaintext);
      const decrypted = decryptData(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle large data', () => {
      const plaintext = 'x'.repeat(10000);
      const encrypted = encryptData(plaintext);
      const decrypted = decryptData(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should throw on invalid encrypted data', () => {
      expect(() => decryptData('invalid-base64-data')).toThrow();
    });

    it('should throw on tampered data', () => {
      const plaintext = 'Hello, World!';
      const encrypted = encryptData(plaintext);
      const tampered = Buffer.from(encrypted, 'base64');
      tampered[tampered.length - 1] ^= 0xff; // Flip bits
      const tamperedEncrypted = tampered.toString('base64');

      expect(() => decryptData(tamperedEncrypted)).toThrow();
    });
  });

  describe('encryptObject and decryptObject', () => {
    it('should encrypt and decrypt objects', () => {
      const obj = { name: 'John', age: 30, email: 'john@example.com' };
      const encrypted = encryptObject(obj);
      const decrypted = decryptObject(encrypted);

      expect(decrypted).toEqual(obj);
    });

    it('should handle nested objects', () => {
      const obj = {
        user: { name: 'John', address: { city: 'NYC' } },
        tags: ['tag1', 'tag2'],
      };
      const encrypted = encryptObject(obj);
      const decrypted = decryptObject(encrypted);

      expect(decrypted).toEqual(obj);
    });

    it('should handle null and undefined values', () => {
      const obj = { a: null, b: undefined, c: 'value' };
      const encrypted = encryptObject(obj);
      const decrypted = decryptObject(encrypted);

      expect(decrypted).toEqual(obj);
    });
  });

  describe('hashData and verifyHash', () => {
    it('should hash string data', () => {
      const data = 'Hello, World!';
      const hash = hashData(data);

      expect(hash).toHaveLength(64); // SHA-256 hex is 64 chars
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should hash buffer data', () => {
      const data = Buffer.from('Hello, World!');
      const hash = hashData(data);

      expect(hash).toHaveLength(64);
    });

    it('should produce same hash for same data', () => {
      const data = 'Hello, World!';
      const hash1 = hashData(data);
      const hash2 = hashData(data);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different data', () => {
      const hash1 = hashData('Hello');
      const hash2 = hashData('World');

      expect(hash1).not.toBe(hash2);
    });

    it('should verify correct hash', () => {
      const data = 'Hello, World!';
      const hash = hashData(data);

      expect(verifyHash(data, hash)).toBe(true);
    });

    it('should reject incorrect hash', () => {
      const data = 'Hello, World!';
      const wrongHash = hashData('Different data');

      expect(verifyHash(data, wrongHash)).toBe(false);
    });
  });

  describe('generateEncryptionKey', () => {
    it('should generate a valid encryption key', () => {
      const key = generateEncryptionKey();

      expect(key).toHaveLength(64); // 32 bytes in hex
      expect(key).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should generate different keys', () => {
      const key1 = generateEncryptionKey();
      const key2 = generateEncryptionKey();

      expect(key1).not.toBe(key2);
    });
  });

  describe('encryptSensitiveFields and decryptSensitiveFields', () => {
    it('should encrypt specified sensitive fields', () => {
      const obj = {
        name: 'John',
        password: 'secret123',
        email: 'john@example.com',
      };

      const encrypted = encryptSensitiveFields(obj, ['password']);

      expect(encrypted.name).toBe('John');
      expect(encrypted.email).toBe('john@example.com');
      expect(encrypted.password).toBeUndefined();
      expect(encrypted.password_encrypted).toBeDefined();
      expect(encrypted.password_encrypted).not.toBe('secret123');
    });

    it('should decrypt sensitive fields', () => {
      const obj = {
        name: 'John',
        password: 'secret123',
        email: 'john@example.com',
      };

      const encrypted = encryptSensitiveFields(obj, ['password']);
      const decrypted = decryptSensitiveFields(encrypted, ['password']);

      expect(decrypted.password).toBe('secret123');
      expect(decrypted.name).toBe('John');
      expect(decrypted.email).toBe('john@example.com');
    });

    it('should handle multiple sensitive fields', () => {
      const obj = {
        name: 'John',
        password: 'secret123',
        apiKey: 'key456',
        email: 'john@example.com',
      };

      const encrypted = encryptSensitiveFields(obj, ['password', 'apiKey']);

      expect(encrypted.password).toBeUndefined();
      expect(encrypted.apiKey).toBeUndefined();
      expect(encrypted.password_encrypted).toBeDefined();
      expect(encrypted.apiKey_encrypted).toBeDefined();
    });

    it('should handle missing sensitive fields', () => {
      const obj = { name: 'John', email: 'john@example.com' };
      const encrypted = encryptSensitiveFields(obj, ['password']);

      expect(encrypted.name).toBe('John');
      expect(encrypted.password_encrypted).toBeUndefined();
    });
  });

  describe('encryptLogEntry', () => {
    it('should hash sensitive fields in log entries', () => {
      const entry = {
        action: 'login',
        password: 'secret123',
        token: 'abc123',
        timestamp: Date.now(),
      };

      const encrypted = encryptLogEntry(entry);

      expect(encrypted.action).toBe('login');
      expect(encrypted.timestamp).toBe(entry.timestamp);
      expect(encrypted.password).toBeUndefined();
      expect(encrypted.token).toBeUndefined();
      expect(encrypted.password_hash).toBeDefined();
      expect(encrypted.token_hash).toBeDefined();
    });

    it('should not hash non-sensitive fields', () => {
      const entry = {
        action: 'login',
        userId: '123',
        timestamp: Date.now(),
      };

      const encrypted = encryptLogEntry(entry);

      expect(encrypted.action).toBe('login');
      expect(encrypted.userId).toBe('123');
    });
  });

  describe('encryptBackupData and decryptBackupData', () => {
    it('should encrypt and decrypt backup data', () => {
      const data = {
        transactions: [{ id: '1', amount: 100 }],
        user: { name: 'John' },
      };

      const encrypted = encryptBackupData(data);
      const decrypted = decryptBackupData(encrypted);

      expect(decrypted).toEqual(data);
    });

    it('should include version and timestamp in backup', () => {
      const data = { test: 'data' };
      const encrypted = encryptBackupData(data);
      const backup = JSON.parse(encrypted);

      expect(backup.version).toBe(1);
      expect(backup.timestamp).toBeDefined();
      expect(backup.encrypted).toBeDefined();
      expect(backup.checksum).toBeDefined();
    });

    it('should verify backup integrity', () => {
      const data = { test: 'data' };
      const encrypted = encryptBackupData(data);
      const backup = JSON.parse(encrypted);

      // Tamper with encrypted data
      backup.encrypted = Buffer.from(backup.encrypted, 'base64').slice(0, -1).toString('base64');

      const tampered = JSON.stringify(backup);
      const decrypted = decryptBackupData(tampered);

      expect(decrypted).toBeNull();
    });

    it('should reject invalid backup format', () => {
      const decrypted = decryptBackupData('invalid json');
      expect(decrypted).toBeNull();
    });

    it('should reject unsupported backup version', () => {
      const backup = JSON.stringify({
        version: 2,
        timestamp: Date.now(),
        encrypted: 'data',
        checksum: 'hash',
      });

      const decrypted = decryptBackupData(backup);
      expect(decrypted).toBeNull();
    });
  });

  describe('encryptLocalStorageData and decryptLocalStorageData', () => {
    beforeEach(() => {
      // Mock localStorage
      const store: Record<string, string> = {};
      global.localStorage = {
        getItem: (key: string) => store[key] || null,
        setItem: (key: string, value: string) => {
          store[key] = value;
        },
        removeItem: (key: string) => {
          delete store[key];
        },
        clear: () => {
          Object.keys(store).forEach((key) => delete store[key]);
        },
        length: 0,
        key: () => null,
      } as Storage;
    });

    it('should encrypt and decrypt localStorage data', () => {
      const key = 'testKey';
      const value = { name: 'John', age: 30 };

      encryptLocalStorageData(key, value);
      const decrypted = decryptLocalStorageData(key);

      expect(decrypted).toEqual(value);
    });

    it('should remove unencrypted version after encryption', () => {
      const key = 'testKey';
      localStorage.setItem(key, 'unencrypted');

      encryptLocalStorageData(key, 'encrypted');

      expect(localStorage.getItem(key)).toBeNull();
      expect(localStorage.getItem(`encrypted_${key}`)).toBeDefined();
    });

    it('should return null for non-existent keys', () => {
      const decrypted = decryptLocalStorageData('nonExistent');
      expect(decrypted).toBeNull();
    });

    it('should handle string values', () => {
      const key = 'testKey';
      const value = 'test string';

      encryptLocalStorageData(key, value);
      const decrypted = decryptLocalStorageData(key);

      expect(decrypted).toBe(value);
    });

    it('should fallback to unencrypted data for migration', () => {
      const key = 'testKey';
      const value = { name: 'John' };
      localStorage.setItem(key, JSON.stringify(value));

      const decrypted = decryptLocalStorageData(key);

      expect(decrypted).toEqual(value);
    });
  });
});
