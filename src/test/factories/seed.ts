/**
 * Seeding utilities for integration tests.
 *
 * Call `seed(42)` at the top of a describe block to guarantee the same sequence
 * of factory-generated data across every run and across CI environments.
 *
 * Example:
 *   import { seed, seedWith } from '@/test/factories';
 *
 *   beforeEach(() => seed());  // always uses seed=1
 *
 *   // or pass an explicit seed for a specific scenario:
 *   describe('edge case', () => { seed(99); ... });
 */

import { resetDefaultRng } from './rng';
import { resetTransactionCounter } from './transaction.factory';
import { resetBeneficiaryCounter } from './beneficiary.factory';
import { resetUserCounter } from './user.factory';
import { resetMultisigSettlementCounters } from './multisig-settlement.factory';

/**
 * Reset all factory state to a deterministic baseline.
 * @param s  Numeric seed (default 1). Use the same seed to get identical data.
 */
export function seed(s: number = 1): void {
  resetDefaultRng(s);
  resetTransactionCounter();
  resetBeneficiaryCounter();
  resetUserCounter();
  resetMultisigSettlementCounters();
}

/**
 * Convenience alias for use inside describe/beforeEach.
 * Returns the seed value for documentation purposes.
 */
export function seedWith(s: number): number {
  seed(s);
  return s;
}
