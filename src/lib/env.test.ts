import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { validateEnv, env } from './env';

describe('env.ts', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('validateEnv', () => {
    it('should return server and public env vars when all required vars are set', () => {
      process.env.PAYCREST_API_KEY = 'test-api-key';
      process.env.PAYCREST_WEBHOOK_SECRET = 'test-secret';
      process.env.BASE_PRIVATE_KEY = '0x1234567890';
      process.env.BASE_RETURN_ADDRESS = '0xabcd';
      process.env.BASE_RPC_URL = 'https://base-rpc';
      process.env.STELLAR_SOROBAN_RPC_URL = 'https://soroban-rpc';
      process.env.STELLAR_HORIZON_URL = 'https://horizon';
      process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
      process.env.NEXT_PUBLIC_STELLAR_SOROBAN_RPC_URL = 'https://public-soroban';
      process.env.NEXT_PUBLIC_BASE_RETURN_ADDRESS = '0xpublic';
      process.env.NEXT_PUBLIC_STELLAR_USDC_ISSUER = 'GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTQSXUSMIQ75XABZEYYWRB6HP';

      const result = validateEnv();

      expect(result).toHaveProperty('server');
      expect(result).toHaveProperty('public');
      expect(result.server.PAYCREST_API_KEY).toBe('test-api-key');
      expect(result.public.NEXT_PUBLIC_STELLAR_SOROBAN_RPC_URL).toBe('https://public-soroban');
    });

    it('should throw error when required server env var is missing', () => {
      // Set all but one required var
      process.env.PAYCREST_API_KEY = 'test-api-key';
      process.env.PAYCREST_WEBHOOK_SECRET = 'test-secret';
      process.env.BASE_PRIVATE_KEY = '0x1234567890';
      process.env.BASE_RETURN_ADDRESS = '0xabcd';
      process.env.BASE_RPC_URL = 'https://base-rpc';
      process.env.STELLAR_SOROBAN_RPC_URL = 'https://soroban-rpc';
      process.env.STELLAR_HORIZON_URL = 'https://horizon';
      delete process.env.DATABASE_URL;
      process.env.NEXT_PUBLIC_STELLAR_SOROBAN_RPC_URL = 'https://public-soroban';
      process.env.NEXT_PUBLIC_BASE_RETURN_ADDRESS = '0xpublic';
      process.env.NEXT_PUBLIC_STELLAR_USDC_ISSUER = 'GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTQSXUSMIQ75XABZEYYWRB6HP';

      expect(() => validateEnv()).toThrow('Missing required server env vars');
      expect(() => validateEnv()).toThrow('DATABASE_URL');
    });

    it('should throw error when required public env var is missing', () => {
      process.env.PAYCREST_API_KEY = 'test-api-key';
      process.env.PAYCREST_WEBHOOK_SECRET = 'test-secret';
      process.env.BASE_PRIVATE_KEY = '0x1234567890';
      process.env.BASE_RETURN_ADDRESS = '0xabcd';
      process.env.BASE_RPC_URL = 'https://base-rpc';
      process.env.STELLAR_SOROBAN_RPC_URL = 'https://soroban-rpc';
      process.env.STELLAR_HORIZON_URL = 'https://horizon';
      process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
      process.env.NEXT_PUBLIC_STELLAR_SOROBAN_RPC_URL = 'https://public-soroban';
      delete process.env.NEXT_PUBLIC_BASE_RETURN_ADDRESS;
      process.env.NEXT_PUBLIC_STELLAR_USDC_ISSUER = 'GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTQSXUSMIQ75XABZEYYWRB6HP';

      expect(() => validateEnv()).toThrow('Missing required public env vars');
      expect(() => validateEnv()).toThrow('NEXT_PUBLIC_BASE_RETURN_ADDRESS');
    });

    it('should throw error when forbidden public secret keys are set', () => {
      process.env.PAYCREST_API_KEY = 'test-api-key';
      process.env.PAYCREST_WEBHOOK_SECRET = 'test-secret';
      process.env.BASE_PRIVATE_KEY = '0x1234567890';
      process.env.BASE_RETURN_ADDRESS = '0xabcd';
      process.env.BASE_RPC_URL = 'https://base-rpc';
      process.env.STELLAR_SOROBAN_RPC_URL = 'https://soroban-rpc';
      process.env.STELLAR_HORIZON_URL = 'https://horizon';
      process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
      process.env.NEXT_PUBLIC_STELLAR_SOROBAN_RPC_URL = 'https://public-soroban';
      process.env.NEXT_PUBLIC_BASE_RETURN_ADDRESS = '0xpublic';
      process.env.NEXT_PUBLIC_STELLAR_USDC_ISSUER = 'GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTQSXUSMIQ75XABZEYYWRB6HP';
      process.env.NEXT_PUBLIC_PAYCREST_API_KEY = 'secret-api-key';

      expect(() => validateEnv()).toThrow('Remove secret values from public env vars');
      expect(() => validateEnv()).toThrow('NEXT_PUBLIC_PAYCREST_API_KEY');
    });

    it('should throw error when multiple issues exist', () => {
      process.env.PAYCREST_API_KEY = '';
      delete process.env.DATABASE_URL;
      process.env.NEXT_PUBLIC_BASE_PRIVATE_KEY = '0xsecret';

      expect(() => validateEnv()).toThrow('Invalid environment configuration');
      expect(() => validateEnv()).toThrow('Missing required');
      expect(() => validateEnv()).toThrow('Remove secret values');
    });

    it('should handle whitespace-only values as missing', () => {
      process.env.PAYCREST_API_KEY = '   ';
      process.env.PAYCREST_WEBHOOK_SECRET = 'test-secret';
      process.env.BASE_PRIVATE_KEY = '0x1234567890';
      process.env.BASE_RETURN_ADDRESS = '0xabcd';
      process.env.BASE_RPC_URL = 'https://base-rpc';
      process.env.STELLAR_SOROBAN_RPC_URL = 'https://soroban-rpc';
      process.env.STELLAR_HORIZON_URL = 'https://horizon';
      process.env.DATABASE_URL = 'postgresql://localhost:5432/test';

      expect(() => validateEnv()).toThrow('Missing required server env vars');
      expect(() => validateEnv()).toThrow('PAYCREST_API_KEY');
    });
  });
});
