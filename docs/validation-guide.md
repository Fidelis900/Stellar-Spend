# Validation Guide

## Overview

Stellar-Spend uses Zod for centralized, type-safe validation. All validation logic is consolidated in `src/lib/validators/` for consistency and reusability.

## Validation Service

The `ValidationService` class provides static methods for all common validations:

```typescript
import { ValidationService } from '@/lib/validators/service';

// Validate amount
const result = ValidationService.validateAmount('100.50');
if (!result.valid) {
  console.error(result.errors);
}

// Validate with constraints
const minResult = ValidationService.validateMinAmount('50', 10);
const rangeResult = ValidationService.validateAmountRange('100', 10, 1000);
```

## Available Validators

### Amount Validation

- `validateAmount(amount)` - Basic amount validation
- `validateMinAmount(amount, min)` - Minimum amount
- `validateMaxAmount(amount, max)` - Maximum amount
- `validateAmountRange(amount, min, max)` - Range validation

### Address Validation

- `validateStellarAddress(address)` - Stellar address format
- `validateBaseAddress(address)` - Base chain address format
- `validateEvmAddress(address)` - EVM address format

### Currency Validation

- `validateCurrencyCode(code)` - 3-letter currency code

### Beneficiary Validation

- `validateAccountNumber(accountNumber)` - 10-digit account number
- `validateInstitution(institution)` - Institution name
- `validateBeneficiary(data)` - Complete beneficiary object

### Request Validation

- `validateQuoteRequest(data)` - Quote request object
- `validateBridgeTransaction(data)` - Bridge transaction object
- `validatePayoutOrder(data)` - Payout order object
- `validateOfframpRequest(data)` - Complete offramp request

## Validation Schemas

Use Zod schemas directly for custom validation:

```typescript
import { amountSchema, stellarAddressSchema } from '@/lib/validators/schemas';

const amount = amountSchema.parse(userInput);
const address = stellarAddressSchema.parse(userInput);
```

## Error Formatting

Validation errors are formatted consistently:

```typescript
interface FormattedValidationError {
  field: string;
  message: string;
}
```

## Best Practices

1. **Use ValidationService** for common validations
2. **Validate early** at API boundaries
3. **Return formatted errors** to clients
4. **Compose schemas** for complex objects
5. **Add custom rules** for domain-specific validation

## Custom Validation Rules

Extend Zod schemas with custom rules:

```typescript
const customSchema = z
  .string()
  .min(1, 'Required')
  .refine((val) => !val.includes('invalid'), 'Contains invalid characters');
```
