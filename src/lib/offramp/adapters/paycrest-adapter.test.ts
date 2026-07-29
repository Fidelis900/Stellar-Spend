import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PaycrestAdapter } from './paycrest-adapter';

describe('PaycrestAdapter', () => {
  let adapter: PaycrestAdapter;

  beforeEach(() => {
    adapter = new PaycrestAdapter();
  });

  describe('createPayoutOrder', () => {
    it('should create payout order with valid data', async () => {
      const order = await adapter.createPayoutOrder({
        amount: '100',
        currency: 'NGN',
        beneficiary: {
          accountNumber: '1234567890',
          bankCode: '044',
          name: 'John Doe',
        },
      });

      expect(order).toBeDefined();
      expect(order.orderId).toBeDefined();
      expect(order.status).toBe('pending');
    });

    it('should throw for invalid amount', async () => {
      await expect(
        adapter.createPayoutOrder({
          amount: '-100',
          currency: 'NGN',
          beneficiary: {
            accountNumber: '1234567890',
            bankCode: '044',
            name: 'John Doe',
          },
        }),
      ).rejects.toThrow();
    });

    it('should throw for unsupported currency', async () => {
      await expect(
        adapter.createPayoutOrder({
          amount: '100',
          currency: 'INVALID',
          beneficiary: {
            accountNumber: '1234567890',
            bankCode: '044',
            name: 'John Doe',
          },
        }),
      ).rejects.toThrow();
    });

    it('should throw for missing beneficiary data', async () => {
      await expect(
        adapter.createPayoutOrder({
          amount: '100',
          currency: 'NGN',
          beneficiary: {
            accountNumber: '',
            bankCode: '044',
            name: 'John Doe',
          },
        }),
      ).rejects.toThrow();
    });
  });

  describe('getOrderStatus', () => {
    it('should return order status', async () => {
      const status = await adapter.getOrderStatus('order-123');
      expect(status).toBeDefined();
      expect(['pending', 'processing', 'completed', 'failed']).toContain(status.status);
    });

    it('should throw for invalid order ID', async () => {
      await expect(adapter.getOrderStatus('')).rejects.toThrow();
    });
  });

  describe('verifyBeneficiary', () => {
    it('should verify valid beneficiary account', async () => {
      const result = await adapter.verifyBeneficiary({
        accountNumber: '1234567890',
        bankCode: '044',
      });

      expect(result).toBeDefined();
      expect(result.valid).toBe(true);
    });

    it('should reject invalid account number', async () => {
      const result = await adapter.verifyBeneficiary({
        accountNumber: 'invalid',
        bankCode: '044',
      });

      expect(result.valid).toBe(false);
    });

    it('should throw for missing bank code', async () => {
      await expect(
        adapter.verifyBeneficiary({
          accountNumber: '1234567890',
          bankCode: '',
        }),
      ).rejects.toThrow();
    });
  });

  describe('getSupportedCurrencies', () => {
    it('should return list of supported currencies', async () => {
      const currencies = await adapter.getSupportedCurrencies();
      expect(Array.isArray(currencies)).toBe(true);
      expect(currencies.length).toBeGreaterThan(0);
    });

    it('should include NGN', async () => {
      const currencies = await adapter.getSupportedCurrencies();
      expect(currencies).toContain('NGN');
    });
  });
});
