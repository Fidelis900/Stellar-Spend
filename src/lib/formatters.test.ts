import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { DateFormatter, defaultFormatter, formatTransaction, formatTransactionDate } from './formatters';

let now: Date;

beforeAll(() => {
  now = new Date('2025-07-25T14:30:00Z');
  vi.useFakeTimers();
  vi.setSystemTime(now);
});

afterAll(() => {
  vi.useRealTimers();
});

describe('DateFormatter', () => {
  describe('constructor and defaults', () => {
    it('defaults to en-US locale and UTC timezone', () => {
      const formatter = new DateFormatter();
      const result = formatter.formatTimestamp('2025-07-25T14:30:00Z');
      expect(result).toContain('Jul');
      expect(result).toContain('UTC');
    });

    it('accepts custom locale and timezone', () => {
      const formatter = new DateFormatter({ locale: 'en-US', timeZone: 'America/New_York' });
      const result = formatter.formatTimestamp('2025-07-25T14:30:00Z');
      expect(result).toBeDefined();
    });
  });

  describe('formatTimestamp', () => {
    it('formats ISO timestamp with time and timezone', () => {
      const formatter = new DateFormatter({ locale: 'en-US', timeZone: 'UTC' });
      const result = formatter.formatTimestamp('2025-07-25T14:30:00Z');
      expect(result).toMatch(/Jul.*\d+.*\d{2}:\d{2}:\d{2}.*UTC/);
    });

    it('snapshot: formats timestamp consistently', () => {
      const formatter = new DateFormatter({ locale: 'en-US', timeZone: 'UTC' });
      const result = formatter.formatTimestamp('2025-07-25T14:30:00Z');
      expect(result).toMatchSnapshot();
    });
  });

  describe('formatDateOnly', () => {
    it('formats date without time component', () => {
      const formatter = new DateFormatter({ locale: 'en-US', timeZone: 'UTC' });
      const result = formatter.formatDateOnly('2025-07-25T14:30:00Z');
      expect(result).not.toContain(':');
      expect(result).toContain('Jul');
    });

    it('snapshot: formats date-only consistently', () => {
      const formatter = new DateFormatter({ locale: 'en-US', timeZone: 'UTC' });
      const result = formatter.formatDateOnly('2025-07-25T14:30:00Z');
      expect(result).toMatchSnapshot();
    });
  });

  describe('formatRelative', () => {
    it('shows "just now" for recent timestamps', () => {
      const formatter = new DateFormatter();
      const recent = new Date(now.getTime() - 30_000).toISOString();
      expect(formatter.formatRelative(recent)).toBe('just now');
    });

    it('shows minutes for timestamps within an hour', () => {
      const formatter = new DateFormatter();
      const tenMinutesAgo = new Date(now.getTime() - 10 * 60_000).toISOString();
      expect(formatter.formatRelative(tenMinutesAgo)).toMatch(/10m ago/);
    });

    it('shows hours for timestamps within a day', () => {
      const formatter = new DateFormatter();
      const twoHoursAgo = new Date(now.getTime() - 2 * 3600_000).toISOString();
      expect(formatter.formatRelative(twoHoursAgo)).toMatch(/2h ago/);
    });

    it('shows days for timestamps within a week', () => {
      const formatter = new DateFormatter();
      const threeDaysAgo = new Date(now.getTime() - 3 * 86400_000).toISOString();
      expect(formatter.formatRelative(threeDaysAgo)).toMatch(/3d ago/);
    });

    it('falls back to date format for older timestamps', () => {
      const formatter = new DateFormatter({ locale: 'en-US', timeZone: 'UTC' });
      const twoWeeksAgo = new Date(now.getTime() - 14 * 86400_000).toISOString();
      const result = formatter.formatRelative(twoWeeksAgo);
      expect(result).not.toContain('ago');
      expect(result).toContain('Jul');
    });
  });

  describe('formatCompact', () => {
    it('formats date in MM/DD/YY format', () => {
      const formatter = new DateFormatter({ locale: 'en-US', timeZone: 'UTC' });
      const result = formatter.formatCompact('2025-07-25T14:30:00Z');
      expect(result).toMatch(/\d{2}\/\d{2}\/\d{2}/);
    });

    it('snapshot: formats compact date consistently', () => {
      const formatter = new DateFormatter({ locale: 'en-US', timeZone: 'UTC' });
      const result = formatter.formatCompact('2025-07-25T14:30:00Z');
      expect(result).toMatchSnapshot();
    });
  });

  describe('formatRange', () => {
    it('formats date range with both dates', () => {
      const formatter = new DateFormatter({ locale: 'en-US', timeZone: 'UTC' });
      const result = formatter.formatRange('2025-07-20T00:00:00Z', '2025-07-25T23:59:59Z');
      expect(result).toContain(' - ');
      expect(result).toContain('Jul');
    });

    it('snapshot: formats range consistently', () => {
      const formatter = new DateFormatter({ locale: 'en-US', timeZone: 'UTC' });
      const result = formatter.formatRange('2025-07-20T00:00:00Z', '2025-07-25T23:59:59Z');
      expect(result).toMatchSnapshot();
    });
  });
});

describe('defaultFormatter', () => {
  it('provides consistent UTC formatting', () => {
    const result1 = defaultFormatter.formatTimestamp('2025-07-25T14:30:00Z');
    const result2 = defaultFormatter.formatTimestamp('2025-07-25T14:30:00Z');
    expect(result1).toBe(result2);
  });
});

describe('helper functions', () => {
  describe('formatTransaction', () => {
    it('formats transaction timestamp with default UTC', () => {
      const result = formatTransaction('2025-07-25T14:30:00Z');
      expect(result).toContain('Jul');
    });

    it('snapshot: formats transaction consistently', () => {
      const result = formatTransaction('2025-07-25T14:30:00Z');
      expect(result).toMatchSnapshot();
    });

    it('accepts custom timezone', () => {
      const result = formatTransaction('2025-07-25T14:30:00Z', 'America/New_York');
      expect(result).toBeDefined();
    });
  });

  describe('formatTransactionDate', () => {
    it('formats transaction date without time', () => {
      const result = formatTransactionDate('2025-07-25T14:30:00Z');
      expect(result).not.toContain(':');
      expect(result).toContain('Jul');
    });

    it('snapshot: formats transaction date consistently', () => {
      const result = formatTransactionDate('2025-07-25T14:30:00Z');
      expect(result).toMatchSnapshot();
    });

    it('accepts custom timezone', () => {
      const result = formatTransactionDate('2025-07-25T14:30:00Z', 'America/New_York');
      expect(result).toBeDefined();
    });
  });
});

describe('timezone consistency', () => {
  it('all formatters respect the configured timezone', () => {
    const utcFormatter = new DateFormatter({ timeZone: 'UTC' });
    const nyFormatter = new DateFormatter({ timeZone: 'America/New_York' });

    const utcResult = utcFormatter.formatTimestamp('2025-07-25T20:00:00Z');
    const nyResult = nyFormatter.formatTimestamp('2025-07-25T20:00:00Z');

    expect(utcResult).toContain('UTC');
    expect(nyResult).toBeDefined();
  });
});
