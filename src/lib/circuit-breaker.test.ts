/**
 * Tests for the lightweight CircuitBreaker (#800)
 * Covers: CLOSED→OPEN transition, OPEN rejection, HALF_OPEN probe, fallback, timeout.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CircuitBreaker, CircuitOpenError, CircuitTimeoutError } from './circuit-breaker';

describe('CircuitBreaker', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // ── CLOSED state ────────────────────────────────────────────────────────────

  describe('CLOSED state', () => {
    it('passes calls through when upstream succeeds', async () => {
      const breaker = new CircuitBreaker({ name: 'test', failureThreshold: 3 });
      const fn = vi.fn().mockResolvedValue('ok');

      const result = await breaker.execute(fn);

      expect(result).toBe('ok');
      expect(breaker.getStatus().state).toBe('CLOSED');
    });

    it('counts failures and stays CLOSED below threshold', async () => {
      const breaker = new CircuitBreaker({ name: 'test', failureThreshold: 3, timeoutMs: 0 });
      const fn = vi.fn().mockRejectedValue(new Error('boom'));

      await expect(breaker.execute(fn)).rejects.toThrow('boom');
      await expect(breaker.execute(fn)).rejects.toThrow('boom');

      expect(breaker.getStatus().state).toBe('CLOSED');
      expect(breaker.getStatus().failures).toBe(2);
    });

    it('resets failure counter after a success', async () => {
      const breaker = new CircuitBreaker({ name: 'test', failureThreshold: 3, timeoutMs: 0 });
      const fail = vi.fn().mockRejectedValue(new Error('boom'));
      const succeed = vi.fn().mockResolvedValue('ok');

      await expect(breaker.execute(fail)).rejects.toThrow();
      await expect(breaker.execute(fail)).rejects.toThrow();
      await breaker.execute(succeed);

      expect(breaker.getStatus().failures).toBe(0);
    });
  });

  // ── CLOSED → OPEN ──────────────────────────────────────────────────────────

  describe('CLOSED → OPEN transition', () => {
    it('opens after reaching failure threshold', async () => {
      const breaker = new CircuitBreaker({ name: 'test', failureThreshold: 3, timeoutMs: 0 });
      const fn = vi.fn().mockRejectedValue(new Error('boom'));

      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(fn)).rejects.toThrow('boom');
      }

      expect(breaker.getStatus().state).toBe('OPEN');
    });
  });

  // ── OPEN state ─────────────────────────────────────────────────────────────

  describe('OPEN state', () => {
    async function openBreaker(threshold = 3, timeoutMs = 0) {
      const breaker = new CircuitBreaker({
        name: 'test',
        failureThreshold: threshold,
        timeoutMs,
        resetTimeoutMs: 30_000,
      });
      const fn = vi.fn().mockRejectedValue(new Error('boom'));
      for (let i = 0; i < threshold; i++) {
        await expect(breaker.execute(fn)).rejects.toThrow();
      }
      return breaker;
    }

    it('throws CircuitOpenError when open and no fallback provided', async () => {
      const breaker = await openBreaker();
      await expect(breaker.execute(vi.fn())).rejects.toBeInstanceOf(CircuitOpenError);
    });

    it('calls fallback instead of upstream when open', async () => {
      const breaker = await openBreaker();
      const upstream = vi.fn();

      const result = await breaker.execute(upstream, { fallback: () => 'fallback-value' });

      expect(result).toBe('fallback-value');
      expect(upstream).not.toHaveBeenCalled();
    });

    it('does not increment failure counter while open', async () => {
      const breaker = await openBreaker();
      const before = breaker.getStatus().failures;

      await expect(breaker.execute(vi.fn())).rejects.toBeInstanceOf(CircuitOpenError);

      expect(breaker.getStatus().failures).toBe(before);
    });
  });

  // ── OPEN → HALF_OPEN ───────────────────────────────────────────────────────

  describe('OPEN → HALF_OPEN transition', () => {
    it('transitions to HALF_OPEN after resetTimeout elapses', async () => {
      vi.useFakeTimers();
      const breaker = new CircuitBreaker({
        name: 'test',
        failureThreshold: 1,
        timeoutMs: 0,
        resetTimeoutMs: 5_000,
      });
      const fail = vi.fn().mockRejectedValue(new Error('boom'));

      await expect(breaker.execute(fail)).rejects.toThrow();
      expect(breaker.getStatus().state).toBe('OPEN');

      vi.advanceTimersByTime(5_001);

      // Trying to execute now should trigger HALF_OPEN probe
      const succeed = vi.fn().mockResolvedValue('ok');
      await breaker.execute(succeed);

      expect(breaker.getStatus().state).toBe('CLOSED');
    });

    it('re-opens on probe failure in HALF_OPEN', async () => {
      vi.useFakeTimers();
      const breaker = new CircuitBreaker({
        name: 'test',
        failureThreshold: 1,
        timeoutMs: 0,
        resetTimeoutMs: 5_000,
      });
      const fail = vi.fn().mockRejectedValue(new Error('boom'));

      await expect(breaker.execute(fail)).rejects.toThrow();
      vi.advanceTimersByTime(5_001);

      await expect(breaker.execute(fail)).rejects.toThrow('boom');
      expect(breaker.getStatus().state).toBe('OPEN');
    });
  });

  // ── Timeout ────────────────────────────────────────────────────────────────

  describe('timeout', () => {
    it('throws CircuitTimeoutError when fn exceeds timeoutMs', async () => {
      vi.useFakeTimers();
      const breaker = new CircuitBreaker({ name: 'test', failureThreshold: 10, timeoutMs: 100 });

      const slowFn = () =>
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('should not reach')), 5_000);
        });

      const exec = breaker.execute(slowFn);
      vi.advanceTimersByTime(101);

      await expect(exec).rejects.toBeInstanceOf(CircuitTimeoutError);
    });

    it('counts timeout as a failure', async () => {
      vi.useFakeTimers();
      const breaker = new CircuitBreaker({ name: 'test', failureThreshold: 3, timeoutMs: 100 });
      const slowFn = () => new Promise<never>(() => undefined);

      const exec = breaker.execute(slowFn);
      vi.advanceTimersByTime(101);
      await expect(exec).rejects.toBeInstanceOf(CircuitTimeoutError);

      expect(breaker.getStatus().failures).toBe(1);
    });
  });

  // ── reset ──────────────────────────────────────────────────────────────────

  describe('reset', () => {
    it('resets an open breaker back to CLOSED', async () => {
      const breaker = new CircuitBreaker({ name: 'test', failureThreshold: 1, timeoutMs: 0 });
      await expect(breaker.execute(() => Promise.reject(new Error('boom')))).rejects.toThrow();
      expect(breaker.getStatus().state).toBe('OPEN');

      breaker.reset();

      expect(breaker.getStatus().state).toBe('CLOSED');
      expect(breaker.getStatus().failures).toBe(0);
    });
  });

  // ── getStatus ─────────────────────────────────────────────────────────────

  describe('getStatus', () => {
    it('exposes circuit name and initial closed state', () => {
      const breaker = new CircuitBreaker({ name: 'my-service' });
      const status = breaker.getStatus();

      expect(status.name).toBe('my-service');
      expect(status.state).toBe('CLOSED');
      expect(status.failures).toBe(0);
      expect(status.lastFailureAt).toBeNull();
      expect(status.nextAttemptAt).toBeNull();
    });
  });
});
