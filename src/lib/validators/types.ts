export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export function createValidationError(field: string, message: string): ValidationError {
  return { field, message };
}

export function createValidationResult(
  valid: boolean,
  errors: ValidationError[] = [],
): ValidationResult {
  return { valid, errors };
}
