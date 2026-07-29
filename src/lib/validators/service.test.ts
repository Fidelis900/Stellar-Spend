import { describe, it, expect } from 'vitest';
import { ValidationService } from './service';

describe('ValidationService', () => {
  describe('Amount Validation', () => {
    it('should validate valid amounts', () => {
      const result = ValidationService.validateAmount('100.50');
      expect(result.valid).toBe(true);
    });

    it('should reject invalid amounts', () => {
      const result = ValidationService.validateAmount('abc');
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should reject zero amount', () => {
      const result = ValidationService.validateAmount('0');
      expect(result.valid).toBe(false);
    });

    it('should validate min amount', () => {
      const result = ValidationService.validateMinAmount('100', 50);
      expect(result.valid).toBe(true);
    });

    it('should reject below min amount', () => {
      const result = ValidationService.validateMinAmount('30', 50);
      expect(result.valid).toBe(false);
    });

    it('should validate max amount', () => {
      const result = ValidationService.validateMaxAmount('100', 200);
      expect(result.valid).toBe(true);
    });

    it('should reject above max amount', () => {
      const result = ValidationService.validateMaxAmount('300', 200);
      expect(result.valid).toBe(false);
    });

    it('should validate amount range', () => {
      const result = ValidationService.validateAmountRange('100', 50, 200);
      expect(result.valid).toBe(true);
    });

    it('should validate legacy amount method', () => {
      const result = ValidationService.validateAmountLegacy('100.50');
      expect(result.valid).toBe(true);
      expect(result.errors).toBeDefined();
      expect(result.errors.length).toBe(0);
    });

    it('should reject invalid legacy amount', () => {
      const result = ValidationService.validateAmountLegacy('abc');
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it('should validate legacy min amount', () => {
      const result = ValidationService.validateMinAmountLegacy('100', 50);
      expect(result.valid).toBe(true);
      expect(result.errors).toBeDefined();
      expect(result.errors.length).toBe(0);
    });

    it('should reject below min legacy amount', () => {
      const result = ValidationService.validateMinAmountLegacy('30', 50);
      expect(result.valid).toBe(false);
    });

    it('should validate legacy max amount', () => {
      const result = ValidationService.validateMaxAmountLegacy('100', 200);
      expect(result.valid).toBe(true);
    });

    it('should reject above max legacy amount', () => {
      const result = ValidationService.validateMaxAmountLegacy('300', 200);
      expect(result.valid).toBe(false);
    });

    it('should validate legacy amount range', () => {
      const result = ValidationService.validateAmountRangeLegacy('100', 50, 200);
      expect(result.valid).toBe(true);
    });
  });

  describe('Address Validation', () => {
    it('should validate Stellar address', () => {
      const result = ValidationService.validateStellarAddress(
        'GCFX3NWMYLTOVSC3XVFVRID47IQ5LCLF34CM4A4ADIXZXWQGORNRIE25',
      );
      expect(result.valid).toBe(true);
    });

    it('should reject invalid Stellar address', () => {
      const result = ValidationService.validateStellarAddress('invalid');
      expect(result.valid).toBe(false);
    });

    it('should validate Base address', () => {
      const result = ValidationService.validateBaseAddress(
        '0xd8dA6BF26964aF9D7eEd9e03E53415D37AA96045',
      );
      expect(result.valid).toBe(true);
    });

    it('should reject invalid Base address', () => {
      const result = ValidationService.validateBaseAddress('0xinvalid');
      expect(result.valid).toBe(false);
    });

    it('should validate EVM address', () => {
      const result = ValidationService.validateEvmAddress(
        '0xd8dA6BF26964aF9D7eEd9e03E53415D37AA96045',
      );
      expect(result.valid).toBe(true);
    });

    it('should validate legacy Stellar address', () => {
      const result = ValidationService.validateStellarAddressLegacy(
        'GCFX3NWMYLTOVSC3XVFVRID47IQ5LCLF34CM4A4ADIXZXWQGORNRIE25',
      );
      expect(result.valid).toBe(true);
      expect(result.errors).toBeDefined();
      expect(result.errors.length).toBe(0);
    });

    it('should reject invalid legacy Stellar address', () => {
      const result = ValidationService.validateStellarAddressLegacy('invalid');
      expect(result.valid).toBe(false);
    });
  });

  describe('Currency Validation', () => {
    it('should validate currency code', () => {
      const result = ValidationService.validateCurrencyCode('NGN');
      expect(result.valid).toBe(true);
    });

    it('should reject invalid currency code', () => {
      const result = ValidationService.validateCurrencyCode('INVALID');
      expect(result.valid).toBe(false);
    });

    it('should validate legacy currency code', () => {
      const result = ValidationService.validateCurrencyCodeLegacy('NGN');
      expect(result.valid).toBe(true);
      expect(result.errors).toBeDefined();
      expect(result.errors.length).toBe(0);
    });

    it('should reject invalid legacy currency code', () => {
      const result = ValidationService.validateCurrencyCodeLegacy('INVALID');
      expect(result.valid).toBe(false);
    });
  });

  describe('Beneficiary Validation', () => {
    it('should validate account number', () => {
      const result = ValidationService.validateAccountNumber('1234567890');
      expect(result.valid).toBe(true);
    });

    it('should reject invalid account number', () => {
      const result = ValidationService.validateAccountNumber('123');
      expect(result.valid).toBe(false);
    });

    it('should validate institution', () => {
      const result = ValidationService.validateInstitution('GTBank');
      expect(result.valid).toBe(true);
    });

    it('should validate complete beneficiary', () => {
      const result = ValidationService.validateBeneficiary({
        institution: 'GTBank',
        accountIdentifier: '1234567890',
        currency: 'NGN',
      });
      expect(result.valid).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should validate legacy account number', () => {
      const result = ValidationService.validateAccountNumberLegacy('1234567890');
      expect(result.valid).toBe(true);
      expect(result.errors).toBeDefined();
      expect(result.errors.length).toBe(0);
    });

    it('should validate legacy institution', () => {
      const result = ValidationService.validateInstitutionLegacy('GTBank');
      expect(result.valid).toBe(true);
      expect(result.errors).toBeDefined();
      expect(result.errors.length).toBe(0);
    });

    it('should validate legacy beneficiary', () => {
      const result = ValidationService.validateBeneficiaryLegacy({
        institution: 'GTBank',
        accountIdentifier: '1234567890',
        currency: 'NGN',
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toBeDefined();
      expect(result.errors.length).toBe(0);
      expect(result.data).toBeDefined();
    });
  });

  describe('Request Validation', () => {
    it('should validate quote request', () => {
      const result = ValidationService.validateQuoteRequest({
        amount: '100',
        currency: 'NGN',
        feeMethod: 'USDC',
      });
      expect(result.valid).toBe(true);
    });

    it('should validate offramp request', () => {
      const result = ValidationService.validateOfframpRequest({
        amount: '100',
        currency: 'NGN',
        beneficiary: {
          institution: 'GTBank',
          accountIdentifier: '1234567890',
          currency: 'NGN',
        },
        feeMethod: 'USDC',
        fromAddress: 'GCFX3NWMYLTOVSC3XVFVRID47IQ5LCLF34CM4A4ADIXZXWQGORNRIE25',
        toAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37AA96045',
      });
      expect(result.valid).toBe(true);
    });

    it('should validate legacy quote request', () => {
      const result = ValidationService.validateQuoteRequestLegacy({
        amount: '100',
        currency: 'NGN',
        feeMethod: 'USDC',
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toBeDefined();
      expect(result.errors.length).toBe(0);
      expect(result.data).toBeDefined();
    });
  });

  describe('Unified Validation Tests', () => {
    it('should use validateWithSchema for all validations', () => {
      const amountResult = ValidationService.validateAmount('100');
      expect(amountResult.valid).toBe(true);

      const addressResult = ValidationService.validateStellarAddress(
        'GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEF',
      );
      expect(addressResult.valid).toBe(true);

      const currencyResult = ValidationService.validateCurrencyCode('NGN');
      expect(currencyResult.valid).toBe(true);
    });

    it('should maintain backward compatibility with ValidationResult', () => {
      const amountLegacyResult = ValidationService.validateAmountLegacy('100');
      expect(amountLegacyResult).toHaveProperty('valid', true);
      expect(amountLegacyResult).toHaveProperty('errors');
    });

    it('should properly format errors from Zod', () => {
      const invalidResult = ValidationService.validateAmount('abc');
      expect(invalidResult.valid).toBe(false);
      expect(Array.isArray(invalidResult.errors)).toBe(true);
      if (invalidResult.errors && invalidResult.errors.length > 0) {
        expect(invalidResult.errors[0]).toHaveProperty('field');
        expect(invalidResult.errors[0]).toHaveProperty('message');
      }
    });
  });
});
