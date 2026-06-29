import { describe, it, expect } from 'vitest';
import {
  getActiveCurrencies,
  getCurrencyConfig,
  isSupportedCurrency,
  validateCurrencyAmount,
  SUPPORTED_CURRENCIES,
  getCurrencies,
  getDefaultCurrencyForCountry,
} from './currencies';

describe('SUPPORTED_CURRENCIES', () => {
  it('contains at least 10 currencies', () => {
    expect(SUPPORTED_CURRENCIES.length).toBeGreaterThanOrEqual(10);
  });

  it('all entries have required fields', () => {
    for (const c of SUPPORTED_CURRENCIES) {
      expect(c.code).toBeTruthy();
      expect(c.name).toBeTruthy();
      expect(c.symbol).toBeTruthy();
      expect(typeof c.decimals).toBe('number');
      expect(c.minAmount).toBeGreaterThan(0);
      expect(c.maxAmount).toBeGreaterThan(c.minAmount);
    }
  });

  it('has unique currency codes', () => {
    const codes = SUPPORTED_CURRENCIES.map(c => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('all decimals are non-negative integers', () => {
    for (const c of SUPPORTED_CURRENCIES) {
      expect(Number.isInteger(c.decimals)).toBe(true);
      expect(c.decimals).toBeGreaterThanOrEqual(0);
    }
  });

  it('minAmount is strictly positive for all entries', () => {
    for (const c of SUPPORTED_CURRENCIES) {
      expect(c.minAmount).toBeGreaterThan(0);
    }
  });

  it('maxAmount is strictly greater than minAmount for all entries', () => {
    for (const c of SUPPORTED_CURRENCIES) {
      expect(c.maxAmount).toBeGreaterThan(c.minAmount);
    }
  });
});

describe('getActiveCurrencies', () => {
  it('returns only active currencies', () => {
    const active = getActiveCurrencies();
    expect(active.every((c) => c.active)).toBe(true);
    expect(active.length).toBeGreaterThan(0);
  });

  it('excludes inactive currencies', () => {
    const active = getActiveCurrencies();
    const activeCodes = active.map(c => c.code);
    expect(activeCodes).not.toContain('MWK');
    expect(activeCodes).not.toContain('ZMW');
  });

  it('returns at least 20 active currencies', () => {
    expect(getActiveCurrencies().length).toBeGreaterThanOrEqual(20);
  });
});

describe('getCurrencyConfig', () => {
  it('returns config for known currency', () => {
    const config = getCurrencyConfig('NGN');
    expect(config).toBeDefined();
    expect(config?.code).toBe('NGN');
  });

  it('is case-insensitive', () => {
    expect(getCurrencyConfig('ngn')).toBeDefined();
    expect(getCurrencyConfig('KES')).toBeDefined();
    expect(getCurrencyConfig('kes')).toBeDefined();
    expect(getCurrencyConfig('Ngn')).toBeDefined();
  });

  it('returns undefined for unknown currency', () => {
    expect(getCurrencyConfig('XYZ')).toBeUndefined();
  });

  it('returns config for currencies with various decimal places', () => {
    const ugx = getCurrencyConfig('UGX');
    expect(ugx?.decimals).toBe(0);

    const ngn = getCurrencyConfig('NGN');
    expect(ngn?.decimals).toBe(2);

    const tnd = getCurrencyConfig('TND');
    expect(tnd?.decimals).toBe(3);
  });

  it('returns undefined for empty string', () => {
    expect(getCurrencyConfig('')).toBeUndefined();
  });

  it('returns undefined for null-like input', () => {
    expect(getCurrencyConfig('  ')).toBeUndefined();
  });
});

describe('isSupportedCurrency', () => {
  it('returns true for active currencies', () => {
    expect(isSupportedCurrency('NGN')).toBe(true);
    expect(isSupportedCurrency('KES')).toBe(true);
  });

  it('returns false for inactive currencies', () => {
    const inactive = SUPPORTED_CURRENCIES.find((c) => !c.active);
    if (inactive) {
      expect(isSupportedCurrency(inactive.code)).toBe(false);
    }
  });

  it('returns false for unknown currencies', () => {
    expect(isSupportedCurrency('XYZ')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isSupportedCurrency('ngn')).toBe(true);
    expect(isSupportedCurrency('Ngn')).toBe(true);
  });

  it('returns false for empty string', () => {
    expect(isSupportedCurrency('')).toBe(false);
  });
});

describe('validateCurrencyAmount', () => {
  it('returns null for valid amount', () => {
    expect(validateCurrencyAmount('NGN', 1000)).toBeNull();
  });

  it('returns null for amount at exact minimum', () => {
    const ngn = getCurrencyConfig('NGN')!;
    expect(validateCurrencyAmount('NGN', ngn.minAmount)).toBeNull();
  });

  it('returns null for amount at exact maximum', () => {
    const ngn = getCurrencyConfig('NGN')!;
    expect(validateCurrencyAmount('NGN', ngn.maxAmount)).toBeNull();
  });

  it('returns error for amount below minimum', () => {
    const config = getCurrencyConfig('NGN')!;
    const error = validateCurrencyAmount('NGN', config.minAmount - 1);
    expect(error).toMatch(/minimum/i);
  });

  it('returns error for amount above maximum', () => {
    const config = getCurrencyConfig('NGN')!;
    const error = validateCurrencyAmount('NGN', config.maxAmount + 1);
    expect(error).toMatch(/maximum/i);
  });

  it('returns error for unsupported currency', () => {
    const error = validateCurrencyAmount('XYZ', 100);
    expect(error).toMatch(/unsupported/i);
  });

  it('returns error for inactive currency', () => {
    const inactive = SUPPORTED_CURRENCIES.find(c => !c.active);
    if (inactive) {
      const error = validateCurrencyAmount(inactive.code, inactive.minAmount);
      expect(error).toMatch(/not currently active/i);
    }
  });

  it('returns error for fractional amount below minimum', () => {
    const ngn = getCurrencyConfig('NGN')!;
    const error = validateCurrencyAmount('NGN', ngn.minAmount - 0.01);
    expect(error).toMatch(/minimum/i);
  });

  it('validates across multiple currencies', () => {
    for (const c of getActiveCurrencies()) {
      expect(validateCurrencyAmount(c.code, c.minAmount + 1)).toBeNull();
      expect(validateCurrencyAmount(c.code, c.minAmount - 1)).toMatch(/minimum/i);
    }
  });

  it('validates zero-decimal currencies correctly', () => {
    expect(validateCurrencyAmount('UGX', 5000)).toBeNull();
    expect(validateCurrencyAmount('UGX', 500)).toMatch(/minimum/i);
  });
});

describe('getCurrencies', () => {
  it('returns only active currencies without flag', async () => {
    const currencies = await getCurrencies();
    expect(Array.isArray(currencies)).toBe(true);
    for (const c of currencies) {
      expect(c).not.toHaveProperty('flag');
      expect(c).toHaveProperty('code');
      expect(c).toHaveProperty('name');
      expect(c).toHaveProperty('symbol');
    }
  });

  it('includes active currencies only', async () => {
    const currencies = await getCurrencies();
    const codes = currencies.map(c => c.code);
    expect(codes).toContain('NGN');
    expect(codes).not.toContain('MWK');
  });
});

describe('precision and rounding edge cases', () => {
  it('amounts at boundaries of decimal precision', () => {
    expect(validateCurrencyAmount('NGN', 100.999)).toBeNull();
    expect(validateCurrencyAmount('NGN', 100.001)).toBeNull();
  });

  it('handles very large amount near max', () => {
    expect(validateCurrencyAmount('IDR', 500000000)).toBeNull();
    expect(validateCurrencyAmount('IDR', 500000001)).toMatch(/maximum/i);
  });

  it('handles very small amount near min', () => {
    expect(validateCurrencyAmount('NGN', 99.999)).toMatch(/minimum/i);
  });

  it('treats zero as below minimum for all currencies', () => {
    for (const c of getActiveCurrencies()) {
      expect(validateCurrencyAmount(c.code, 0)).toMatch(/minimum/i);
    }
  });

  it('handles negative amounts', () => {
    for (const c of getActiveCurrencies()) {
      expect(validateCurrencyAmount(c.code, -1)).toMatch(/minimum/i);
    }
  });
});

describe('getDefaultCurrencyForCountry', () => {
  it('returns the active currency for a known country', () => {
    expect(getDefaultCurrencyForCountry('NG')?.code).toBe('NGN');
    expect(getDefaultCurrencyForCountry('ke')?.code).toBe('KES');
  });

  it('returns undefined for a country with no active currency mapping', () => {
    expect(getDefaultCurrencyForCountry('ZZ')).toBeUndefined();
  });

  it('does not match an inactive currency\'s country', () => {
    // MW (Malawi) maps to MWK, which is inactive.
    expect(getDefaultCurrencyForCountry('MW')).toBeUndefined();
  });
});
