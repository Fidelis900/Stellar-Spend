import {
  formatCurrency,
  formatCompactNumber,
  formatPercentage,
  formatAmount,
  formatDate,
  formatDateISO,
  formatRelativeTime,
  formatTransactionAmount,
  formatDuration,
  formatFileSize,
} from './formatters';

describe('formatters utility', () => {
  describe('formatCurrency', () => {
    it('formats amount as currency with USD', () => {
      const result = formatCurrency(1234.56);
      expect(result).toMatch(/\$1,234\.56|1234,56/);
    });

    it('formats amount with custom currency', () => {
      const result = formatCurrency(500, 'EUR', 'en-US');
      expect(result).toMatch(/€|EUR/);
    });

    it('handles custom fraction digits', () => {
      const result = formatCurrency(1234.567, 'USD', 'en-US', { minimumFractionDigits: 3 });
      expect(result).toContain('1,234.567');
    });

    it('falls back gracefully for unknown currency', () => {
      const result = formatCurrency(100, 'UNKNOWN', 'en-US');
      expect(result).toMatch(/100.*UNKNOWN/);
    });
  });

  describe('formatCompactNumber', () => {
    it('formats large numbers compactly', () => {
      expect(formatCompactNumber(1500)).toMatch(/1\.5K|2K/);
      expect(formatCompactNumber(1500000)).toMatch(/1\.5M/);
    });

    it('handles small numbers', () => {
      const result = formatCompactNumber(500);
      expect(result).toBe('500');
    });
  });

  describe('formatPercentage', () => {
    it('formats percentage with default decimals', () => {
      const result = formatPercentage(0.25);
      expect(result).toBe('25.00%');
    });

    it('respects custom decimal places', () => {
      const result = formatPercentage(0.3333, 1);
      expect(result).toBe('33.3%');
    });

    it('can exclude symbol', () => {
      const result = formatPercentage(0.5, 2, false);
      expect(result).toBe('50.00');
    });
  });

  describe('formatAmount', () => {
    it('formats amount with thousand separators', () => {
      const result = formatAmount(1234567.89);
      expect(result).toMatch(/1,234,567\.89|1.234.567,89/);
    });
  });

  describe('formatDate', () => {
    it('formats date with time by default', () => {
      const date = new Date('2024-01-15T14:30:00Z');
      const result = formatDate(date);
      expect(result).toMatch(/15|Jan/);
    });

    it('formats date without time when specified', () => {
      const date = new Date('2024-01-15');
      const result = formatDate(date, 'en-US', { includeTime: false });
      expect(result).toMatch(/15|Jan/);
      expect(result).not.toMatch(/:/);
    });

    it('handles timestamp input', () => {
      const timestamp = new Date('2024-01-15').getTime();
      const result = formatDate(timestamp);
      expect(result).toMatch(/15|Jan/);
    });
  });

  describe('formatDateISO', () => {
    it('formats date as ISO string', () => {
      const date = new Date('2024-01-05');
      const result = formatDateISO(date);
      expect(result).toMatch(/2024-01-0[5-6]/);
    });

    it('handles timestamp input', () => {
      const timestamp = new Date('2024-12-25').getTime();
      const result = formatDateISO(timestamp);
      expect(result).toMatch(/2024-12-25/);
    });

    it('pads month and day with zeros', () => {
      const date = new Date('2024-01-01');
      const result = formatDateISO(date);
      expect(result).toBe('2024-01-01');
    });
  });

  describe('formatRelativeTime', () => {
    it('formats very recent dates', () => {
      const recentDate = new Date(Date.now() - 30000); // 30 seconds ago
      const result = formatRelativeTime(recentDate);
      expect(result.toLowerCase()).toMatch(/seconds?|ago/);
    });

    it('formats dates in the past', () => {
      const pastDate = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
      const result = formatRelativeTime(pastDate);
      expect(result.toLowerCase()).toMatch(/hour|ago/);
    });
  });

  describe('formatTransactionAmount', () => {
    it('formats debit transaction with minus sign', () => {
      const result = formatTransactionAmount(100, 'USD', true);
      expect(result).toMatch(/-/);
      expect(result).toMatch(/100|USD/);
    });

    it('formats credit transaction with plus sign', () => {
      const result = formatTransactionAmount(100, 'USD', false);
      expect(result).toMatch(/\+/);
    });
  });

  describe('formatDuration', () => {
    it('formats milliseconds to duration string', () => {
      expect(formatDuration(5000)).toMatch(/5s/);
      expect(formatDuration(60000)).toMatch(/1m/);
      expect(formatDuration(3600000)).toMatch(/1h/);
    });

    it('includes multiple units', () => {
      const ms = 1 * 60 * 60 * 1000 + 30 * 60 * 1000 + 45 * 1000; // 1h 30m 45s
      const result = formatDuration(ms);
      expect(result).toMatch(/h.*m.*s/);
    });

    it('handles zero milliseconds', () => {
      const result = formatDuration(0);
      expect(result).toBe('0s');
    });
  });

  describe('formatFileSize', () => {
    it('formats bytes', () => {
      expect(formatFileSize(512)).toMatch(/512\s*Bytes?/i);
    });

    it('formats kilobytes', () => {
      expect(formatFileSize(1024)).toMatch(/1\s*KB/i);
    });

    it('formats megabytes', () => {
      expect(formatFileSize(1024 * 1024)).toMatch(/1\s*MB/i);
    });

    it('handles zero bytes', () => {
      expect(formatFileSize(0)).toBe('0 Bytes');
    });

    it('respects decimal places', () => {
      const result = formatFileSize(1536, 1); // 1.5 KB
      expect(result).toMatch(/1\.5\s*KB/i);
    });
  });
});
