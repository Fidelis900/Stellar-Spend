import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger, redactSensitive } from './logger';

describe('Logger - Redaction', () => {
  let writeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  describe('redactSensitive', () => {
    it('should redact known secret keys', () => {
      const result = redactSensitive({
        password: 'supersecret',
        token: 'abc123',
        api_key: 'key123',
        email: 'user@example.com',
      }) as Record<string, unknown>;

      expect(result.password).toBe('[REDACTED]');
      expect(result.token).toBe('[REDACTED]');
      expect(result.api_key).toBe('[REDACTED]');
    });

    it('should redact keys case-insensitively', () => {
      const result = redactSensitive({
        Password: 'secret',
        API_KEY: 'key123',
        Secret: 'mysecret',
      }) as Record<string, unknown>;

      expect(result.Password).toBe('[REDACTED]');
      expect(result.API_KEY).toBe('[REDACTED]');
      expect(result.Secret).toBe('[REDACTED]');
    });

    // #802 — wallet / address PII fields
    it('should redact userAddress, walletAddress, fromAddress, toAddress (#802)', () => {
      const result = redactSensitive({
        userAddress: 'GCFXABCD1234',
        walletAddress: '0xdeadbeef',
        fromAddress: 'GAABC...',
        toAddress: '0x1234',
        userId: 'user-123', // non-PII key — should NOT be redacted
      }) as Record<string, unknown>;

      expect(result.userAddress).toBe('[REDACTED]');
      expect(result.walletAddress).toBe('[REDACTED]');
      expect(result.fromAddress).toBe('[REDACTED]');
      expect(result.toAddress).toBe('[REDACTED]');
      expect(result.userId).toBe('user-123');
    });

    it('should keep non-sensitive keys unchanged', () => {
      const result = redactSensitive({
        name: 'John Doe',
        amount: 100,
        currency: 'NGN',
      }) as Record<string, unknown>;

      expect(result.name).toBe('John Doe');
      expect(result.amount).toBe(100);
      expect(result.currency).toBe('NGN');
    });

    it('should mask email addresses in string values', () => {
      const result = redactSensitive({
        message: 'Contact admin@example.com for support',
      }) as Record<string, unknown>;

      expect(result.message).toContain('[EMAIL]');
      expect(result.message).not.toContain('admin@example.com');
    });

    it('should mask phone numbers in string values', () => {
      const result = redactSensitive({
        phone: 'Call +1-555-123-4567 for help',
      }) as Record<string, unknown>;

      expect(result.phone).toContain('[PHONE]');
      expect(result.phone).not.toContain('555-123-4567');
    });

    it('should mask bank account numbers (8-18 digits)', () => {
      const result = redactSensitive({
        account: 'Account: 1234567890123456',
      }) as Record<string, unknown>;

      expect(result.account).toContain('[ACCOUNT]');
    });

    it('should mask SSN patterns', () => {
      const result = redactSensitive({
        ssnInput: 'SSN: 123-45-6789',
      }) as Record<string, unknown>;

      expect(result.ssnInput).toContain('[SSN]');
    });

    it('should mask credit card patterns', () => {
      const result = redactSensitive({
        cardInfo: 'Card: 4111 1111 1111 1111',
      }) as Record<string, unknown>;

      expect(result.cardInfo).toContain('[CARD]');
    });

    it('should deeply redact nested objects', () => {
      const result = redactSensitive({
        user: {
          profile: {
            password: 'hunter2',
            email: 'test@test.com',
          },
          metadata: {
            token: 'jwt-token',
          },
        },
      }) as Record<string, unknown>;

      const user = result.user as Record<string, unknown>;
      const profile = user.profile as Record<string, unknown>;
      const metadata = user.metadata as Record<string, unknown>;

      expect(profile.password).toBe('[REDACTED]');
      expect(profile.email).toContain('[EMAIL]');
      expect(metadata.token).toBe('[REDACTED]');
    });

    it('should redact arrays of objects', () => {
      const result = redactSensitive([
        { password: 'secret1', name: 'Alice' },
        { password: 'secret2', name: 'Bob' },
      ]) as Array<Record<string, unknown>>;

      expect(result[0].password).toBe('[REDACTED]');
      expect(result[0].name).toBe('Alice');
      expect(result[1].password).toBe('[REDACTED]');
    });

    it('should handle null and primitive values', () => {
      expect(redactSensitive(null)).toBeNull();
      expect(redactSensitive(42)).toBe(42);
      expect(redactSensitive('hello')).toBe('hello');
    });

    it('should not recurse beyond depth 6', () => {
      const deep = { a: { b: { c: { d: { e: { f: { g: 'deep' } } } } } } };
      const result = redactSensitive(deep) as Record<string, unknown>;
      const a = result.a as Record<string, unknown>;
      const b = a.b as Record<string, unknown>;
      const c = b.c as Record<string, unknown>;
      const d = c.d as Record<string, unknown>;
      const e = d.e as Record<string, unknown>;
      const f = e.f as Record<string, unknown>;

      expect(f).toEqual({ g: 'deep' });
    });
  });

  describe('logger emit', () => {
    it('should include timestamp, service, and environment in every entry', () => {
      logger.info('test.event', { foo: 'bar' });

      const output = JSON.parse(writeSpy.mock.calls[0][0] as string);
      expect(output.timestamp).toBeDefined();
      expect(output.service).toBe('stellar-spend');
      expect(output.environment).toBeDefined();
      expect(output.event).toBe('test.event');
      expect(output.level).toBe('info');
      expect(output.foo).toBe('bar');
    });

    it('should redact sensitive fields in emitted log entries', () => {
      logger.info('login.attempt', { password: 'secret123', user: 'admin' });

      const output = JSON.parse(writeSpy.mock.calls[0][0] as string);
      expect(output.password).toBe('[REDACTED]');
      expect(output.user).toBe('admin');
    });

    it('should include error details when error is passed', () => {
      const error = new Error('test error');
      logger.error('operation.failed', { orderId: '123' }, error);

      const output = JSON.parse(writeSpy.mock.calls[0][0] as string);
      expect(output.error?.message).toBe('test error');
      expect(output.error?.name).toBe('Error');
      expect(output.error?.stack).toBeDefined();
    });

    it('should not emit if level is below minimum', () => {
      const originalLogLevel = process.env.LOG_LEVEL;
      process.env.LOG_LEVEL = 'error';

      logger.debug('debug.event', {});
      logger.info('info.event', {});

      expect(writeSpy).not.toHaveBeenCalled();

      process.env.LOG_LEVEL = originalLogLevel;
    });

    it('should bind context via withContext', () => {
      const ctxLogger = logger.withContext({ requestId: 'req-123' });
      ctxLogger.info('request.start', { method: 'GET' });

      const output = JSON.parse(writeSpy.mock.calls[0][0] as string);
      expect(output.requestId).toBe('req-123');
      expect(output.method).toBe('GET');
    });
  });
});
