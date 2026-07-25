/**
 * Centralized formatting utilities for currency, dates, and amounts
 * Consolidates duplicate formatting logic across components
 */

import type { Language } from '@/lib/i18n/types';

export interface CurrencyFormatOptions {
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  notation?: 'standard' | 'scientific' | 'engineering' | 'compact';
}

export interface DateFormatOptions extends Intl.DateTimeFormatOptions {
  includeTime?: boolean;
}

/**
 * Format amount as currency with proper locale and symbol
 */
export function formatCurrency(
  amount: number,
  currency: string = 'USD',
  locale: string = 'en-US',
  options: CurrencyFormatOptions = {}
): string {
  try {
    const { minimumFractionDigits = 2, maximumFractionDigits = 2, ...otherOptions } = options;
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits,
      maximumFractionDigits,
      ...otherOptions,
    }).format(amount);
  } catch {
    // Fallback for unknown/unsupported currencies
    return `${amount.toFixed(options.maximumFractionDigits ?? 2)} ${currency}`;
  }
}

/**
 * Format large numbers with compact notation (e.g., 1.5K, 2.3M)
 */
export function formatCompactNumber(amount: number, locale: string = 'en-US'): string {
  return new Intl.NumberFormat(locale, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(amount);
}

/**
 * Format percentage with configurable decimal places
 */
export function formatPercentage(value: number, decimals: number = 2, includeSymbol = true): string {
  const percentage = (value * 100).toFixed(decimals);
  return includeSymbol ? `${percentage}%` : percentage;
}

/**
 * Format amount with thousand separators (no currency symbol)
 */
export function formatAmount(amount: number, locale: string = 'en-US'): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format date with optional time component
 */
export function formatDate(
  date: Date | number,
  locale: string = 'en-US',
  options: DateFormatOptions = {}
): string {
  const { includeTime = true, ...dateOptions } = options;

  const dateTimeOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...(includeTime && {
      hour: '2-digit',
      minute: '2-digit',
    }),
    ...dateOptions,
  };

  return new Intl.DateTimeFormat(locale, dateTimeOptions).format(
    typeof date === 'number' ? new Date(date) : date
  );
}

/**
 * Format date as ISO string (YYYY-MM-DD)
 */
export function formatDateISO(date: Date | number): string {
  const d = typeof date === 'number' ? new Date(date) : date;
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/**
 * Format date as relative time (e.g., "2 hours ago", "3 days from now")
 */
export function formatRelativeTime(date: Date | number, locale: string = 'en-US'): string {
  const d = typeof date === 'number' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  if (diffSecs < 60) return rtf.format(diffSecs > 0 ? -diffSecs : 0, 'seconds');
  if (diffMins < 60) return rtf.format(-diffMins, 'minutes');
  if (diffHours < 24) return rtf.format(-diffHours, 'hours');
  return rtf.format(-diffDays, 'days');
}

/**
 * Format transaction amount with sign and currency
 */
export function formatTransactionAmount(
  amount: number,
  currency: string = 'USD',
  isDebit: boolean = false,
  locale: string = 'en-US'
): string {
  const formatted = formatCurrency(amount, currency, locale);
  const sign = isDebit ? '-' : '+';
  return `${sign}${formatted}`;
}

/**
 * Format time duration (ms) to human-readable format
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0) parts.push(`${seconds}s`);

  return parts.length > 0 ? parts.join(' ') : '0s';
}

/**
 * Format bytes as human-readable file size
 */
export function formatFileSize(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
}
