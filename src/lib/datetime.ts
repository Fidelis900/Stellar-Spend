/**
 * Timezone-safe date/time utility.
 *
 * Rules:
 *  - All stored/transmitted timestamps are UTC ISO-8601 strings.
 *  - Display formatting accepts an explicit locale; defaults to 'en-US'.
 *  - No implicit local-timezone shifts: toISOString() is always UTC.
 */

/** Return the current UTC instant as an ISO-8601 string. */
export function nowUtc(): string {
  return new Date().toISOString();
}

/**
 * Parse any ISO-8601 string and return a Date object.
 * Throws if the string is not a valid date.
 */
export function parseUtc(iso: string): Date {
  const d = new Date(iso);
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date string: "${iso}"`);
  }
  return d;
}

/**
 * Format a UTC ISO-8601 timestamp for display.
 *
 * @param iso   - UTC ISO-8601 string (e.g. from nowUtc())
 * @param locale - BCP-47 locale tag (default: 'en-US')
 * @param timeZone - IANA timezone (default: 'UTC')
 */
export function formatUtc(
  iso: string,
  locale: string = 'en-US',
  timeZone: string = 'UTC'
): string {
  const d = parseUtc(iso);
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone,
    timeZoneName: 'short',
  }).format(d);
}

/**
 * Format only the date portion (no time).
 *
 * @param iso      - UTC ISO-8601 string
 * @param locale   - BCP-47 locale tag (default: 'en-US')
 * @param timeZone - IANA timezone (default: 'UTC')
 */
export function formatDate(
  iso: string,
  locale: string = 'en-US',
  timeZone: string = 'UTC'
): string {
  const d = parseUtc(iso);
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    timeZone,
  }).format(d);
}

/**
 * Return the ISO-8601 date string (YYYY-MM-DD) in UTC for a given timestamp.
 * Useful for grouping records by calendar day without TZ drift.
 */
export function toUtcDateString(iso: string): string {
  return parseUtc(iso).toISOString().slice(0, 10);
}

/** Return elapsed milliseconds between two UTC ISO-8601 timestamps. */
export function diffMs(from: string, to: string): number {
  return parseUtc(to).getTime() - parseUtc(from).getTime();
}

/** Return true when `iso` is strictly before `referenceIso` (both UTC). */
export function isBefore(iso: string, referenceIso: string): boolean {
  return diffMs(iso, referenceIso) > 0;
}

/** Return true when `iso` is strictly after `referenceIso` (both UTC). */
export function isAfter(iso: string, referenceIso: string): boolean {
  return diffMs(iso, referenceIso) < 0;
}

/**
 * Add a duration to a UTC ISO-8601 timestamp and return a new UTC ISO-8601 string.
 *
 * @param iso     - base timestamp
 * @param delta   - object with optional ms/seconds/minutes/hours/days to add
 */
export function addDuration(
  iso: string,
  delta: { ms?: number; seconds?: number; minutes?: number; hours?: number; days?: number }
): string {
  const base = parseUtc(iso).getTime();
  const totalMs =
    (delta.ms ?? 0) +
    (delta.seconds ?? 0) * 1_000 +
    (delta.minutes ?? 0) * 60_000 +
    (delta.hours ?? 0) * 3_600_000 +
    (delta.days ?? 0) * 86_400_000;
  return new Date(base + totalMs).toISOString();
}
