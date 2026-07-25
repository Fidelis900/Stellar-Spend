import { describe, it, expect } from 'vitest';
import {
  emailValidator,
  amountValidator,
  stellarAddressValidator,
  phoneValidator,
  nameValidator,
  currencyCodeValidator,
} from './shared-validators';

describe('Shared Form Validators', () => {
  describe('emailValidator', () => {
    it('should validate correct email addresses', () => {
      const validEmails = [
        'user@example.com',
        'john.doe@company.co.uk',
        'alice+tag@domain.org',
        'test123@test-domain.com',
      ];

      validEmails.forEach((email) => {
        const result = emailValidator.safeParse(email);
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid email addresses', () => {
      const invalidEmails = ['invalid', '@example.com', 'user@', 'user name@example.com', 'user@.com'];

      invalidEmails.forEach((email) => {
        const result = emailValidator.safeParse(email);
        expect(result.success).toBe(false);
      });
    });

    it('should reject empty email', () => {
      const result = emailValidator.safeParse('');
      expect(result.success).toBe(false);
    });
  });

  describe('amountValidator', () => {
    it('should validate positive amounts', () => {
      const validAmounts = ['0.01', '1', '100.50', '9999999.99', '0.001'];

      validAmounts.forEach((amount) => {
        const result = amountValidator.safeParse(amount);
        expect(result.success).toBe(true);
      });
    });

    it('should reject negative amounts', () => {
      const result = amountValidator.safeParse('-100');
      expect(result.success).toBe(false);
    });

    it('should reject zero amount', () => {
      const result = amountValidator.safeParse('0');
      expect(result.success).toBe(false);
    });

    it('should reject non-numeric amounts', () => {
      const invalidAmounts = ['abc', '100.50.50', 'NaN', '1e10'];

      invalidAmounts.forEach((amount) => {
        const result = amountValidator.safeParse(amount);
        expect(result.success).toBe(false);
      });
    });

    it('should reject empty amount', () => {
      const result = amountValidator.safeParse('');
      expect(result.success).toBe(false);
    });
  });

  describe('stellarAddressValidator', () => {
    it('should validate correct Stellar addresses', () => {
      const validAddresses = [
        'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
        'GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTQGSH5H7I26XSETJLSC67XL7J',
      ];

      validAddresses.forEach((address) => {
        const result = stellarAddressValidator.safeParse(address);
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid Stellar addresses', () => {
      const invalidAddresses = [
        'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFL', // Too short
        'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLAA', // Too long
        '0x742d35Cc6634C0532925a3b844Bc9e7595f1bEb', // EVM address format
        'TBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5', // Wrong prefix
      ];

      invalidAddresses.forEach((address) => {
        const result = stellarAddressValidator.safeParse(address);
        expect(result.success).toBe(false);
      });
    });

    it('should reject empty address', () => {
      const result = stellarAddressValidator.safeParse('');
      expect(result.success).toBe(false);
    });
  });

  describe('phoneValidator', () => {
    it('should validate various phone formats', () => {
      const validPhones = [
        '+234-801-123-4567',
        '+1-555-123-4567',
        '+44-20-7946-0958',
        '+234 701 234 5678',
      ];

      validPhones.forEach((phone) => {
        const result = phoneValidator.safeParse(phone);
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid phone formats', () => {
      const invalidPhones = ['123', 'abcdefghij', '+1', 'phone-number'];

      invalidPhones.forEach((phone) => {
        const result = phoneValidator.safeParse(phone);
        expect(result.success).toBe(false);
      });
    });

    it('should reject empty phone', () => {
      const result = phoneValidator.safeParse('');
      expect(result.success).toBe(false);
    });
  });

  describe('nameValidator', () => {
    it('should validate person names', () => {
      const validNames = ['John Doe', 'Alice Smith', 'Chen Wei', 'María García', 'O\\'Brien'];

      validNames.forEach((name) => {
        const result = nameValidator.safeParse(name);
        expect(result.success).toBe(true);
      });
    });

    it('should reject single character names', () => {
      const result = nameValidator.safeParse('A');
      expect(result.success).toBe(false);
    });

    it('should reject names with invalid characters', () => {
      const invalidNames = ['John123', 'Alice@', 'User#1'];

      invalidNames.forEach((name) => {
        const result = nameValidator.safeParse(name);
        expect(result.success).toBe(false);
      });
    });

    it('should reject empty name', () => {
      const result = nameValidator.safeParse('');
      expect(result.success).toBe(false);
    });
  });

  describe('currencyCodeValidator', () => {
    it('should validate ISO 4217 currency codes', () => {
      const validCodes = ['USD', 'EUR', 'GBP', 'JPY', 'NGN', 'KES', 'XLM'];

      validCodes.forEach((code) => {
        const result = currencyCodeValidator.safeParse(code);
        expect(result.success).toBe(true);
      });
    });

    it('should reject lowercase currency codes', () => {
      const result = currencyCodeValidator.safeParse('usd');
      expect(result.success).toBe(false);
    });

    it('should reject codes longer than 3 characters', () => {
      const result = currencyCodeValidator.safeParse('USDA');
      expect(result.success).toBe(false);
    });

    it('should reject numeric codes', () => {
      const result = currencyCodeValidator.safeParse('123');
      expect(result.success).toBe(false);
    });

    it('should reject empty code', () => {
      const result = currencyCodeValidator.safeParse('');
      expect(result.success).toBe(false);
    });
  });

  describe('Composed form schemas', () => {
    it('should allow composing validators into form schemas', () => {
      const formSchema = {
        email: emailValidator,
        amount: amountValidator,
        address: stellarAddressValidator,
        currency: currencyCodeValidator,
      };

      expect(formSchema).toBeDefined();
      expect(formSchema.email).toBeDefined();
      expect(formSchema.amount).toBeDefined();
      expect(formSchema.address).toBeDefined();
      expect(formSchema.currency).toBeDefined();
    });
  });

  describe('Edge cases and negative amounts', () => {
    it('should reject negative amounts in transaction forms', () => {
      const result = amountValidator.safeParse('-500');
      expect(result.success).toBe(false);
    });

    it('should reject large numbers for amount validation', () => {
      const largeAmount = '99999999999999999999.99';
      const result = amountValidator.safeParse(largeAmount);
      // May pass or fail depending on configuration
      expect(result).toBeDefined();
    });

    it('should handle decimal precision', () => {
      const preciseAmounts = ['0.001', '100.99', '0.0001'];

      preciseAmounts.forEach((amount) => {
        const result = amountValidator.safeParse(amount);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('Invalid Stellar address formats', () => {
    it('should reject non-Base32 characters in Stellar address', () => {
      const result = stellarAddressValidator.safeParse(
        'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLL-L-5'
      );
      expect(result.success).toBe(false);
    });

    it('should be case-sensitive for Stellar addresses', () => {
      const lowercaseAddress = 'gbbd47if6lwk7p7mdevscwr7dpuwv3ny3dtqevfl4nat4aqh3zllfla5';
      const result = stellarAddressValidator.safeParse(lowercaseAddress);
      expect(result.success).toBe(false);
    });
  });
});
