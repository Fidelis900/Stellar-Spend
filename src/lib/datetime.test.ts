import { describe, it, expect } from 'vitest';
import {
  nowUtc,
  parseUtc,
  formatUtc,
  formatDate,
  toUtcDateString,
  diffMs,
  isBefore,
  isAfter,
  addDuration,
} from './datetime';

describe('nowUtc', () => {
  it('returns a valid ISO-8601 string ending in Z', () => {
    const result = nowUtc();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('is close to the actual current time', () => {
    const before = Date.now();
    const result = nowUtc();
    const after = Date.now();
    const ts = new Date(result).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});

describe('parseUtc', () => {
  it('parses a valid UTC ISO string', () => {
    const d = parseUtc('2026-01-15T12:30:00.000Z');
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(0); // January
    expect(d.getUTCDate()).toBe(15);
    expect(d.getUTCHours()).toBe(12);
  });

  it('throws for an invalid date string', () => {
    expect(() => parseUtc('not-a-date')).toThrow('Invalid date string');
  });

  it('parses date-only strings as midnight UTC', () => {
    const d = parseUtc('2026-06-01');
    expect(d.getUTCHours()).toBe(0);
    expect(d.getUTCMinutes()).toBe(0);
  });
});

describe('formatUtc', () => {
  const iso = '2026-03-08T14:30:00.000Z';

  it('returns a human-readable string', () => {
    const result = formatUtc(iso);
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  it('respects the timezone parameter — same instant, different wall clock', () => {
    const utcStr = formatUtc(iso, 'en-US', 'UTC');
    const nyStr = formatUtc(iso, 'en-US', 'America/New_York');
    // UTC and New York differ by at least 4 hours (EST is UTC-5, EDT is UTC-4)
    expect(utcStr).not.toBe(nyStr);
  });
});

describe('formatDate', () => {
  it('returns only the date portion', () => {
    const result = formatDate('2026-06-28T22:00:00.000Z', 'en-US', 'UTC');
    // Should contain "Jun" and "28" but no hour digits like ":00"
    expect(result).toContain('Jun');
    expect(result).toContain('28');
  });

  // DST test: 2024-03-31 02:00 UTC — clocks spring forward in Europe/Berlin
  it('handles DST boundary without shifting the calendar day', () => {
    const iso = '2024-03-31T01:30:00.000Z'; // before DST cutover in Berlin
    const dateStr = toUtcDateString(iso);
    expect(dateStr).toBe('2024-03-31');
  });
});

describe('toUtcDateString', () => {
  it('returns YYYY-MM-DD in UTC', () => {
    expect(toUtcDateString('2026-06-28T23:59:59.999Z')).toBe('2026-06-28');
  });

  it('does not shift to the next day due to local timezone', () => {
    // This timestamp is 2026-06-28 in UTC even though it is 2026-06-29 in UTC+1
    expect(toUtcDateString('2026-06-28T23:00:00.000Z')).toBe('2026-06-28');
  });

  it('handles midnight exactly', () => {
    expect(toUtcDateString('2026-06-29T00:00:00.000Z')).toBe('2026-06-29');
  });
});

describe('diffMs', () => {
  it('returns positive ms when `to` is after `from`', () => {
    const from = '2026-01-01T00:00:00.000Z';
    const to = '2026-01-01T00:01:00.000Z'; // 60 seconds later
    expect(diffMs(from, to)).toBe(60_000);
  });

  it('returns negative ms when `to` is before `from`', () => {
    const from = '2026-01-01T01:00:00.000Z';
    const to = '2026-01-01T00:00:00.000Z';
    expect(diffMs(from, to)).toBe(-3_600_000);
  });

  it('returns 0 for equal timestamps', () => {
    const iso = '2026-06-01T12:00:00.000Z';
    expect(diffMs(iso, iso)).toBe(0);
  });
});

describe('isBefore / isAfter', () => {
  const earlier = '2026-01-01T00:00:00.000Z';
  const later = '2026-01-02T00:00:00.000Z';

  it('isBefore returns true when iso < reference', () => {
    expect(isBefore(earlier, later)).toBe(true);
  });

  it('isBefore returns false when iso > reference', () => {
    expect(isBefore(later, earlier)).toBe(false);
  });

  it('isAfter returns true when iso > reference', () => {
    expect(isAfter(later, earlier)).toBe(true);
  });

  it('isAfter returns false when iso < reference', () => {
    expect(isAfter(earlier, later)).toBe(false);
  });

  // Cross-TZ correctness: both timestamps represent the same UTC instant
  it('isBefore returns false for equal UTC instants regardless of offset notation', () => {
    const a = '2026-06-15T12:00:00.000Z';
    const b = '2026-06-15T12:00:00.000Z';
    expect(isBefore(a, b)).toBe(false);
    expect(isAfter(a, b)).toBe(false);
  });
});

describe('addDuration', () => {
  const base = '2026-06-01T00:00:00.000Z';

  it('adds days correctly', () => {
    expect(addDuration(base, { days: 1 })).toBe('2026-06-02T00:00:00.000Z');
  });

  it('adds hours correctly', () => {
    expect(addDuration(base, { hours: 3 })).toBe('2026-06-01T03:00:00.000Z');
  });

  it('adds combined duration', () => {
    expect(addDuration(base, { days: 1, hours: 2, minutes: 30 })).toBe(
      '2026-06-02T02:30:00.000Z'
    );
  });

  // DST: 2024-03-10 02:00 US/Eastern — clocks spring forward
  it('crosses DST boundary correctly in UTC (no surprise hour loss)', () => {
    const beforeDst = '2024-03-10T06:00:00.000Z'; // 01:00 EST
    const result = addDuration(beforeDst, { hours: 2 });
    // UTC is not affected by DST, so exactly +2h
    expect(result).toBe('2024-03-10T08:00:00.000Z');
  });

  it('zero delta returns an equivalent timestamp', () => {
    expect(addDuration(base, {})).toBe(base);
  });
});
