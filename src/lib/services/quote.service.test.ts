import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QuoteService } from './quote.service';

describe('QuoteService', () => {
  let service: QuoteService;

  beforeEach(() => {
    service = new QuoteService();
  });

  describe('getQuote', () => {
    it('should return quote for valid parameters', async () => {
      const quote = await service.getQuote({
        amount: '100',
        currency: 'NGN',
        feeMethod: 'USDC',
      });

      expect(quote).toBeDefined();
      expect(quote.destinationAmount).toBeDefined();
      expect(quote.rate).toBeGreaterThan(0);
      expect(quote.currency).toBe('NGN');
    });

    it('should throw for invalid amount', async () => {
      await expect(
        service.getQuote({
          amount: '-100',
          currency: 'NGN',
          feeMethod: 'USDC',
        }),
      ).rejects.toThrow();
    });

    it('should throw for unsupported currency', async () => {
      await expect(
        service.getQuote({
          amount: '100',
          currency: 'INVALID',
          feeMethod: 'USDC',
        }),
      ).rejects.toThrow();
    });

    it('should include fees in quote', async () => {
      const quote = await service.getQuote({
        amount: '100',
        currency: 'NGN',
        feeMethod: 'USDC',
      });

      expect(quote.bridgeFee).toBeDefined();
      expect(quote.payoutFee).toBeDefined();
    });
  });

  describe('getRate', () => {
    it('should return current exchange rate', async () => {
      const rate = await service.getRate('NGN');
      expect(rate).toBeGreaterThan(0);
    });

    it('should throw for unsupported currency', async () => {
      await expect(service.getRate('INVALID')).rejects.toThrow();
    });

    it('should cache rates', async () => {
      const rate1 = await service.getRate('NGN');
      const rate2 = await service.getRate('NGN');
      expect(rate1).toBe(rate2);
    });
  });

  describe('calculateFees', () => {
    it('should calculate fees correctly', async () => {
      const fees = await service.calculateFees({
        amount: '100',
        currency: 'NGN',
        feeMethod: 'USDC',
      });

      expect(fees.bridgeFee).toBeGreaterThanOrEqual(0);
      expect(fees.payoutFee).toBeGreaterThanOrEqual(0);
      expect(fees.total).toBe(fees.bridgeFee + fees.payoutFee);
    });

    it('should handle zero fees', async () => {
      const fees = await service.calculateFees({
        amount: '100',
        currency: 'NGN',
        feeMethod: 'native',
      });

      expect(fees.total).toBeGreaterThanOrEqual(0);
    });
  });
});
