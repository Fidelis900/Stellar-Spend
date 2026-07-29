import { getDefaultRng, type Rng } from './rng';

export interface Beneficiary {
  institution: string;
  accountIdentifier: string;
  accountName: string;
  currency: string;
}

const INSTITUTIONS: Record<string, string[]> = {
  NGN: ['ACCESS', 'GTBANK', 'ZENITH', 'UBA'],
  KES: ['EQUITY', 'KCB', 'COOPERATIVE'],
  GHS: ['GCB', 'ABSA', 'STANBIC'],
};

const NAMES = ['Alice Okoye', 'Bob Mensah', 'Carol Kamau', 'David Eze', 'Eve Asante'];

let _counter = 0;

export function makeBeneficiary(
  overrides: Partial<Beneficiary> = {},
  rng: Rng = getDefaultRng(),
): Beneficiary {
  const n = ++_counter;
  const currency = overrides.currency ?? 'NGN';
  const institutions = INSTITUTIONS[currency] ?? ['Test Bank'];
  return {
    institution: rng.pick(institutions),
    accountIdentifier: String(1_000_000_000 + n).slice(1), // deterministic 9-digit number
    accountName: rng.pick(NAMES),
    currency,
    ...overrides,
  };
}

export function makeBeneficiaryForCurrency(
  currency: string,
  overrides: Partial<Beneficiary> = {},
  rng?: Rng,
): Beneficiary {
  return makeBeneficiary({ currency, ...overrides }, rng);
}

export function resetBeneficiaryCounter(): void {
  _counter = 0;
}
