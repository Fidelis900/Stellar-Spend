import { z } from 'zod';

/**
 * Reusable Zod validation schemas for the application
 */

// Amount schemas
export const amountSchema = z
  .string()
  .min(1, 'Amount is required')
  .regex(/^\d*\.?\d*$/, 'Amount must be a valid number')
  .refine((val) => {
    const num = parseFloat(val);
    return !isNaN(num) && isFinite(num);
  }, 'Amount must be a valid number')
  .refine((val) => parseFloat(val) > 0, 'Amount must be greater than 0');

export const minAmountSchema = (min: number) =>
  amountSchema.refine((val) => parseFloat(val) >= min, `Amount must be at least ${min}`);

export const maxAmountSchema = (max: number) =>
  amountSchema.refine((val) => parseFloat(val) <= max, `Amount cannot exceed ${max}`);

export const amountRangeSchema = (min: number, max: number) =>
  amountSchema
    .refine((val) => parseFloat(val) >= min, `Amount must be at least ${min}`)
    .refine((val) => parseFloat(val) <= max, `Amount cannot exceed ${max}`);

// Address schemas
export const stellarAddressSchema = z
  .string()
  .min(1, 'Stellar address is required')
  .regex(/^G[A-Z0-9]{55}$/, 'Invalid Stellar address format');

export const baseAddressSchema = z
  .string()
  .min(1, 'Base address is required')
  .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Base address format');

export const evmAddressSchema = z
  .string()
  .min(1, 'EVM address is required')
  .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid EVM address format');

// Currency schemas
export const currencyCodeSchema = z
  .string()
  .length(3, 'Currency code must be 3 characters')
  .regex(/^[A-Z]{3}$/, 'Currency code must be uppercase letters');

// Beneficiary schemas
export const accountNumberSchema = z
  .string()
  .min(1, 'Account number is required')
  .regex(/^\d{10}$/, 'Account number must be 10 digits');

export const institutionSchema = z
  .string()
  .min(1, 'Institution is required')
  .min(2, 'Institution name must be at least 2 characters');

export const beneficiarySchema = z.object({
  institution: institutionSchema,
  accountIdentifier: accountNumberSchema,
  accountName: z.string().optional(),
  currency: currencyCodeSchema,
});

// Quote request schema
export const quoteRequestSchema = z.object({
  amount: amountSchema,
  currency: currencyCodeSchema,
  feeMethod: z.enum(['USDC', 'XLM']),
});

// Bridge transaction schema
export const bridgeTransactionSchema = z.object({
  amount: amountSchema,
  fromAddress: stellarAddressSchema,
  toAddress: baseAddressSchema,
  feePaymentMethod: z.enum(['stablecoin', 'native']),
});

// Payout order schema
export const payoutOrderSchema = z.object({
  amount: amountSchema,
  currency: currencyCodeSchema,
  beneficiary: beneficiarySchema,
  reference: z.string().optional(),
});

// Offramp request schema
export const offrampRequestSchema = z.object({
  amount: amountSchema,
  currency: currencyCodeSchema,
  beneficiary: beneficiarySchema,
  feeMethod: z.enum(['USDC', 'XLM']),
  fromAddress: stellarAddressSchema,
  toAddress: baseAddressSchema,
});

// Validation error formatting
export interface FormattedValidationError {
  field: string;
  message: string;
}

export function formatZodErrors(error: z.ZodError): FormattedValidationError[] {
  return error.errors.map((err) => ({
    field: err.path.join('.'),
    message: err.message,
  }));
}

export function validateWithSchema<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
): { valid: boolean; data?: T; errors?: FormattedValidationError[] } {
  try {
    const validated = schema.parse(data);
    return { valid: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { valid: false, errors: formatZodErrors(error) };
    }
    return { valid: false, errors: [{ field: 'unknown', message: 'Validation failed' }] };
  }
}
