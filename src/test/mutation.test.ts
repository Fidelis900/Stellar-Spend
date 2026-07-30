/**
 * Issue #833 — Strengthened Mutation Tests
 *
 * The previous version of this file only tested self-contained local helper
 * functions that are never mutated by Stryker. All tests have been rewritten
 * to target real library modules under src/lib/ — the exact files that Stryker
 * mutates — so surviving mutants are caught.
 *
 * Principles applied:
 *  - Use exact value assertions (toBe, toEqual) instead of generic truthiness.
 *  - Assert both the "true branch" and the "false branch" of every conditional.
 *  - Assert precise numeric results — not just "> 0".
 *  - Cover boundary values: exactly-at-limit, one-below, one-above.
 */

import { describe, it, expect, beforeEach } from 'vitest';

// ── Real library imports ───────────────────────────────────────────────────
import {
  calculateBridgeFee,
  calculateNetworkFee,
  calculatePaycrestFee,
  calculateTotalFees,
  calculateAmountAfterFees,
} from '@/lib/fee-calculation';

import { ErrorType, ERROR_STATUS_CODES, ApiError } from '@/lib/error-types';

import { mapPaycrestStatus } from '@/lib/offramp';

import { KYCLimitService } from '@/lib/kyc-limits';

// ─────────────────────────────────────────────────────────────────────────────
// 1. Fee Calculation — src/lib/fee-calculation.ts
// ─────────────────────────────────────────────────────────────────────────────

describe('fee-calculation: calculateBridgeFee', () => {
  it('native method always returns exactly "0"', () => {
    expect(calculateBridgeFee('100', 'native')).toBe('0');
    expect(calculateBridgeFee('1', 'native')).toBe('0');
    expect(calculateBridgeFee('9999', 'native')).toBe('0');
  });

  it('stablecoin method returns 0.5% of amount (6 decimal places)', () => {
    // 100 * 0.5 / 100 = 0.5 → "0.500000"
    expect(calculateBridgeFee('100', 'stablecoin')).toBe('0.500000');
  });

  it('stablecoin fee scales linearly with amount', () => {
    expect(calculateBridgeFee('200', 'stablecoin')).toBe('1.000000');
    expect(calculateBridgeFee('1000', 'stablecoin')).toBe('5.000000');
  });

  it('calculates correct fee for small amount', () => {
    // 10 * 0.5 / 100 = 0.05 → "0.050000"
    expect(calculateBridgeFee('10', 'stablecoin')).toBe('0.050000');
  });

  it('throws for zero amount', () => {
    expect(() => calculateBridgeFee('0', 'stablecoin')).toThrow('Invalid amount');
  });

  it('throws for negative amount', () => {
    expect(() => calculateBridgeFee('-1', 'stablecoin')).toThrow('Invalid amount');
  });

  it('throws for non-numeric string', () => {
    expect(() => calculateBridgeFee('abc', 'stablecoin')).toThrow('Invalid amount');
  });

  it('throws for empty string', () => {
    expect(() => calculateBridgeFee('', 'stablecoin')).toThrow('Invalid amount');
  });
});

describe('fee-calculation: calculateNetworkFee', () => {
  it('stablecoin method returns exactly "0"', () => {
    expect(calculateNetworkFee('stablecoin')).toBe('0');
  });

  it('native method returns the XLM base fee string', () => {
    const fee = calculateNetworkFee('native');
    expect(fee).toBe('0.00001');
    expect(typeof fee).toBe('string');
  });

  it('native and stablecoin fees are distinct values', () => {
    expect(calculateNetworkFee('native')).not.toBe(calculateNetworkFee('stablecoin'));
  });
});

describe('fee-calculation: calculatePaycrestFee', () => {
  it('calculates 1% of receive amount', () => {
    // 100 * 1 / 100 = 1.00
    expect(calculatePaycrestFee('100')).toBe('1.00');
  });

  it('fee doubles when amount doubles', () => {
    const fee100 = parseFloat(calculatePaycrestFee('100'));
    const fee200 = parseFloat(calculatePaycrestFee('200'));
    expect(fee200).toBe(fee100 * 2);
  });

  it('returns "0" for zero amount', () => {
    expect(calculatePaycrestFee('0')).toBe('0');
  });

  it('handles large amounts correctly', () => {
    // 158202 * 1% = 1582.02
    expect(calculatePaycrestFee('158202')).toBe('1582.02');
  });
});

describe('fee-calculation: calculateTotalFees', () => {
  it('sums all fee components accurately', () => {
    // 0.5 + 0.00001 + 1.00 = 1.500010
    const total = calculateTotalFees('0.5', '0.00001', '1.00', 'NGN');
    expect(parseFloat(total)).toBeCloseTo(1.50001, 5);
  });

  it('with no network fee and no paycrest fee', () => {
    const total = calculateTotalFees('0.5', '0', '0', 'NGN');
    expect(parseFloat(total)).toBeCloseTo(0.5, 6);
  });

  it('optional contractResourceFee is included in sum', () => {
    const without = parseFloat(calculateTotalFees('0.5', '0', '0', 'NGN'));
    const withContract = parseFloat(calculateTotalFees('0.5', '0', '0', 'NGN', '2.0'));
    expect(withContract).toBe(without + 2.0);
  });

  it('all zeros gives "0.000000"', () => {
    const total = calculateTotalFees('0', '0', '0', 'NGN');
    expect(parseFloat(total)).toBe(0);
  });
});

