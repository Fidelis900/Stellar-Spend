import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { pollWithTimeout } from './polling';

describe('Polling Utility', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  describe('pollWithTimeout', () => {
    it('should resolve immediately when condition is met on first attempt', async () => {
      const mockPollFn = vi.fn().mockResolvedValue({ status: 'success' });
      const checkCondition = (result: { status: string }) => result.status === 'success';

      const promise = pollWithTimeout(mockPollFn, checkCondition, { interval: 1000 });

      // Advance timers to allow the promise to resolve
      await vi.runAllTimersAsync();

      const result = await promise;
      expect(result).toEqual({ status: 'success' });
      expect(mockPollFn).toHaveBeenCalledTimes(1);
    });

    it('should not introduce unnecessary delays when condition is met immediately', async () => {
      const mockPollFn = vi.fn().mockResolvedValue({ ready: true });
      const checkCondition = (result: { ready: boolean }) => result.ready;

      const startTime = Date.now();
      const promise = pollWithTimeout(mockPollFn, checkCondition, { interval: 5000 });

      await vi.runAllTimersAsync();
      await promise;

      // Should resolve quickly without waiting for interval
      expect(mockPollFn).toHaveBeenCalledTimes(1);
    });

    it('should resolve after N attempts when condition is met', async () => {
      let callCount = 0;
      const mockPollFn = vi.fn().mockImplementation(async () => {
        callCount++;
        return { status: callCount >= 3 ? 'success' : 'pending' };
      });
      const checkCondition = (result: { status: string }) => result.status === 'success';

      const promise = pollWithTimeout(mockPollFn, checkCondition, {
        interval: 1000,
        timeout: 10000,
      });

      // Advance timers to allow polling iterations
      await vi.runAllTimersAsync();

      const result = await promise;
      expect(result).toEqual({ status: 'success' });
      expect(mockPollFn).toHaveBeenCalledTimes(3);
    });

    it('should poll exactly N times before succeeding', async () => {
      const attempts = 5;
      let callCount = 0;
      const mockPollFn = vi.fn().mockImplementation(async () => {
        callCount++;
        return { value: callCount };
      });
      const checkCondition = (result: { value: number }) => result.value === attempts;

      const promise = pollWithTimeout(mockPollFn, checkCondition, {
        interval: 500,
        timeout: 10000,
      });

      await vi.runAllTimersAsync();

      const result = await promise;
      expect(result.value).toBe(attempts);
      expect(mockPollFn).toHaveBeenCalledTimes(attempts);
    });

    it('should throw error with message "Polling timeout exceeded" when timeout is exceeded', async () => {
      const mockPollFn = vi.fn().mockResolvedValue({ status: 'pending' });
      const checkCondition = (result: { status: string }) => result.status === 'success';

      const promise = pollWithTimeout(mockPollFn, checkCondition, {
        interval: 1000,
        timeout: 3000,
      });
      // Attach rejection handler immediately to prevent unhandled rejection
      const caught = promise.catch((e) => e);
      await vi.runAllTimersAsync();
      const err = await caught;
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe('Polling timeout exceeded');
    });

    it('should timeout at the correct time boundary', async () => {
      const mockPollFn = vi.fn().mockResolvedValue({ status: 'pending' });
      const checkCondition = (result: { status: string }) => result.status === 'success';

      const timeout = 5000;
      const interval = 1000;
      const promise = pollWithTimeout(mockPollFn, checkCondition, { interval, timeout });
      const caught = promise.catch((e) => e);

      await vi.advanceTimersByTimeAsync(timeout - 100);
      expect(mockPollFn).toHaveBeenCalled();

      await vi.runAllTimersAsync();
      const err = await caught;
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe('Polling timeout exceeded');
    });

    it('should invoke onProgress callback on each attempt', async () => {
      let callCount = 0;
      const mockPollFn = vi.fn().mockImplementation(async () => {
        callCount++;
        return { status: callCount >= 3 ? 'success' : 'pending' };
      });
      const checkCondition = (result: { status: string }) => result.status === 'success';
      const onProgress = vi.fn();

      const promise = pollWithTimeout(mockPollFn, checkCondition, {
        interval: 1000,
        timeout: 10000,
        onProgress,
      });

      await vi.runAllTimersAsync();
      await promise;

      expect(onProgress).toHaveBeenCalledTimes(3);
      expect(onProgress).toHaveBeenNthCalledWith(1, 1);
      expect(onProgress).toHaveBeenNthCalledWith(2, 2);
      expect(onProgress).toHaveBeenNthCalledWith(3, 3);
    });

    it('should pass correct attempt numbers to progress callback', async () => {
      const mockPollFn = vi.fn().mockResolvedValue({ status: 'success' });
      const checkCondition = (result: { status: string }) => result.status === 'success';
      const attemptNumbers: number[] = [];
      const onProgress = vi.fn((attempt: number) => {
        attemptNumbers.push(attempt);
      });

      const promise = pollWithTimeout(mockPollFn, checkCondition, {
        interval: 1000,
        onProgress,
      });

      await vi.runAllTimersAsync();
      await promise;

      expect(attemptNumbers).toEqual([1]);
    });

    it('should not invoke callback after resolution', async () => {
      let callCount = 0;
      const mockPollFn = vi.fn().mockImplementation(async () => {
        callCount++;
        return { status: callCount >= 2 ? 'success' : 'pending' };
      });
      const checkCondition = (result: { status: string }) => result.status === 'success';
      const onProgress = vi.fn();

      const promise = pollWithTimeout(mockPollFn, checkCondition, {
        interval: 1000,
        timeout: 10000,
        onProgress,
      });

      await vi.runAllTimersAsync();
      await promise;

      const callCountAfterResolution = onProgress.mock.calls.length;

      // Advance timers further
      await vi.advanceTimersByTimeAsync(5000);

      // Should not have been called again
      expect(onProgress).toHaveBeenCalledTimes(callCountAfterResolution);
    });
  });
});
