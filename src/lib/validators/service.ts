import {
  amountSchema,
  minAmountSchema,
  maxAmountSchema,
  amountRangeSchema,
  stellarAddressSchema,
  baseAddressSchema,
  evmAddressSchema,
  currencyCodeSchema,
  accountNumberSchema,
  institutionSchema,
  beneficiarySchema,
  quoteRequestSchema,
  bridgeTransactionSchema,
  payoutOrderSchema,
  offrampRequestSchema,
  formatZodErrors,
  FormattedValidationError,
  validateWithSchema,
  createValidationResult,
} from './schemas';
import { type ValidationResult } from './types';

/**
 * Centralized validation service for all application validations
 */
export class ValidationService {
  /**
   * Validate amount
   */
  static validateAmount(amount: string): { valid: boolean; errors?: FormattedValidationError[] } {
    return validateWithSchema(amountSchema, amount);
  }

  /**
   * Validate amount with legacy method (returns ValidationResult)
   */
  static validateAmountLegacy(amount: string, field = 'amount'): ValidationResult {
    const result = this.validateAmount(amount);
    return {
      valid: result.valid,
      errors: result.errors?.map((error) => ({ field: error.field, message: error.message })) || [],
    };
  }

  /**
   * Validate amount with minimum
   */
  static validateMinAmount(
    amount: string,
    min: number,
  ): { valid: boolean; errors?: FormattedValidationError[] } {
    return validateWithSchema(minAmountSchema(min), amount);
  }

  /**
   * Validate amount with maximum
   */
  static validateMaxAmount(
    amount: string,
    max: number,
  ): { valid: boolean; errors?: FormattedValidationError[] } {
    return validateWithSchema(maxAmountSchema(max), amount);
  }

  /**
   * Validate amount within range
   */
  static validateAmountRange(
    amount: string,
    min: number,
    max: number,
  ): { valid: boolean; errors?: FormattedValidationError[] } {
    return validateWithSchema(amountRangeSchema(min, max), amount);
  }

  /**
   * Validate Stellar address
   */
  static validateStellarAddress(address: string): {
    valid: boolean;
    errors?: FormattedValidationError[];
  } {
    return validateWithSchema(stellarAddressSchema, address);
  }

  /**
   * Validate Base address
   */
  static validateBaseAddress(address: string): {
    valid: boolean;
    errors?: FormattedValidationError[];
  } {
    return validateWithSchema(baseAddressSchema, address);
  }

  /**
   * Validate EVM address
   */
  static validateEvmAddress(address: string): {
    valid: boolean;
    errors?: FormattedValidationError[];
  } {
    return validateWithSchema(evmAddressSchema, address);
  }

  /**
   * Validate currency code
   */
  static validateCurrencyCode(code: string): {
    valid: boolean;
    errors?: FormattedValidationError[];
  } {
    return validateWithSchema(currencyCodeSchema, code);
  }

  /**
   * Validate account number
   */
  static validateAccountNumber(accountNumber: string): {
    valid: boolean;
    errors?: FormattedValidationError[];
  } {
    return validateWithSchema(accountNumberSchema, accountNumber);
  }

  /**
   * Validate institution
   */
  static validateInstitution(institution: string): {
    valid: boolean;
    errors?: FormattedValidationError[];
  } {
    return validateWithSchema(institutionSchema, institution);
  }

  /**
   * Validate beneficiary data
   */
  static validateBeneficiary(data: unknown): {
    valid: boolean;
    data?: any;
    errors?: FormattedValidationError[];
  } {
    return validateWithSchema(beneficiarySchema, data);
  }

  /**
   * Validate quote request
   */
  static validateQuoteRequest(data: unknown): {
    valid: boolean;
    data?: any;
    errors?: FormattedValidationError[];
  } {
    return validateWithSchema(quoteRequestSchema, data);
  }

  /**
   * Validate bridge transaction
   */
  static validateBridgeTransaction(data: unknown): {
    valid: boolean;
    data?: any;
    errors?: FormattedValidationError[];
  } {
    return validateWithSchema(bridgeTransactionSchema, data);
  }

  /**
   * Validate payout order
   */
  static validatePayoutOrder(data: unknown): {
    valid: boolean;
    data?: any;
    errors?: FormattedValidationError[];
  } {
    return validateWithSchema(payoutOrderSchema, data);
  }

  /**
   * Validate offramp request
   */
  static validateOfframpRequest(data: unknown): {
    valid: boolean;
    data?: any;
    errors?: FormattedValidationError[];
  } {
    return validateWithSchema(offrampRequestSchema, data);
  }

