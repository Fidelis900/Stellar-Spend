/**
 * Small, composable form-validation rules shared across settings (and any
 * other) forms. Each rule returns a {@link ValidationResult} so callers can
 * render inline errors consistently.
 */

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export const VALID: ValidationResult = { valid: true };

export function invalid(error: string): ValidationResult {
  return { valid: false, error };
}

/** Fails when the trimmed value is empty. */
export function required(value: string, label = "This field"): ValidationResult {
  return value.trim().length > 0 ? VALID : invalid(`${label} is required.`);
}

/** Fails when the trimmed value is shorter than `min` characters. */
export function minLength(value: string, min: number, label = "This field"): ValidationResult {
  return value.trim().length >= min
    ? VALID
    : invalid(`${label} must be at least ${min} characters.`);
}

/** Fails when the trimmed value is longer than `max` characters. */
export function maxLength(value: string, max: number, label = "This field"): ValidationResult {
  return value.trim().length <= max
    ? VALID
    : invalid(`${label} must be ${max} characters or fewer.`);
}

/** Fails when the value does not match `regex`. */
export function pattern(value: string, regex: RegExp, error: string): ValidationResult {
  return regex.test(value) ? VALID : invalid(error);
}

/**
 * Runs rules in order and returns the first failure, or {@link VALID} when
 * every rule passes.
 */
export function combine(...results: ValidationResult[]): ValidationResult {
  return results.find((r) => !r.valid) ?? VALID;
}
