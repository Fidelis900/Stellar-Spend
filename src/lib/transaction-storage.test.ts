import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TransactionStorage, type Transaction } from './transaction-storage';
import { createTestTransaction, createLocalStorageMock } from '@/test/test-helpers';

describe('TransactionStorage', () => {
  let localStorageMock: ReturnType<typeof createLocalStorageMock>;

  beforeEach(() => {
    // Create and set up localStorage mock
    localStorageMock = createLocalStorageMock();
    Object.defineProperty(global, 'window', {
      value: { localStorage: localStorageMock },
      writable: true,
    });
    Object.defineProperty(global, 'localStorage', {
      value: localStorageMock,
      writable: true,
    });

    // Clear storage before each test
    TransactionStorage.clear();
  });

  describe('save()', () => {
    it('should persist transaction to storage', () => {
      const transaction = createTestTransaction();
      TransactionStorage.save(transaction);

      const all = TransactionStorage.getAll();
      expect(all).toHaveLength(1);
      expect(all[0]).toEqual(transaction);
    });

    it('should prepend new transactions to array (newest first)', () => {
      const tx1 = createTestTransaction({ id: 'tx1', amount: '100' });
      const tx2 = createTestTransaction({ id: 'tx2', amount: '200' });
      const tx3 = createTestTransaction({ id: 'tx3', amount: '300' });

      TransactionStorage.save(tx1);
      TransactionStorage.save(tx2);
      TransactionStorage.save(tx3);

      const all = TransactionStorage.getAll();
      expect(all).toHaveLength(3);
      expect(all[0].id).toBe('tx3'); // Most recent first
      expect(all[1].id).toBe('tx2');
      expect(all[2].id).toBe('tx1');
    });

    it('should trim storage to 50 transactions when exceeded', () => {
      // Save 55 transactions
      for (let i = 0; i < 55; i++) {
        const tx = createTestTransaction({ id: `tx${i}`, amount: `${i}` });
        TransactionStorage.save(tx);
      }

      const all = TransactionStorage.getAll();
      expect(all).toHaveLength(50);

      // Should keep the 50 most recent (tx54 to tx5)
      expect(all[0].id).toBe('tx54');
      expect(all[49].id).toBe('tx5');
    });

    it('should make transactions retrievable via getAll()', () => {
      const tx1 = createTestTransaction({ id: 'tx1' });
      const tx2 = createTestTransaction({ id: 'tx2' });

      TransactionStorage.save(tx1);
      TransactionStorage.save(tx2);

      const all = TransactionStorage.getAll();
      expect(all).toContainEqual(tx1);
      expect(all).toContainEqual(tx2);
    });
  });

  describe('update()', () => {
    it('should modify existing transaction', () => {
      const transaction = createTestTransaction({ id: 'tx1', status: 'pending' });
      TransactionStorage.save(transaction);

      TransactionStorage.update('tx1', { status: 'completed' });

      const updated = TransactionStorage.getById('tx1');
      expect(updated?.status).toBe('completed');
    });

    it('should persist updates to storage', () => {
      const transaction = createTestTransaction({ id: 'tx1', amount: '100' });
      TransactionStorage.save(transaction);

      TransactionStorage.update('tx1', { amount: '200', stellarTxHash: 'hash123' });

      const all = TransactionStorage.getAll();
      const updated = all.find((tx) => tx.id === 'tx1');
      expect(updated?.amount).toBe('200');
      expect(updated?.stellarTxHash).toBe('hash123');
    });

    it('should handle non-existent IDs gracefully', () => {
      const transaction = createTestTransaction({ id: 'tx1' });
      TransactionStorage.save(transaction);

      // Should not throw
      TransactionStorage.update('nonexistent', { status: 'completed' });

      const all = TransactionStorage.getAll();
      expect(all).toHaveLength(1);
      expect(all[0].id).toBe('tx1');
    });

    it('should handle partial updates correctly', () => {
      const transaction = createTestTransaction({
        id: 'tx1',
        amount: '100',
        status: 'pending',
        currency: 'USDC',
      });
      TransactionStorage.save(transaction);

      TransactionStorage.update('tx1', { status: 'completed' });

      const updated = TransactionStorage.getById('tx1');
      expect(updated?.status).toBe('completed');
      expect(updated?.amount).toBe('100'); // Should remain unchanged
      expect(updated?.currency).toBe('USDC'); // Should remain unchanged
    });
  });

  describe('retrieval methods', () => {
    describe('getAll()', () => {
      it('should return empty array when storage is empty', () => {
        const all = TransactionStorage.getAll();
        expect(all).toEqual([]);
      });

      it('should return all stored transactions', () => {
        const tx1 = createTestTransaction({ id: 'tx1' });
        const tx2 = createTestTransaction({ id: 'tx2' });
        const tx3 = createTestTransaction({ id: 'tx3' });

        TransactionStorage.save(tx1);
        TransactionStorage.save(tx2);
        TransactionStorage.save(tx3);

        const all = TransactionStorage.getAll();
        expect(all).toHaveLength(3);
      });
    });

    describe('getByUser()', () => {
      it('should filter by address correctly', () => {
        const user1Address = 'GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDE';
        const user2Address = 'GXYZ9876543210ZYXWVUTSRQPONMLKJIHGFEDCBA9876543210ZYXW';

        const tx1 = createTestTransaction({ id: 'tx1', userAddress: user1Address });
        const tx2 = createTestTransaction({ id: 'tx2', userAddress: user2Address });
        const tx3 = createTestTransaction({ id: 'tx3', userAddress: user1Address });

        TransactionStorage.save(tx1);
        TransactionStorage.save(tx2);
        TransactionStorage.save(tx3);

        const user1Txs = TransactionStorage.getByUser(user1Address);
        expect(user1Txs).toHaveLength(2);
        expect(user1Txs.map((tx) => tx.id)).toContain('tx1');
        expect(user1Txs.map((tx) => tx.id)).toContain('tx3');
      });

      it('should be case-insensitive', () => {
        const address = 'GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDE';
        const tx = createTestTransaction({ id: 'tx1', userAddress: address });

        TransactionStorage.save(tx);

        const lowercase = TransactionStorage.getByUser(address.toLowerCase());
        const uppercase = TransactionStorage.getByUser(address.toUpperCase());
        const mixed = TransactionStorage.getByUser(
          'gabc1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcde',
        );

        expect(lowercase).toHaveLength(1);
        expect(uppercase).toHaveLength(1);
        expect(mixed).toHaveLength(1);
      });

      it('should return same set of transactions regardless of case', () => {
        const address = 'GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDE';
        const tx1 = createTestTransaction({ id: 'tx1', userAddress: address });
        const tx2 = createTestTransaction({ id: 'tx2', userAddress: address.toLowerCase() });

        TransactionStorage.save(tx1);
        TransactionStorage.save(tx2);

        const result1 = TransactionStorage.getByUser(address);
        const result2 = TransactionStorage.getByUser(address.toLowerCase());
        const result3 = TransactionStorage.getByUser(address.toUpperCase());

        expect(result1).toHaveLength(2);
        expect(result2).toHaveLength(2);
        expect(result3).toHaveLength(2);
      });
    });

    describe('getById()', () => {
      it('should return correct transaction', () => {
        const tx1 = createTestTransaction({ id: 'tx1', amount: '100' });
        const tx2 = createTestTransaction({ id: 'tx2', amount: '200' });

        TransactionStorage.save(tx1);
        TransactionStorage.save(tx2);

        const result = TransactionStorage.getById('tx1');
        expect(result).toEqual(tx1);
      });

      it('should return undefined for non-existent ID', () => {
        const tx = createTestTransaction({ id: 'tx1' });
        TransactionStorage.save(tx);

        const result = TransactionStorage.getById('nonexistent');
        expect(result).toBeUndefined();
      });
    });
  });

  describe('clear() and generateId()', () => {
    describe('clear()', () => {
      it('should remove all transactions from storage', () => {
        const tx1 = createTestTransaction({ id: 'tx1' });
        const tx2 = createTestTransaction({ id: 'tx2' });

        TransactionStorage.save(tx1);
        TransactionStorage.save(tx2);

        expect(TransactionStorage.getAll()).toHaveLength(2);

        TransactionStorage.clear();

        expect(TransactionStorage.getAll()).toHaveLength(0);
      });

      it('should result in empty storage', () => {
        const tx = createTestTransaction();
        TransactionStorage.save(tx);

        TransactionStorage.clear();

        const all = TransactionStorage.getAll();
        expect(all).toEqual([]);
      });
    });

    describe('generateId()', () => {
      it('should return unique IDs on each call', () => {
        const id1 = TransactionStorage.generateId();
        const id2 = TransactionStorage.generateId();
        const id3 = TransactionStorage.generateId();

        expect(id1).not.toBe(id2);
        expect(id2).not.toBe(id3);
        expect(id1).not.toBe(id3);
      });

      it('should generate IDs with expected format', () => {
        const id = TransactionStorage.generateId();

        // Should start with 'tx_'
        expect(id).toMatch(/^tx_/);

        // Should contain timestamp and random string
        expect(id).toMatch(/^tx_\d+_[a-z0-9]+$/);
      });

      it('should generate many unique IDs', () => {
        const ids = new Set<string>();

        for (let i = 0; i < 100; i++) {
          ids.add(TransactionStorage.generateId());
        }

        // All IDs should be unique
        expect(ids.size).toBe(100);
      });
    });
  });
});