  /**
   * Validate amount with minimum (legacy)
   */
  static validateMinAmountLegacy(amount: string, min: number, field = 'amount'): ValidationResult {
    const result = this.validateMinAmount(amount, min);
    return {
      valid: result.valid,
      errors: result.errors?.map((error) => ({ field: error.field, message: error.message })) || [],
    };
  }

  /**
   * Validate amount with maximum (legacy)
   */
  static validateMaxAmountLegacy(amount: string, max: number, field = 'amount'): ValidationResult {
    const result = this.validateMaxAmount(amount, max);
    return {
      valid: result.valid,
      errors: result.errors?.map((error) => ({ field: error.field, message: error.message })) || [],
    };
  }

  /**
   * Validate amount within range (legacy)
   */
  static validateAmountRangeLegacy(
    amount: string,
    min: number,
    max: number,
    field = 'amount',
  ): ValidationResult {
    const result = this.validateAmountRange(amount, min, max);
    return {
      valid: result.valid,
      errors: result.errors?.map((error) => ({ field: error.field, message: error.message })) || [],
    };
  }

  /**
   * Validate Stellar address (legacy)
   */
  static validateStellarAddressLegacy(address: string): ValidationResult {
    const result = this.validateStellarAddress(address);
    return {
      valid: result.valid,
      errors: result.errors?.map((error) => ({ field: error.field, message: error.message })) || [],
    };
  }

  /**
   * Validate Base address (legacy)
   */
  static validateBaseAddressLegacy(address: string): ValidationResult {
    const result = this.validateBaseAddress(address);
    return {
      valid: result.valid,
      errors: result.errors?.map((error) => ({ field: error.field, message: error.message })) || [],
    };
  }

  /**
   * Validate EVM address (legacy)
   */
  static validateEvmAddressLegacy(address: string): ValidationResult {
    const result = this.validateEvmAddress(address);
    return {
      valid: result.valid,
      errors: result.errors?.map((error) => ({ field: error.field, message: error.message })) || [],
    };
  }

  /**
   * Validate currency code (legacy)
   */
  static validateCurrencyCodeLegacy(code: string): ValidationResult {
    const result = this.validateCurrencyCode(code);
    return {
      valid: result.valid,
      errors: result.errors?.map((error) => ({ field: error.field, message: error.message })) || [],
    };
  }

  /**
   * Validate account number (legacy)
   */
  static validateAccountNumberLegacy(accountNumber: string): ValidationResult {
    const result = this.validateAccountNumber(accountNumber);
    return {
      valid: result.valid,
      errors: result.errors?.map((error) => ({ field: error.field, message: error.message })) || [],
    };
  }

  /**
   * Validate institution (legacy)
   */
  static validateInstitutionLegacy(institution: string): ValidationResult {
    const result = this.validateInstitution(institution);
    return {
      valid: result.valid,
      errors: result.errors?.map((error) => ({ field: error.field, message: error.message })) || [],
    };
  }

  /**
   * Validate beneficiary data (legacy)
   */
  static validateBeneficiaryLegacy(data: unknown): ValidationResult {
    const result = this.validateBeneficiary(data);
    return {
      valid: result.valid,
      errors: result.errors?.map((error) => ({ field: error.field, message: error.message })) || [],
      data: result.data,
    };
  }

  /**
   * Validate quote request (legacy)
   */
  static validateQuoteRequestLegacy(data: unknown): ValidationResult {
    const result = this.validateQuoteRequest(data);
    return {
      valid: result.valid,
      errors: result.errors?.map((error) => ({ field: error.field, message: error.message })) || [],
      data: result.data,
    };
  }

  /**
   * Validate bridge transaction (legacy)
   */
  static validateBridgeTransactionLegacy(data: unknown): ValidationResult {
    const result = this.validateBridgeTransaction(data);
    return {
      valid: result.valid,
      errors: result.errors?.map((error) => ({ field: error.field, message: error.message })) || [],
      data: result.data,
    };
  }

  /**
   * Validate payout order (legacy)
   */
  static validatePayoutOrderLegacy(data: unknown): ValidationResult {
    const result = this.validatePayoutOrder(data);
    return {
      valid: result.valid,
      errors: result.errors?.map((error) => ({ field: error.field, message: error.message })) || [],
      data: result.data,
    };
  }

  /**
   * Validate offramp request (legacy)
   */
  static validateOfframpRequestLegacy(data: unknown): ValidationResult {
    const result = this.validateOfframpRequest(data);
    return {
      valid: result.valid,
      errors: result.errors?.map((error) => ({ field: error.field, message: error.message })) || [],
      data: result.data,
    };
  }
}
