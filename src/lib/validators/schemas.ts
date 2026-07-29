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

// Verify-account schema
export const verifyAccountSchema = z.object({
  institution: z.string().min(1, 'institution is required'),
  accountIdentifier: z.string().min(1, 'accountIdentifier is required'),
});

// Quote request schema (extended for route use — feeMethod accepts both UI and API values)
export const quoteRouteSchema = z.object({
  amount: amountSchema,
  currency: z.string().min(1, 'currency is required'),
  feeMethod: z.enum(['USDC', 'XLM', 'stablecoin', 'native'], {
    errorMap: () => ({ message: 'feeMethod must be "USDC", "XLM", "stablecoin", or "native"' }),
  }),
  sourceAddress: z.string().optional(),
});

// Paycrest order request schema
export const paycrestOrderRouteSchema = z.object({
  amount: z.number({ invalid_type_error: 'amount must be a number' }).positive('amount must be a positive number'),
  rate: z.number({ invalid_type_error: 'rate must be a number' }).positive('rate must be a positive number'),
  token: z.string().min(1, 'token is required'),
  network: z.string().min(1, 'network is required'),
  reference: z.string().min(1, 'reference is required'),
  returnAddress: z.string().min(1, 'returnAddress is required'),
  recipient: z.object({
    institution: z.string().min(1, 'recipient.institution is required'),
    accountIdentifier: z.string().min(1, 'recipient.accountIdentifier is required'),
    accountName: z.string().min(1, 'recipient.accountName is required'),
    currency: z.string().min(1, 'recipient.currency is required'),
  }),
});

// Merchant account creation schema
export const createMerchantSchema = z.object({
  userId: z.string().min(1, 'userId is required'),
  businessName: z.string().min(1, 'businessName is required'),
  businessEmail: z.string().email('businessEmail must be a valid email'),
});

// Merchant bulk payout item schema
export const bulkPayoutItemSchema = z.object({
  beneficiaryInstitution: z.string().min(1, 'beneficiaryInstitution is required'),
  beneficiaryAccount: z.string().min(1, 'beneficiaryAccount is required'),
  beneficiaryName: z.string().min(1, 'beneficiaryName is required'),
  amount: z.number({ invalid_type_error: 'amount must be a number' }).positive('amount must be positive'),
  currency: z.string().min(1, 'currency is required'),
});

// Merchant bulk payout schema
export const createBulkPayoutSchema = z.object({
  merchantId: z.string().min(1, 'merchantId is required'),
  idempotencyKey: z.string().min(1, 'idempotencyKey is required'),
  items: z.array(bulkPayoutItemSchema).min(1, 'items must be a non-empty array'),
});

// Queue manage action schema
export const queueManageSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('remove'),
    id: z.string().min(1, 'id is required'),
  }),
  z.object({
    action: z.literal('override'),
    id: z.string().min(1, 'id is required'),
    priority: z.number().int().min(1).max(4),
  }),
]);

// Validation error formatting
export interface FormattedValidationError {
  field: string;
  message: string;
}

export function formatZodErrors(error: z.ZodError): FormattedValidationError[] {
  return error.errors.map((err) => ({
    field: err.path.join('.') || 'root',
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

/**
 * Parse a request body with a zod schema. Returns { data } on success or
 * throws a NextResponse with a 400 validation error.
 */
export function parseBody<T>(
  schema: z.ZodSchema<T>,
  rawBody: unknown,
): { ok: true; data: T } | { ok: false; errors: FormattedValidationError[] } {
  const result = validateWithSchema(schema, rawBody);
  if (result.valid && result.data !== undefined) {
    return { ok: true, data: result.data };
  }
  return { ok: false, errors: result.errors ?? [{ field: 'unknown', message: 'Validation failed' }] };
}
