import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  TimeoutError,
  withAllbridgeTimeout,
  withPaycrestTimeout,
  withSorobanTimeout,
  TIMEOUT_CONFIG,
} from '@/lib/offramp';

describe('Timeout Utilities', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('TimeoutError', () => {
    it('should create timeout error with correct message', () => {
      const error = new TimeoutError('Test Service', 5000, 'test_operation');

      expect(error.name).toBe('TimeoutError');
      expect(error.serviceName).toBe('Test Service');
      expect(error.duration).toBe(5000);
      expect(error.operation).toBe('test_operation');
      expect(error.message).toBe('Test Service timeout after 5s (test_operation)');
    });

    it('should create timeout error without operation', () => {
      const error = new TimeoutError('Test Service', 3000);

      expect(error.message).toBe('Test Service timeout after 3s');
    });
  });

  describe('withAllbridgeTimeout', () => {
    it('should resolve when promise completes within timeout', async () => {
      const mockPromise = Promise.resolve('success');

      const result = await withAllbridgeTimeout(mockPromise, 'test_op');

      expect(result).toBe('success');
    });

    it('should reject with TimeoutError when promise exceeds timeout', async () => {
      const slowPromise = new Promise((resolve) => {
        setTimeout(() => resolve('too slow'), 35000);
      });

      const timeoutPromise = withAllbridgeTimeout(slowPromise, 'slow_op');

      // Fast forward past the timeout
      vi.advanceTimersByTime(31000);

      await expect(timeoutPromise).rejects.toThrow(TimeoutError);
      await expect(timeoutPromise).rejects.toThrow('Bridge service timeout after 30s (slow_op)');
    });

    it('should use correct timeout duration for Allbridge SDK', () => {
      expect(TIMEOUT_CONFIG.ALLBRIDGE_SDK.duration).toBe(30000);
      expect(TIMEOUT_CONFIG.ALLBRIDGE_SDK.serviceName).toBe('Bridge service');
    });
  });

  describe('withPaycrestTimeout', () => {
    it('should resolve when promise completes within timeout', async () => {
      const mockPromise = Promise.resolve({ rate: 1500 });

      const result = await withPaycrestTimeout(mockPromise, 'rate_quote');

      expect(result).toEqual({ rate: 1500 });
    });

    it('should reject with TimeoutError when promise exceeds timeout', async () => {
      const slowPromise = new Promise((resolve) => {
        setTimeout(() => resolve('too slow'), 20000);
      });

      const timeoutPromise = withPaycrestTimeout(slowPromise, 'slow_api');

      // Fast forward past the timeout
      vi.advanceTimersByTime(16000);

      await expect(timeoutPromise).rejects.toThrow(TimeoutError);
      await expect(timeoutPromise).rejects.toThrow('Payment service timeout after 15s (slow_api)');
    });

    it('should use correct timeout duration for Paycrest API', () => {
      expect(TIMEOUT_CONFIG.PAYCREST_API.duration).toBe(15000);
      expect(TIMEOUT_CONFIG.PAYCREST_API.serviceName).toBe('Payment service');
    });
  });

  describe('withSorobanTimeout', () => {
    it('should resolve when promise completes within timeout', async () => {
      const mockPromise = Promise.resolve({ txHash: '0x123' });

      const result = await withSorobanTimeout(mockPromise, 'submit_tx');

      expect(result).toEqual({ txHash: '0x123' });
    });

    it('should reject with TimeoutError when promise exceeds timeout', async () => {
      const slowPromise = new Promise((resolve) => {
        setTimeout(() => resolve('too slow'), 20000);
      });

      const timeoutPromise = withSorobanTimeout(slowPromise, 'slow_rpc');

      // Fast forward past the timeout
      vi.advanceTimersByTime(16000);

      await expect(timeoutPromise).rejects.toThrow(TimeoutError);
      await expect(timeoutPromise).rejects.toThrow(
        'Blockchain service timeout after 15s (slow_rpc)',
      );
    });

    it('should use correct timeout duration for Soroban RPC', () => {
      expect(TIMEOUT_CONFIG.SOROBAN_RPC.duration).toBe(15000);
      expect(TIMEOUT_CONFIG.SOROBAN_RPC.serviceName).toBe('Blockchain service');
    });
  });

  describe('timeout configuration', () => {
    it('should have different timeout durations for different services', () => {
      expect(TIMEOUT_CONFIG.ALLBRIDGE_SDK.duration).toBe(30000); // 30s
      expect(TIMEOUT_CONFIG.PAYCREST_API.duration).toBe(15000); // 15s
      expect(TIMEOUT_CONFIG.SOROBAN_RPC.duration).toBe(15000); // 15s
    });

    it('should have descriptive service names', () => {
      expect(TIMEOUT_CONFIG.ALLBRIDGE_SDK.serviceName).toBe('Bridge service');
      expect(TIMEOUT_CONFIG.PAYCREST_API.serviceName).toBe('Payment service');
      expect(TIMEOUT_CONFIG.SOROBAN_RPC.serviceName).toBe('Blockchain service');
    });
  });
});
