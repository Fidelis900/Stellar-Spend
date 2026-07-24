import { combine, maxLength, minLength, pattern, VALID, type ValidationResult } from "./rules";

export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 40;

// Letters (any script), numbers, spaces and a few safe punctuation marks.
const DISPLAY_NAME_PATTERN = /^[\p{L}\p{N} .'_-]+$/u;

/**
 * Validates an optional display name. An empty value is allowed (the field is
 * optional); a provided value must be 2–40 characters and contain only
 * letters, numbers, spaces or `. ' _ -`.
 */
export function validateDisplayName(value: string): ValidationResult {
  const trimmed = value.trim();
  if (trimmed.length === 0) return VALID;

  return combine(
    minLength(trimmed, DISPLAY_NAME_MIN, "Display name"),
    maxLength(trimmed, DISPLAY_NAME_MAX, "Display name"),
    pattern(
      trimmed,
      DISPLAY_NAME_PATTERN,
      "Display name can only contain letters, numbers, spaces and . ' _ -",
    ),
  );
}
