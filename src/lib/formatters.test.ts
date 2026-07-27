import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DateFormatter, formatTransaction, formatTransactionDate, defaultFormatter } from './formatters';
import * as datetimeModule from './datetime';

vi.mock('./datetime', async (importOriginal) => {
  const actual = await importOriginal<typeof datetimeModule>();
  return {
    ...actual,
    formatUtc: vi.fn((iso: string) => `formatted-utc-${iso}`),
    formatDate: vi.fn((iso: string) => `formatted-date-${iso}`),
    parseUtc: vi.fn((iso: string) => new Date(iso)),
  };
});

const mockFormatUtc = datetimeModule.formatUtc as any;
const mockFormatDate = datetimeModule.formatDate as any;
const mockParseUtc = datetimeModule.parseUtc as any;

describe('formatters.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('DateFormatter', () => {
    it('should create a DateFormatter with default config', () => {
      const formatter = new DateFormatter();
      expect(formatter).toBeDefined();
    });

    it('should create a DateFormatter with custom config', () => {
      const formatter = new DateFormatter({
        locale: 'fr-FR',
        timeZone: 'Europe/Paris',
      });
      expect(formatter).toBeDefined();
    });

    describe('formatTimestamp', () => {
      it('should format a timestamp using formatUtc', () => {
        const formatter = new DateFormatter();
        const iso = '2024-01-15T10:30:00Z';

        const result = formatter.formatTimestamp(iso);

        expect(mockFormatUtc).toHaveBeenCalledWith(iso, 'en-US', 'UTC');
        expect(result).toBe('formatted-utc-2024-01-15T10:30:00Z');
      });

      it('should use custom locale and timezone', () => {
        const formatter = new DateFormatter({
          locale: 'de-DE',
          timeZone: 'Europe/Berlin',
        });
        const iso = '2024-01-15T10:30:00Z';

        formatter.formatTimestamp(iso);

        expect(mockFormatUtc).toHaveBeenCalledWith(iso, 'de-DE', 'Europe/Berlin');
      });
    });

    describe('formatDateOnly', () => {
      it('should format a date only using formatDate', () => {
        const formatter = new DateFormatter();
        const iso = '2024-01-15T10:30:00Z';

        const result = formatter.formatDateOnly(iso);

        expect(mockFormatDate).toHaveBeenCalledWith(iso, 'en-US', 'UTC');
        expect(result).toBe('formatted-date-2024-01-15T10:30:00Z');
      });
    });

    describe('formatRelative', () => {
      it('should return "just now" for times less than 60 seconds old', () => {
        const formatter = new DateFormatter();
        const now = new Date();
        const pastDate = new Date(now.getTime() - 30 * 1000);
        const iso = pastDate.toISOString();

        mockParseUtc.mockReturnValue(pastDate);

        const result = formatter.formatRelative(iso);

        expect(result).toBe('just now');
      });

      it('should return minutes for times less than 60 minutes old', () => {
        const formatter = new DateFormatter();
        const now = new Date();
        const pastDate = new Date(now.getTime() - 30 * 60 * 1000);
        const iso = pastDate.toISOString();

        mockParseUtc.mockReturnValue(pastDate);

        const result = formatter.formatRelative(iso);

        expect(result).toBe('30m ago');
      });

      it('should return hours for times less than 24 hours old', () => {
        const formatter = new DateFormatter();
        const now = new Date();
        const pastDate = new Date(now.getTime() - 5 * 60 * 60 * 1000);
        const iso = pastDate.toISOString();

        mockParseUtc.mockReturnValue(pastDate);

        const result = formatter.formatRelative(iso);

        expect(result).toBe('5h ago');
      });

      it('should return days for times less than 7 days old', () => {
        const formatter = new DateFormatter();
        const now = new Date();
        const pastDate = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
        const iso = pastDate.toISOString();

        mockParseUtc.mockReturnValue(pastDate);

        const result = formatter.formatRelative(iso);

        expect(result).toBe('3d ago');
      });

      it('should return formatted date for times 7+ days old', () => {
        const formatter = new DateFormatter();
        const now = new Date();
        const pastDate = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
        const iso = pastDate.toISOString();

        mockParseUtc.mockReturnValue(pastDate);
        mockFormatDate.mockReturnValue('Jan 05, 2024');

        const result = formatter.formatRelative(iso);

        expect(result).toBe('Jan 05, 2024');
      });
    });

    describe('formatCompact', () => {
      it('should format as compact date', () => {
        const formatter = new DateFormatter();
        const iso = '2024-01-15T10:30:00Z';
        const date = new Date(iso);

        mockParseUtc.mockReturnValue(date);

        const result = formatter.formatCompact(iso);

        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
      });
    });

    describe('formatRange', () => {
      it('should format a date range', () => {
        const formatter = new DateFormatter();
        const fromIso = '2024-01-01T00:00:00Z';
        const toIso = '2024-01-31T23:59:59Z';

        mockFormatDate.mockImplementation((iso) => {
          if (iso === fromIso) return 'Jan 01, 2024';
          if (iso === toIso) return 'Jan 31, 2024';
          return iso;
        });

        const result = formatter.formatRange(fromIso, toIso);

        expect(result).toBe('Jan 01, 2024 - Jan 31, 2024');
      });
    });
  });

  describe('Module-level functions', () => {
    describe('formatTransaction', () => {
      it('should format a transaction timestamp', () => {
        const iso = '2024-01-15T10:30:00Z';

        formatTransaction(iso);

        expect(mockFormatUtc).toHaveBeenCalled();
      });

      it('should use provided timezone', () => {
        const iso = '2024-01-15T10:30:00Z';

        formatTransaction(iso, 'America/New_York');

        expect(mockFormatUtc).toHaveBeenCalledWith(
          iso,
          'en-US',
          'America/New_York'
        );
      });
    });

    describe('formatTransactionDate', () => {
      it('should format transaction date only', () => {
        const iso = '2024-01-15T10:30:00Z';

        formatTransactionDate(iso);

        expect(mockFormatDate).toHaveBeenCalled();
      });

      it('should use provided timezone', () => {
        const iso = '2024-01-15T10:30:00Z';

        formatTransactionDate(iso, 'Europe/London');

        expect(mockFormatDate).toHaveBeenCalledWith(
          iso,
          'en-US',
          'Europe/London'
        );
      });
    });
  });

  describe('defaultFormatter', () => {
    it('should export a default formatter instance', () => {
      expect(defaultFormatter).toBeInstanceOf(DateFormatter);
    });
  });
});
