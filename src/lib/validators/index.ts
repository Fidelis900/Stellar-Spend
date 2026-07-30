// Re-export ValidationService and all legacy methods for backward compatibility
export { ValidationService } from './service';
export { createValidationResult, createValidationError, type ValidationResult } from './types';
export {
  validateAmountLegacy,
  validateMinAmountLegacy,
  validateMaxAmountLegacy,
  validateAmountRangeLegacy,
} from './amount';
export {
  validateBeneficiaryLegacy,
  validateAccountNumberLegacy,
  validateInstitutionLegacy,
} from './beneficiary';
export { validateCurrencyLegacy, validateTokenLegacy, getSupportedCurrencies } from './currency';
export {
  validateAddressLegacy,
  validateEvmAddressLegacy,
  sanitizeInputLegacy,
} from './custom-rules';
export * from './schemas';
