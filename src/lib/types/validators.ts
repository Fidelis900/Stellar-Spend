import { z } from 'zod';

/**
 * Runtime type validation with Zod
 */

// Amount validation
export const AmountSchema = z.string().regex(/^\d+(\.\d{1,8})?$/, 'Invalid amount format');

// Address validation
export const StellarAddressSchema = z.string().regex(/^G[A-Z2-7]{55}$/, 'Invalid Stellar address');
export const EthereumAddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address');

// Currency validation
export const CurrencyCodeSchema = z.string().length(3).toUpperCase();

// Transaction validation
export const TransactionSchema = z.object({
  id: z.string().min(1),
  userAddress: StellarAddressSchema,
  amount: AmountSchema,
  currency: CurrencyCodeSchema,
  status: z.enum(['pending', 'completed', 'failed']),
  timestamp: z.number().positive(),
});

// User validation
export const UserSchema = z.object({
  id: z.string().min(1),
  address: StellarAddressSchema,
  email: z.string().email().optional(),
  createdAt: z.number().positive(),
  updatedAt: z.number().positive(),
});

// API Key validation
export const ApiKeySchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  key: z.string().min(32),
  name: z.string().min(1),
  scopes: z.array(z.string()),
  createdAt: z.number().positive(),
  isActive: z.boolean(),
});

// Type guards using Zod
export function isValidAmount(value: unknown): value is string {
  return AmountSchema.safeParse(value).success;
}

export function isValidStellarAddress(value: unknown): value is string {
  return StellarAddressSchema.safeParse(value).success;
}

export function isValidEthereumAddress(value: unknown): value is string {
  return EthereumAddressSchema.safeParse(value).success;
}

export function isValidCurrencyCode(value: unknown): value is string {
  return CurrencyCodeSchema.safeParse(value).success;
}

export function validateAmount(value: unknown): string {
  return AmountSchema.parse(value);
}

export function validateStellarAddress(value: unknown): string {
  return StellarAddressSchema.parse(value);
}

export function validateEthereumAddress(value: unknown): string {
  return EthereumAddressSchema.parse(value);
}

export function validateTransaction(value: unknown) {
  return TransactionSchema.parse(value);
}

export function validateUser(value: unknown) {
  return UserSchema.parse(value);
}

export function validateApiKey(value: unknown) {
  return ApiKeySchema.parse(value);
}
