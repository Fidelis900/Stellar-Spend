import { describe, it, expect } from 'vitest';
import { floatToInt, getNonceBigInt } from './soroban-tx-builder';

describe('Soroban Number Conversion Utilities', () => {
  describe('floatToInt', () => {
    it('should convert "10.5" with 7 decimals to "105000000"', () => {
      const result = floatToInt('10.5', 7);
      expect(result).toBe('105000000');
    });

    it('should convert "1" with 7 decimals to "10000000"', () => {
      const result = floatToInt('1', 7);
      expect(result).toBe('10000000');
    });

    it('should convert "0.0000001" with 7 decimals to "1"', () => {
      const result = floatToInt('0.0000001', 7);
      expect(result).toBe('1');
    });

    it('should truncate "10.12345678" with 7 decimals to "101234567"', () => {
      const result = floatToInt('10.12345678', 7);
      expect(result).toBe('101234567');
    });

    it('should handle zero value', () => {
      const result = floatToInt('0', 7);
      expect(result).toBe('0');
    });

    it('should handle large numbers', () => {
      const result = floatToInt('1000000.5', 7);
      expect(result).toBe('10000005000000');
    });

    it('should handle numbers with no decimal part', () => {
      const result = floatToInt('42', 7);
      expect(result).toBe('420000000');
    });

    it('should pad fractional part when shorter than decimals', () => {
      const result = floatToInt('10.5', 7);
      expect(result).toBe('105000000');
    });
  });

  describe('getNonceBigInt', () => {
    it('should return a positive BigInt value', () => {
      const nonce = getNonceBigInt();
      expect(typeof nonce).toBe('bigint');
      expect(nonce).toBeGreaterThan(BigInt(0));
    });

    it('should return different values on each call', () => {
      const nonce1 = getNonceBigInt();
      const nonce2 = getNonceBigInt();
      const nonce3 = getNonceBigInt();

      expect(nonce1).not.toBe(nonce2);
      expect(nonce2).not.toBe(nonce3);
      expect(nonce1).not.toBe(nonce3);
    });

    it('should consistently return positive values across multiple calls', () => {
      const nonces = Array.from({ length: 10 }, () => getNonceBigInt());

      nonces.forEach((nonce) => {
        expect(nonce).toBeGreaterThan(BigInt(0));
      });
    });

    it('should generate unique nonces', () => {
      const nonces = Array.from({ length: 100 }, () => getNonceBigInt());
      const uniqueNonces = new Set(nonces.map((n) => n.toString()));

      expect(uniqueNonces.size).toBe(100);
    });
  });
});
