import { formatUtc, formatDate, parseUtc } from './datetime';

export interface FormatterConfig {
  locale?: string;
  timeZone?: string;
}

export class DateFormatter {
  private locale: string;
  private timeZone: string;

  constructor(config: FormatterConfig = {}) {
    this.locale = config.locale || 'en-US';
    this.timeZone = config.timeZone || 'UTC';
  }

  formatTimestamp(iso: string): string {
    return formatUtc(iso, this.locale, this.timeZone);
  }

  formatDateOnly(iso: string): string {
    return formatDate(iso, this.locale, this.timeZone);
  }

  formatRelative(iso: string): string {
    const date = parseUtc(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSeconds < 60) return 'just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return this.formatDateOnly(iso);
  }

  formatCompact(iso: string): string {
    const date = parseUtc(iso);
    return new Intl.DateTimeFormat(this.locale, {
      year: '2-digit',
      month: '2-digit',
      day: '2-digit',
      timeZone: this.timeZone,
    }).format(date);
  }

  formatRange(fromIso: string, toIso: string): string {
    const from = this.formatDateOnly(fromIso);
    const to = this.formatDateOnly(toIso);
    return `${from} - ${to}`;
  }
}

export const defaultFormatter = new DateFormatter();

export function formatTransaction(iso: string, timeZone?: string): string {
  const formatter = new DateFormatter({ timeZone });
  return formatter.formatTimestamp(iso);
}

export function formatTransactionDate(iso: string, timeZone?: string): string {
  const formatter = new DateFormatter({ timeZone });
  return formatter.formatDateOnly(iso);
}
