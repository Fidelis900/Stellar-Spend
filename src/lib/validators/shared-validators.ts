import { z } from 'zod';

export const emailValidator = z
  .string()
  .email('Invalid email address')
  .min(5, 'Email must be at least 5 characters');

export const amountValidator = z
  .string()
  .min(1, 'Amount is required')
  .regex(/^\d+(\.\d{1,8})?$/, 'Amount must be a valid number')
  .refine((val) => {
    const num = parseFloat(val);
    return !isNaN(num) && isFinite(num);
  }, 'Amount must be a valid number')
  .refine((val) => parseFloat(val) > 0, 'Amount must be greater than 0');

export const stellarAddressValidator = z
  .string()
  .regex(/^G[A-Z0-9]{55}$/, 'Invalid Stellar address format')
  .describe('Valid Stellar public address starting with G');

export const phoneValidator = z
  .string()
  .regex(/^\+\d{1,3}[\s\-]?[\d\s\-\+]{7,}$/, 'Invalid phone number format')
  .min(10, 'Phone number must be at least 10 characters');

export const nameValidator = z
  .string()
  .min(2, 'Name must be at least 2 characters')
  .max(100, 'Name must not exceed 100 characters')
  .regex(/^[a-zA-Z\s\-\'áéíóúàèìòùäëïöüñ]+$/, 'Name contains invalid characters');

export const currencyCodeValidator = z
  .string()
  .length(3, 'Currency code must be exactly 3 characters')
  .regex(/^[A-Z]{3}$/, 'Currency code must be uppercase letters only');

export const ethereumAddressValidator = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address format');

export const urlValidator = z
  .string()
  .url('Invalid URL format')
  .startsWith('http', 'URL must start with http or https');

export const countryCodeValidator = z
  .string()
  .length(2, 'Country code must be 2 characters')
  .regex(/^[A-Z]{2}$/, 'Country code must be uppercase ISO 3166-1 alpha-2 format');

export const accountNumberValidator = z
  .string()
  .min(8, 'Account number must be at least 8 characters')
  .max(20, 'Account number must not exceed 20 characters')
  .regex(/^[a-zA-Z0-9]+$/, 'Account number must contain only alphanumeric characters');

export const institutionNameValidator = z
  .string()
  .min(2, 'Institution name must be at least 2 characters')
  .max(100, 'Institution name must not exceed 100 characters');

export const ibanValidator = z
  .string()
  .regex(/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/, 'Invalid IBAN format')
  .min(15, 'IBAN must be at least 15 characters')
  .max(34, 'IBAN must not exceed 34 characters');

export const bvnValidator = z
  .string()
  .regex(/^\d{11}$/, 'BVN must be exactly 11 digits');

export const ninValidator = z
  .string()
  .regex(/^\d{11}$/, 'NIN must be exactly 11 digits');

export function createMinAmountValidator(min: number) {
  return amountValidator.refine((val) => parseFloat(val) >= min, `Amount must be at least ${min}`);
}

export function createMaxAmountValidator(max: number) {
  return amountValidator.refine((val) => parseFloat(val) <= max, `Amount cannot exceed ${max}`);
}

export function createAmountRangeValidator(min: number, max: number) {
  return amountValidator
    .refine((val) => parseFloat(val) >= min, `Amount must be at least ${min}`)
    .refine((val) => parseFloat(val) <= max, `Amount cannot exceed ${max}`);
}

export const composedValidators = {
  email: emailValidator,
  amount: amountValidator,
  phone: phoneValidator,
  name: nameValidator,
  currencyCode: currencyCodeValidator,
  stellarAddress: stellarAddressValidator,
  ethereumAddress: ethereumAddressValidator,
  accountNumber: accountNumberValidator,
  institutionName: institutionNameValidator,
  iban: ibanValidator,
  bvn: bvnValidator,
  nin: ninValidator,
  countryCode: countryCodeValidator,
  url: urlValidator,
};
