import { describe, it, expect } from 'vitest';
import {
  validateAccountNumber,
  validateRoutingNumber,
  validateIBAN,
  validateBankField,
} from '@/lib/bank-validation';

describe('validateAccountNumber', () => {
  it('rejects empty string', () => {
    expect(validateAccountNumber('').valid).toBe(false);
  });

  it('rejects non-digit characters', () => {
    expect(validateAccountNumber('123abc').valid).toBe(false);
  });

  it('rejects too short (< 4 digits)', () => {
    expect(validateAccountNumber('123').valid).toBe(false);
  });

  it('rejects too long (> 20 digits)', () => {
    expect(validateAccountNumber('123456789012345678901').valid).toBe(false);
  });

  it('accepts valid 10-digit account number', () => {
    expect(validateAccountNumber('0123456789').valid).toBe(true);
  });

  it('accepts 4-digit minimum', () => {
    expect(validateAccountNumber('1234').valid).toBe(true);
  });
});

describe('validateRoutingNumber', () => {
  it('rejects empty string', () => {
    expect(validateRoutingNumber('').valid).toBe(false);
  });

  it('rejects non-9-digit input', () => {
    expect(validateRoutingNumber('12345678').valid).toBe(false);
    expect(validateRoutingNumber('1234567890').valid).toBe(false);
  });

  it('rejects 9 digits that fail ABA checksum', () => {
    // 123456789: 3*(1+4+7) + 7*(2+5+8) + (3+6+9) = 36+105+18 = 159, not divisible by 10
    expect(validateRoutingNumber('123456789').valid).toBe(false);
  });

  it('accepts a valid ABA routing number (021000021 — JPMorgan Chase)', () => {
    expect(validateRoutingNumber('021000021').valid).toBe(true);
  });

  it('accepts 322271627 (Chase California)', () => {
    expect(validateRoutingNumber('322271627').valid).toBe(true);
  });
});

describe('validateIBAN', () => {
  it('rejects empty string', () => {
    expect(validateIBAN('').valid).toBe(false);
  });

  it('rejects malformed IBAN (no country code)', () => {
    expect(validateIBAN('12345678901234').valid).toBe(false);
  });

  it('rejects IBAN with invalid check digits', () => {
    expect(validateIBAN('GB00NWBK60161331926819').valid).toBe(false);
  });

  it('accepts valid GB IBAN', () => {
    expect(validateIBAN('GB29NWBK60161331926819').valid).toBe(true);
  });

  it('accepts IBAN with spaces (normalised)', () => {
    expect(validateIBAN('GB29 NWBK 6016 1331 9268 19').valid).toBe(true);
  });

  it('accepts valid DE IBAN', () => {
    expect(validateIBAN('DE89370400440532013000').valid).toBe(true);
  });
});

describe('validateBankField', () => {
  it("delegates 'account' to validateAccountNumber", () => {
    expect(validateBankField('account', '0123456789').valid).toBe(true);
    expect(validateBankField('account', '').valid).toBe(false);
  });

  it("delegates 'routing' to validateRoutingNumber", () => {
    expect(validateBankField('routing', '021000021').valid).toBe(true);
    expect(validateBankField('routing', '123456789').valid).toBe(false);
  });

  it("delegates 'iban' to validateIBAN", () => {
    expect(validateBankField('iban', 'GB29NWBK60161331926819').valid).toBe(true);
    expect(validateBankField('iban', 'INVALID').valid).toBe(false);
  });
});
