import { createValidationError, createValidationResult, type ValidationResult } from './types';
import { ValidationService } from './service';

export function validateAddressLegacy(
  address: string,
  chain: 'stellar' | 'base',
): ValidationResult {
  if (chain === 'stellar') {
    const result = ValidationService.validateStellarAddress(address);
    return {
      valid: result.valid,
      errors: result.errors || [],
    };
  } else if (chain === 'base') {
    const result = ValidationService.validateBaseAddress(address);
    return {
      valid: result.valid,
      errors: result.errors || [],
    };
  }

  return {
    valid: false,
    errors: [createValidationError('address', 'Invalid chain: must be "stellar" or "base"')],
  };
}

export function validateEvmAddressLegacy(address: string): ValidationResult {
  const result = ValidationService.validateEvmAddress(address);
  return {
    valid: result.valid,
    errors: result.errors || [],
  };
}

export function sanitizeInputLegacy(input: string): string {
  return input.trim().replace(/[^\w\s.-]/g, '');
}
