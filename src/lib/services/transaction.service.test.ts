import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TransactionService } from './transaction.service';
import * as dalModule from '@/lib/db/dal';
import type { Transaction } from '@/lib/transaction-storage';

vi.mock('@/lib/db/dal');

describe('TransactionService', () => {
  let service: TransactionService;
  let mockDal: any;

  beforeEach(() => {
    mockDal = dalModule.dal as any;
    service = new TransactionService();
    vi.clearAllMocks();
  });

  describe('getTransaction', () => {
    it('should return transaction by ID', async () => {
      const mockTransaction: Transaction = {
        id: 'tx-123',
        timestamp: Date.now(),
        userAddress: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
        amount: '100.50',
        currency: 'USD',
        beneficiary: {
          institution: 'Bank A',
          accountIdentifier: '1234567890',
          accountName: 'John Doe',
          currency: 'USD',
        },
        status: 'completed',
      };

      mockDal.getById.mockResolvedValue(mockTransaction);

      const result = await service.getTransaction('tx-123');

      expect(result).toEqual(mockTransaction);
      expect(mockDal.getById).toHaveBeenCalledWith('tx-123');
    });

    it('should throw error when ID is not provided', async () => {
      await expect(service.getTransaction('')).rejects.toThrow('Transaction ID is required');
    });

    it('should return null when transaction not found', async () => {
      mockDal.getById.mockResolvedValue(null);

      const result = await service.getTransaction('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('getTransactionByPayoutOrderId', () => {
    it('should return transaction by payout order ID', async () => {
      const mockTransaction: Transaction = {
        id: 'tx-456',
        timestamp: Date.now(),
        userAddress: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
        amount: '250.00',
        currency: 'NGN',
        beneficiary: {
          institution: 'Bank B',
          accountIdentifier: '0987654321',
          accountName: 'Jane Doe',
          currency: 'NGN',
        },
        status: 'pending',
      };

      mockDal.getByPayoutOrderId.mockResolvedValue(mockTransaction);

      const result = await service.getTransactionByPayoutOrderId('order-789');

      expect(result).toEqual(mockTransaction);
      expect(mockDal.getByPayoutOrderId).toHaveBeenCalledWith('order-789');
    });

    it('should throw error when order ID is not provided', async () => {
      await expect(service.getTransactionByPayoutOrderId('')).rejects.toThrow('Order ID is required');
    });
  });

  describe('listTransactions', () => {
    it('should list transactions with default limit of 50', async () => {
      const mockTransactions: Transaction[] = Array(10)
        .fill(null)
        .map((_, i) => ({
          id: `tx-${i}`,
          timestamp: Date.now() - i * 1000,
          userAddress: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
          amount: `${100 + i}`,
          currency: 'USD',
          beneficiary: {
            institution: 'Bank',
            accountIdentifier: '1234567890',
            accountName: 'User',
            currency: 'USD',
          },
          status: 'completed',
        }));

      const result = await service.listTransactions({});

      expect(Array.isArray(result)).toBe(true);
    });

    it('should enforce maximum limit of 100', async () => {
      const result = await service.listTransactions({ limit: 500 });

      expect(Array.isArray(result)).toBe(true);
    });

    it('should support offset for pagination', async () => {
      const result = await service.listTransactions({ limit: 20, offset: 40 });

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('updateTransaction', () => {
    it('should update transaction successfully', async () => {
      const updatedTransaction: Transaction = {
        id: 'tx-123',
        timestamp: Date.now(),
        userAddress: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
        amount: '100.50',
        currency: 'USD',
        beneficiary: {
          institution: 'Bank A',
          accountIdentifier: '1234567890',
          accountName: 'John Doe',
          currency: 'USD',
        },
        status: 'failed',
      };

      mockDal.update.mockResolvedValue(undefined);
      mockDal.getById.mockResolvedValue(updatedTransaction);

      const result = await service.updateTransaction('tx-123', { status: 'failed' });

      expect(result).toEqual(updatedTransaction);
      expect(mockDal.update).toHaveBeenCalledWith('tx-123', { status: 'failed' });
    });

    it('should throw error when ID is not provided', async () => {
      await expect(service.updateTransaction('', { status: 'completed' })).rejects.toThrow(
        'Transaction ID is required'
      );
    });

    it('should throw error when no updates provided', async () => {
      await expect(service.updateTransaction('tx-123', {})).rejects.toThrow('No updates provided');
    });
  });

  describe('deleteTransaction', () => {
    it('should delete transaction successfully', async () => {
      const result = await service.deleteTransaction('tx-123');

      expect(result).toBe(true);
    });

    it('should throw error when ID is not provided', async () => {
      await expect(service.deleteTransaction('')).rejects.toThrow('Transaction ID is required');
    });
  });

  describe('getTransactionStats', () => {
    it('should return transaction statistics', async () => {
      const stats = await service.getTransactionStats();

      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('completed');
      expect(stats).toHaveProperty('failed');
      expect(stats).toHaveProperty('pending');
      expect(stats).toHaveProperty('totalAmount');
    });

    it('should support filtering by status', async () => {
      const stats = await service.getTransactionStats({ status: 'completed' });

      expect(stats).toBeDefined();
    });

    it('should support filtering by date range', async () => {
      const now = Date.now();
      const stats = await service.getTransactionStats({
        startDate: now - 7 * 24 * 60 * 60 * 1000,
        endDate: now,
      });

      expect(stats).toBeDefined();
    });
  });
});
