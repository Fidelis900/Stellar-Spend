import { createValidationError, createValidationResult, type ValidationResult } from './types';
import { ValidationService } from './service';

export function validateAmountLegacy(amount: string): ValidationResult {
  const result = ValidationService.validateAmount(amount);
  return {
    valid: result.valid,
    errors: result.errors || [],
  };
}

export function validateMinAmountLegacy(amount: string, min: number): ValidationResult {
  const result = ValidationService.validateMinAmount(amount, min);
  return {
    valid: result.valid,
    errors: result.errors || [],
  };
}

export function validateMaxAmountLegacy(amount: string, max: number): ValidationResult {
  const result = ValidationService.validateMaxAmount(amount, max);
  return {
    valid: result.valid,
    errors: result.errors || [],
  };
}

export function validateAmountRangeLegacy(
  amount: string,
  min: number,
  max: number,
): ValidationResult {
  const result = ValidationService.validateAmountRange(amount, min, max);
  return {
    valid: result.valid,
    errors: result.errors || [],
  };
}