describe('fee-calculation: calculateAmountAfterFees', () => {
  it('subtracts fee from amount', () => {
    const result = calculateAmountAfterFees('100', '0.5');
    expect(parseFloat(result)).toBeCloseTo(99.5, 5);
  });

  it('returns "0" when fee equals amount', () => {
    const result = calculateAmountAfterFees('100', '100');
    expect(result).toBe('0');
  });

  it('returns "0" when fee exceeds amount', () => {
    const result = calculateAmountAfterFees('10', '20');
    expect(result).toBe('0');
  });

  it('result is strictly less than the original amount for any positive fee', () => {
    const result = parseFloat(calculateAmountAfterFees('100', '1'));
    expect(result).toBeLessThan(100);
    expect(result).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Error Types — src/lib/error-types.ts
// ─────────────────────────────────────────────────────────────────────────────

describe('error-types: ErrorType enum values', () => {
  it('VALIDATION maps to "validation_error"', () => {
    expect(ErrorType.VALIDATION).toBe('validation_error');
  });

  it('NOT_FOUND maps to "not_found"', () => {
    expect(ErrorType.NOT_FOUND).toBe('not_found');
  });

  it('UNAUTHORIZED maps to "unauthorized"', () => {
    expect(ErrorType.UNAUTHORIZED).toBe('unauthorized');
  });

  it('RATE_LIMIT maps to "rate_limit_exceeded"', () => {
    expect(ErrorType.RATE_LIMIT).toBe('rate_limit_exceeded');
  });

  it('SERVER_ERROR maps to "server_error"', () => {
    expect(ErrorType.SERVER_ERROR).toBe('server_error');
  });

  it('EXTERNAL_SERVICE maps to "external_service_error"', () => {
    expect(ErrorType.EXTERNAL_SERVICE).toBe('external_service_error');
  });
});

describe('error-types: ERROR_STATUS_CODES', () => {
  it('VALIDATION → 400', () => {
    expect(ERROR_STATUS_CODES[ErrorType.VALIDATION]).toBe(400);
  });

  it('NOT_FOUND → 404', () => {
    expect(ERROR_STATUS_CODES[ErrorType.NOT_FOUND]).toBe(404);
  });

  it('UNAUTHORIZED → 401', () => {
    expect(ERROR_STATUS_CODES[ErrorType.UNAUTHORIZED]).toBe(401);
  });

  it('FORBIDDEN → 403', () => {
    expect(ERROR_STATUS_CODES[ErrorType.FORBIDDEN]).toBe(403);
  });

  it('CONFLICT → 409', () => {
    expect(ERROR_STATUS_CODES[ErrorType.CONFLICT]).toBe(409);
  });

  it('RATE_LIMIT → 429', () => {
    expect(ERROR_STATUS_CODES[ErrorType.RATE_LIMIT]).toBe(429);
  });

  it('SERVER_ERROR → 500', () => {
    expect(ERROR_STATUS_CODES[ErrorType.SERVER_ERROR]).toBe(500);
  });

  it('EXTERNAL_SERVICE → 502', () => {
    expect(ERROR_STATUS_CODES[ErrorType.EXTERNAL_SERVICE]).toBe(502);
  });

  it('no two error types share the same HTTP status code', () => {
    const codes = Object.values(ERROR_STATUS_CODES);
    const unique = new Set(codes);
    expect(unique.size).toBe(codes.length);
  });
});

describe('error-types: ApiError construction', () => {
  it('stores errorType exactly', () => {
    const err = new ApiError(ErrorType.VALIDATION, 'bad input');
    expect(err.errorType).toBe(ErrorType.VALIDATION);
    expect(err.errorType).toBe('validation_error');
  });

  it('stores message exactly', () => {
    const err = new ApiError(ErrorType.NOT_FOUND, 'order not found');
    expect(err.message).toBe('order not found');
  });

  it('is an instance of Error', () => {
    const err = new ApiError(ErrorType.SERVER_ERROR, 'crash');
    expect(err instanceof Error).toBe(true);
  });

  it('is an instance of ApiError', () => {
    const err = new ApiError(ErrorType.SERVER_ERROR, 'crash');
    expect(err instanceof ApiError).toBe(true);
  });

  it('different ApiErrors have distinct types when constructed differently', () => {
    const a = new ApiError(ErrorType.VALIDATION, 'v');
    const b = new ApiError(ErrorType.NOT_FOUND, 'n');
    expect(a.errorType).not.toBe(b.errorType);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Paycrest Status Mapping — src/lib/offramp/adapters/paycrest-adapter.ts
// ─────────────────────────────────────────────────────────────────────────────

describe('mapPaycrestStatus', () => {
  it('maps payment_order.pending to "pending"', () => {
    expect(mapPaycrestStatus('payment_order.pending')).toBe('pending');
  });

  it('maps payment_order.validated to "validated"', () => {
    expect(mapPaycrestStatus('payment_order.validated')).toBe('validated');
  });

  it('maps payment_order.settled to "settled"', () => {
    expect(mapPaycrestStatus('payment_order.settled')).toBe('settled');
  });

  it('maps payment_order.refunded to "refunded"', () => {
    expect(mapPaycrestStatus('payment_order.refunded')).toBe('refunded');
  });

  it('maps payment_order.expired to "expired"', () => {
    expect(mapPaycrestStatus('payment_order.expired')).toBe('expired');
  });

  it('returns "pending" for unknown status (not empty string)', () => {
    const result = mapPaycrestStatus('unknown_status');
    expect(result).toBe('pending');
    expect(typeof result).toBe('string');
  });

  it('returns "pending" for empty string', () => {
    expect(mapPaycrestStatus('')).toBe('pending');
  });

  it('settled and refunded are distinct statuses', () => {
    expect(mapPaycrestStatus('payment_order.settled')).not.toBe(
      mapPaycrestStatus('payment_order.refunded'),
    );
  });

  it('pending and expired are distinct statuses', () => {
    expect(mapPaycrestStatus('payment_order.pending')).not.toBe(
      mapPaycrestStatus('payment_order.expired'),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. KYC Limits — src/lib/kyc-limits.ts
// ─────────────────────────────────────────────────────────────────────────────

function mockLocalStorage() {
  let store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (i: number) => Object.keys(store)[i] ?? null,
  };
}

describe('KYCLimitService: tier transaction limits', () => {
  const uid = 'mut_test_user';

  beforeEach(() => {
    (globalThis as Record<string, unknown>).localStorage = mockLocalStorage();
    KYCLimitService.initializeUserLimits(uid, 'tier1');
  });

  it('tier1 permits transaction at exactly the tier limit (500)', () => {
    const result = KYCLimitService.canTransact(uid, 500);
    expect(result.allowed).toBe(true);
  });

  it('tier1 blocks transaction one unit above the tier limit (501)', () => {
    const result = KYCLimitService.canTransact(uid, 501);
    expect(result.allowed).toBe(false);
  });

  it('tier1 allows smallest positive transaction', () => {
    const result = KYCLimitService.canTransact(uid, 1);
    expect(result.allowed).toBe(true);
  });

  it('allowed is boolean true — not just truthy', () => {
    const result = KYCLimitService.canTransact(uid, 100);
    expect(result.allowed).toBe(true); // strict toBe, not toBeTruthy
  });

  it('blocked result has a non-empty reason string', () => {
    const result = KYCLimitService.canTransact(uid, 9999);
    expect(result.allowed).toBe(false);
    expect(typeof result.reason).toBe('string');
    expect((result.reason as string).length).toBeGreaterThan(0);
  });

  it('KYC submission changes status to pending', () => {
    KYCLimitService.submitKYC(uid, 'passport', 'PP999888');
    const kyc = KYCLimitService.getKYC(uid);
    expect(kyc?.status).toBe('pending');
    expect(kyc?.status).not.toBe('unverified');
    expect(kyc?.status).not.toBe('verified');
    expect(kyc?.status).not.toBe('rejected');
  });

  it('verifyKYC transitions status from pending to verified', () => {
    KYCLimitService.submitKYC(uid, 'passport', 'PP999888');
    KYCLimitService.verifyKYC(uid);
    const kyc = KYCLimitService.getKYC(uid);
    expect(kyc?.status).toBe('verified');
  });

  it('rejectKYC transitions status to rejected with reason', () => {
    KYCLimitService.submitKYC(uid, 'license', 'DL123456');
    KYCLimitService.rejectKYC(uid, 'Document unreadable');
    const kyc = KYCLimitService.getKYC(uid);
    expect(kyc?.status).toBe('rejected');
    expect(kyc?.rejectionReason).toBe('Document unreadable');
  });

  it('rejectKYC reason is stored exactly as provided', () => {
    KYCLimitService.submitKYC(uid, 'passport', 'PP000111');
    KYCLimitService.rejectKYC(uid, 'Address mismatch');
    const kyc = KYCLimitService.getKYC(uid);
    expect(kyc?.rejectionReason).toBe('Address mismatch');
    expect(kyc?.rejectionReason).not.toBe('Document unreadable');
  });

  it('after re-submission following rejection, status returns to pending', () => {
    KYCLimitService.submitKYC(uid, 'passport', 'PP000111');
    KYCLimitService.rejectKYC(uid, 'Blurry photo');
    // Re-submit
    KYCLimitService.submitKYC(uid, 'passport', 'PP000222');
    const kyc = KYCLimitService.getKYC(uid);
    expect(kyc?.status).toBe('pending');
  });

  it('verified user gets upgraded tier (tier2 after verification)', () => {
    KYCLimitService.submitKYC(uid, 'passport', 'PP999888');
    KYCLimitService.verifyKYC(uid);
    const limits = KYCLimitService.getUserLimits(uid);
    expect(limits?.tier).toBe('tier2');
    expect(limits?.tier).not.toBe('tier1');
  });
});
