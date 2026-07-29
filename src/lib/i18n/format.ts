import type { Language } from './types';

/** Maps app language codes to BCP-47 locales for Intl formatting. */
export const LOCALE_MAP: Record<Language, string> = {
  en: 'en-US',
  es: 'es-ES',
  fr: 'fr-FR',
  zh: 'zh-CN',
  ar: 'ar-SA',
  pt: 'pt-PT',
  sw: 'sw-KE',
};

export function localeFor(language: Language): string {
  return LOCALE_MAP[language] ?? 'en-US';
}

export function formatDate(
  date: Date | number,
  language: Language,
  options?: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(localeFor(language), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...options,
  }).format(date);
}

export function formatNumber(
  amount: number,
  language: Language,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(localeFor(language), options).format(amount);
}

export function formatCurrencyAmount(amount: number, currency: string, language: Language): string {
  try {
    return new Intl.NumberFormat(localeFor(language), {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // Unknown/unsupported ISO currency code — fall back to a plain number + code.
    return `${formatNumber(amount, language)} ${currency}`;
  }
}
