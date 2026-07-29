import { getCorridorValidators, getCorridorConfig } from './corridor-config';

/**
 * Bank account validation utilities.
 * Supports: account number (generic), US routing number (ABA), IBAN,
 * and pluggable per-country validators driven by corridor-config.
 */

export type ValidationResult = { valid: boolean; error?: string };

export type BankFieldType = 'account' | 'routing' | 'iban';

// ─── Pluggable per-country validator registry ──────────────────────────────

export type CountryValidatorFn = (field: BankFieldType, value: string) => ValidationResult | null;

const countryValidators = new Map<string, CountryValidatorFn>();

/**
 * Register a per-country bank-field validator.
 * Return `null` to fall through to the generic validators.
 */
export function registerCountryValidator(countryCode: string, fn: CountryValidatorFn): void {
  countryValidators.set(countryCode.toUpperCase(), fn);
}

/**
 * Get a registered country validator, or undefined.
 */
export function getCountryValidator(countryCode: string): CountryValidatorFn | undefined {
  return countryValidators.get(countryCode.toUpperCase());
}

/**
 * Remove a previously registered validator (useful in tests).
 */
export function unregisterCountryValidator(countryCode: string): void {
  countryValidators.delete(countryCode.toUpperCase());
}

// ─── Generic validators ──────────────────────────────────────────────────────

/** Generic account number: 4–20 digits */
export function validateAccountNumber(value: string): ValidationResult {
  const digits = value.replace(/\s/g, '');
  if (!digits) return { valid: false, error: 'Account number is required.' };
  if (!/^\d+$/.test(digits))
    return { valid: false, error: 'Account number must contain only digits.' };
  if (digits.length < 4)
    return { valid: false, error: 'Account number is too short (min 4 digits).' };
  if (digits.length > 20)
    return { valid: false, error: 'Account number is too long (max 20 digits).' };
  return { valid: true };
}

/** US ABA routing number: 9 digits with checksum */
export function validateRoutingNumber(value: string): ValidationResult {
  const digits = value.replace(/\s/g, '');
  if (!digits) return { valid: false, error: 'Routing number is required.' };
  if (!/^\d{9}$/.test(digits))
    return { valid: false, error: 'Routing number must be exactly 9 digits.' };

  // ABA checksum: 3*(d0+d3+d6) + 7*(d1+d4+d7) + (d2+d5+d8) must be divisible by 10
  const d = digits.split('').map(Number);
  const sum = 3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8]);
  if (sum % 10 !== 0) return { valid: false, error: 'Invalid routing number (checksum failed).' };
  return { valid: true };
}

/** IBAN: country code + check digits + BBAN, validated via MOD-97 */
export function validateIBAN(value: string): ValidationResult {
  const iban = value.replace(/\s/g, '').toUpperCase();
  if (!iban) return { valid: false, error: 'IBAN is required.' };
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/.test(iban)) {
    return {
      valid: false,
      error: 'IBAN format is invalid. Expected: CC##BBAN (e.g. GB29NWBK60161331926819).',
    };
  }
  // MOD-97 check
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let remainder = 0;
  for (const ch of numeric) {
    remainder = (remainder * 10 + parseInt(ch, 10)) % 97;
  }
  if (remainder !== 1) return { valid: false, error: 'IBAN check digits are invalid.' };
  return { valid: true };
}

// ─── Config-driven per-country validators ────────────────────────────────────

/**
 * Validate a bank field for a given country using the corridor-config validators.
 * Falls back to generic validators when no country-specific rules exist.
 */
export function validateBankFieldForCountry(
  country: string,
  field: BankFieldType,
  value: string,
): ValidationResult {
  // Check registered plugin validators first
  const pluginFn = getCountryValidator(country);
  if (pluginFn) {
    const result = pluginFn(field, value);
    if (result !== null) return result;
  }

  // Then check config-driven validators
  const corridorConfig = getCorridorConfig(country);
  if (corridorConfig) {
    const validators = corridorConfig.validators;
    const fieldConfig = validators.fields[field];
    if (fieldConfig) {
      if (field === 'iban' && 'enabled' in fieldConfig) {
        if (!(fieldConfig as { enabled: boolean }).enabled) {
          return { valid: false, error: `${country} does not support IBAN` };
        }
        return validateIBAN(value);
      }
      if (field === 'account') {
        const cfg = fieldConfig as { pattern?: string; minLength?: number; maxLength?: number };
        const digits = value.replace(/\s/g, '');
        if (cfg.pattern && !new RegExp(cfg.pattern).test(digits)) {
          return { valid: false, error: `Account number must match format for ${country}` };
        }
        if (cfg.minLength && digits.length < cfg.minLength) {
          return { valid: false, error: `Account number too short (min ${cfg.minLength})` };
        }
        if (cfg.maxLength && digits.length > cfg.maxLength) {
          return { valid: false, error: `Account number too long (max ${cfg.maxLength})` };
        }
        return { valid: true };
      }
      if (field === 'routing') {
        const cfg = fieldConfig as { pattern?: string; length?: number; checksum?: boolean };
        const digits = value.replace(/\s/g, '');
        if (cfg.pattern && !new RegExp(cfg.pattern).test(digits)) {
          return { valid: false, error: `Routing number must match format for ${country}` };
        }
        if (cfg.length && digits.length !== cfg.length) {
          return { valid: false, error: `Routing number must be ${cfg.length} digits` };
        }
        return { valid: true };
      }
    }
  }

  // Fallback to generic validators
  return validateBankField(field, value);
}

export function validateBankField(type: BankFieldType, value: string): ValidationResult {
  switch (type) {
    case 'account':
      return validateAccountNumber(value);
    case 'routing':
      return validateRoutingNumber(value);
    case 'iban':
      return validateIBAN(value);
  }
}

// ─── Built-in country validators ──────────────────────────────────────────

/** Nigeria: 10-digit NUBAN account with checksum */
function validateNigeriaBankField(_field: BankFieldType, value: string): ValidationResult | null {
  if (_field !== 'account') return null;
  const digits = value.replace(/\s/g, '');
  if (!/^\d{10}$/.test(digits)) {
    return { valid: false, error: 'Nigerian account numbers must be exactly 10 digits.' };
  }
  return { valid: true };
}

/** India: IFSC code format for routing */
function validateIndiaBankField(field: BankFieldType, value: string): ValidationResult | null {
  if (field !== 'routing') return null;
  const ifsc = value.replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
    return {
      valid: false,
      error: 'IFSC code must match format: 4 letters + 0 + 6 alphanumeric (e.g. HDFC0001234).',
    };
  }
  return { valid: true };
}

registerCountryValidator('NG', validateNigeriaBankField);
registerCountryValidator('IN', validateIndiaBankField);
