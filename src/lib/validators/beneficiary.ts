import { createValidationError, createValidationResult, type ValidationResult } from './types';
import { ValidationService } from './service';

export interface BeneficiaryData {
  institution: string;
  accountIdentifier: string;
  accountName?: string;
  currency: string;
}

export function validateBeneficiaryLegacy(data: BeneficiaryData): ValidationResult {
  const result = ValidationService.validateBeneficiary(data);
  return {
    valid: result.valid,
    errors: result.errors || [],
  };
}

export function validateAccountNumberLegacy(accountNumber: string): ValidationResult {
  const result = ValidationService.validateAccountNumber(accountNumber);
  return {
    valid: result.valid,
    errors: result.errors || [],
  };
}

export function validateInstitutionLegacy(institution: string): ValidationResult {
  const result = {
    valid: !!institution && institution.trim() !== '',
    errors:
      !institution || institution.trim() === ''
        ? [createValidationError('institution', 'Institution is required')]
        : [],
  };
  return {
    valid: result.valid,
    errors: result.errors || [],
  };
}
