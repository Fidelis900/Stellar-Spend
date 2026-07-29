import { getActiveCurrencies, getCurrencyConfig, CurrencyConfig } from './currencies';
import type { LimitTier } from './kyc-limits';

export type BankFieldType = 'account' | 'routing' | 'iban';

export interface CorridorValidator {
  fields: {
    account?: { pattern?: string; minLength?: number; maxLength?: number };
    routing?: { pattern?: string; length?: number; checksum?: boolean };
    iban?: { enabled: boolean };
  };
}

export interface ProviderSupport {
  name: string;
  supported: boolean;
  notes?: string;
}

export interface CorridorKycDefaults {
  /** Initial tier granted after document verification */
  verificationTier: LimitTier;
  /** Tier-specific limits that override the global defaults */
  tierOverrides?: Partial<
    Record<LimitTier, { dailyLimit: number; monthlyLimit: number; transactionLimit: number }>
  >;
}

export interface InstitutionInfo {
  id: string;
  name: string;
  code: string;
  type: 'bank' | 'mobile_money' | 'fintech';
}

export interface CorridorDefinition {
  currency: string;
  country: string;
  displayName: string;
  active: boolean;
  validators: CorridorValidator;
  institutions: InstitutionInfo[];
  kycDefaults: CorridorKycDefaults;
  providers: ProviderSupport[];
  metadata?: Record<string, unknown>;
}

const CORRIDOR_CONFIG: Record<string, CorridorDefinition> = {
  NGN: {
    currency: 'NGN',
    country: 'NG',
    displayName: 'Nigeria — Naira',
    active: true,
    validators: {
      fields: {
        account: { pattern: '^\\d{10}$', minLength: 10, maxLength: 10 },
        iban: { enabled: false },
      },
    },
    institutions: [
      { id: 'access-bank', name: 'Access Bank', code: '044', type: 'bank' },
      { id: 'gtbank', name: 'Guaranty Trust Bank', code: '058', type: 'bank' },
      { id: 'first-bank', name: 'First Bank of Nigeria', code: '011', type: 'bank' },
      { id: 'zenith', name: 'Zenith Bank', code: '057', type: 'bank' },
      { id: 'uba', name: 'United Bank for Africa', code: '033', type: 'bank' },
      { id: 'opay', name: 'OPay', code: '999992', type: 'mobile_money' },
      { id: 'palmpay', name: 'PalmPay', code: '999993', type: 'mobile_money' },
    ],
    kycDefaults: {
      verificationTier: 'tier2',
      tierOverrides: {
        tier2: { dailyLimit: 10000, monthlyLimit: 100000, transactionLimit: 5000 },
      },
    },
    providers: [{ name: 'paycrest', supported: true }],
  },
  KES: {
    currency: 'KES',
    country: 'KE',
    displayName: 'Kenya — Shilling',
    active: true,
    validators: {
      fields: {
        account: { minLength: 6, maxLength: 13 },
        iban: { enabled: false },
      },
    },
    institutions: [
      { id: 'equity-ke', name: 'Equity Bank', code: 'EQTLKEN', type: 'bank' },
      { id: 'kcb-ke', name: 'KCB Bank', code: 'KCBLKENX', type: 'bank' },
      { id: 'coop-ke', name: 'Co-operative Bank', code: 'COOPKENA', type: 'bank' },
      { id: 'mpesa', name: 'M-Pesa', code: 'MPESA', type: 'mobile_money' },
    ],
    kycDefaults: {
      verificationTier: 'tier2',
    },
    providers: [{ name: 'paycrest', supported: true }],
  },
  GHS: {
    currency: 'GHS',
    country: 'GH',
    displayName: 'Ghana — Cedi',
    active: true,
    validators: {
      fields: {
        account: { minLength: 6, maxLength: 16 },
        iban: { enabled: false },
      },
    },
    institutions: [
      { id: 'access-gh', name: 'Access Bank Ghana', code: 'ACCESSGH', type: 'bank' },
      { id: 'ecobank-gh', name: 'Ecobank Ghana', code: 'ECOBDGHA', type: 'bank' },
      { id: 'mtn-momo', name: 'MTN Mobile Money', code: 'MTNMOMO', type: 'mobile_money' },
    ],
    kycDefaults: {
      verificationTier: 'tier2',
    },
    providers: [{ name: 'paycrest', supported: true }],
  },
  ZAR: {
    currency: 'ZAR',
    country: 'ZA',
    displayName: 'South Africa — Rand',
    active: true,
    validators: {
      fields: {
        account: { minLength: 6, maxLength: 12 },
        iban: { enabled: false },
      },
    },
    institutions: [
      { id: 'fnb', name: 'First National Bank', code: 'FIRNZAJJ', type: 'bank' },
      { id: 'standard-bank', name: 'Standard Bank', code: 'SBZAZAJJ', type: 'bank' },
      { id: 'nedbank', name: 'Nedbank', code: 'NEDSZAJJ', type: 'bank' },
    ],
    kycDefaults: {
      verificationTier: 'tier2',
    },
    providers: [{ name: 'paycrest', supported: true }],
  },
  UGX: {
    currency: 'UGX',
    country: 'UG',
    displayName: 'Uganda — Shilling',
    active: true,
    validators: {
      fields: {
        account: { minLength: 6, maxLength: 13 },
        iban: { enabled: false },
      },
    },
    institutions: [
      { id: 'stanbic-ug', name: 'Stanbic Bank Uganda', code: 'SBICUGX', type: 'bank' },
      { id: 'centenary-ug', name: 'Centenary Bank', code: 'CERBUGX', type: 'bank' },
    ],
    kycDefaults: {
      verificationTier: 'tier2',
    },
    providers: [{ name: 'paycrest', supported: true }],
  },
  TZS: {
    currency: 'TZS',
    country: 'TZ',
    displayName: 'Tanzania — Shilling',
    active: true,
    validators: {
      fields: {
        account: { minLength: 6, maxLength: 13 },
        iban: { enabled: false },
      },
    },
    institutions: [
      { id: 'crb-tz', name: 'CRDB Bank', code: 'CORUTZTZ', type: 'bank' },
      { id: 'nmb-tz', name: 'NMB Bank', code: 'NMBKTZTZ', type: 'bank' },
    ],
    kycDefaults: {
      verificationTier: 'tier2',
    },
    providers: [{ name: 'paycrest', supported: true }],
  },
  XOF: {
    currency: 'XOF',
    country: 'SN',
    displayName: 'West African CFA Franc',
    active: true,
    validators: {
      fields: {
        account: { minLength: 5, maxLength: 20 },
        iban: { enabled: true },
      },
    },
    institutions: [
      { id: 'ecobank-sn', name: 'Ecobank Senegal', code: 'ECOCSNDA', type: 'bank' },
      { id: 'sgb-sn', name: 'Societe Generale Senegal', code: 'SGBSSNDA', type: 'bank' },
    ],
    kycDefaults: {
      verificationTier: 'tier2',
    },
    providers: [{ name: 'paycrest', supported: true }],
  },
  MAD: {
    currency: 'MAD',
    country: 'MA',
    displayName: 'Morocco — Dirham',
    active: true,
    validators: {
      fields: {
        account: { minLength: 5, maxLength: 24 },
        iban: { enabled: true },
      },
    },
    institutions: [
      { id: 'attijariwafa', name: 'Attijariwafa Bank', code: 'BCMAMAMC', type: 'bank' },
      { id: 'bce-ma', name: 'BCE Bank', code: 'BCEMMAMC', type: 'bank' },
    ],
    kycDefaults: {
      verificationTier: 'tier2',
    },
    providers: [{ name: 'paycrest', supported: true }],
  },
  EGP: {
    currency: 'EGP',
    country: 'EG',
    displayName: 'Egypt — Pound',
    active: true,
    validators: {
      fields: {
        account: { minLength: 5, maxLength: 20 },
        iban: { enabled: true },
      },
    },
    institutions: [
      { id: 'nbe-eg', name: 'National Bank of Egypt', code: 'NBEGEGCX', type: 'bank' },
      { id: 'cib-eg', name: 'CIB Egypt', code: 'CIEHEGCX', type: 'bank' },
    ],
    kycDefaults: {
      verificationTier: 'tier2',
    },
    providers: [{ name: 'paycrest', supported: true }],
  },
  BRL: {
    currency: 'BRL',
    country: 'BR',
    displayName: 'Brazil — Real',
    active: true,
    validators: {
      fields: {
        account: { minLength: 5, maxLength: 12 },
        routing: { length: 4, checksum: false },
        iban: { enabled: false },
      },
    },
    institutions: [
      { id: 'itau', name: 'Itaú Unibanco', code: '341', type: 'bank' },
      { id: 'bradesco', name: 'Bradesco', code: '237', type: 'bank' },
      { id: 'nubank', name: 'Nubank', code: '260', type: 'fintech' },
    ],
    kycDefaults: {
      verificationTier: 'tier2',
    },
    providers: [{ name: 'paycrest', supported: true }],
  },
  MXN: {
    currency: 'MXN',
    country: 'MX',
    displayName: 'Mexico — Peso',
    active: true,
    validators: {
      fields: {
        account: { minLength: 10, maxLength: 18 },
        iban: { enabled: false },
      },
    },
    institutions: [
      { id: 'bbva-mx', name: 'BBVA Mexico', code: 'BBVAMXMM', type: 'bank' },
      { id: 'banamex', name: 'Citibanamex', code: 'BAMXMXMM', type: 'bank' },
      { id: 'coppel', name: 'Coppel', code: 'COPPEL', type: 'fintech' },
    ],
    kycDefaults: {
      verificationTier: 'tier2',
    },
    providers: [{ name: 'paycrest', supported: true }],
  },
  AED: {
    currency: 'AED',
    country: 'AE',
    displayName: 'UAE — Dirham',
    active: true,
    validators: {
      fields: {
        account: { minLength: 5, maxLength: 20 },
        iban: { enabled: true },
      },
    },
    institutions: [
      { id: 'adcb', name: 'Abu Dhabi Commercial Bank', code: 'ADCBAEAA', type: 'bank' },
      { id: 'emirates-nbd', name: 'Emirates NBD', code: 'EBILAEAD', type: 'bank' },
      { id: 'mashreq', name: 'Mashreq Bank', code: 'BOMLAEAD', type: 'bank' },
    ],
    kycDefaults: {
      verificationTier: 'tier2',
    },
    providers: [{ name: 'paycrest', supported: true }],
  },
  SAR: {
    currency: 'SAR',
    country: 'SA',
    displayName: 'Saudi Arabia — Riyal',
    active: true,
    validators: {
      fields: {
        account: { minLength: 8, maxLength: 20 },
        iban: { enabled: true },
      },
    },
    institutions: [
      { id: 'alrajhi', name: 'Al Rajhi Bank', code: 'RJHISARI', type: 'bank' },
      { id: 'samba', name: 'Samba Financial Group', code: 'SAMBSARI', type: 'bank' },
    ],
    kycDefaults: {
      verificationTier: 'tier2',
    },
    providers: [{ name: 'paycrest', supported: true }],
  },
  INR: {
    currency: 'INR',
    country: 'IN',
    displayName: 'India — Rupee',
    active: true,
    validators: {
      fields: {
        account: { minLength: 9, maxLength: 18 },
        routing: { pattern: '^[A-Z]{4}0[A-Z0-9]{6}$', length: 11, checksum: false },
        iban: { enabled: false },
      },
    },
    institutions: [
      { id: 'hdfc', name: 'HDFC Bank', code: 'HDFCINBB', type: 'bank' },
      { id: 'icici', name: 'ICICI Bank', code: 'ICICINBB', type: 'bank' },
      { id: 'sbi', name: 'State Bank of India', code: 'SBININBB', type: 'bank' },
      { id: 'paytm', name: 'Paytm Payments Bank', code: 'PYTMINBB', type: 'fintech' },
    ],
    kycDefaults: {
      verificationTier: 'tier2',
    },
    providers: [{ name: 'paycrest', supported: true }],
  },
  PHP: {
    currency: 'PHP',
    country: 'PH',
    displayName: 'Philippines — Peso',
    active: true,
    validators: {
      fields: {
        account: { minLength: 10, maxLength: 16 },
        iban: { enabled: false },
      },
    },
    institutions: [
      { id: 'bpi', name: 'Bank of the Philippine Islands', code: 'BPIPHMM', type: 'bank' },
      { id: 'bdo', name: 'Banco de Oro', code: 'BNORPHMM', type: 'bank' },
      { id: 'gcash', name: 'GCash', code: 'GCASH', type: 'mobile_money' },
    ],
    kycDefaults: {
      verificationTier: 'tier2',
    },
    providers: [{ name: 'paycrest', supported: true }],
  },
};

export function getCorridorConfig(currency: string): CorridorDefinition | undefined {
  return CORRIDOR_CONFIG[currency.toUpperCase()];
}

export function getActiveCorridors(): CorridorDefinition[] {
  return Object.values(CORRIDOR_CONFIG).filter((c) => c.active);
}

export function getCorridorInstitutions(currency: string): InstitutionInfo[] {
  const corridor = getCorridorConfig(currency);
  return corridor?.institutions ?? [];
}

export function getCorridorValidators(currency: string): CorridorValidator | undefined {
  return getCorridorConfig(currency)?.validators;
}

export function getCorridorKycDefaults(currency: string): CorridorKycDefaults | undefined {
  return getCorridorConfig(currency)?.kycDefaults;
}

export function isCorridorProviderSupported(currency: string, provider: string): boolean {
  const corridor = getCorridorConfig(currency);
  if (!corridor) return false;
  return corridor.providers.some((p) => p.name === provider && p.supported);
}

export function getCorridorProviderList(currency: string): ProviderSupport[] {
  return getCorridorConfig(currency)?.providers ?? [];
}

export interface CorridorValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateCorridorConfig(currency: string): CorridorValidationResult {
  const result: CorridorValidationResult = { valid: true, errors: [], warnings: [] };
  const config = getCorridorConfig(currency);

  if (!config) {
    result.valid = false;
    result.errors.push(`No corridor configuration found for ${currency}`);
    return result;
  }

  if (!config.active) {
    result.warnings.push(`Corridor ${currency} is marked inactive`);
  }

  const hasSupportedProvider = config.providers.some((p) => p.supported);
  if (!hasSupportedProvider) {
    result.valid = false;
    result.errors.push(`No supported provider for corridor ${currency}`);
  }

  if (config.institutions.length === 0) {
    result.warnings.push(`No institutions configured for ${currency}`);
  }

  if (config.validators.fields.account) {
    const a = config.validators.fields.account;
    if (a.minLength && a.maxLength && a.minLength > a.maxLength) {
      result.errors.push(
        `Account validators: minLength (${a.minLength}) > maxLength (${a.maxLength})`,
      );
      result.valid = false;
    }
  }

  if (config.kycDefaults.tierOverrides) {
    for (const [tier, overrides] of Object.entries(config.kycDefaults.tierOverrides)) {
      if (overrides) {
        if (overrides.transactionLimit && overrides.transactionLimit > overrides.dailyLimit) {
          result.warnings.push(`KYC override for ${tier}: transactionLimit exceeds dailyLimit`);
        }
      }
    }
  }

  return result;
}

export interface CorridorValidationSummary extends CorridorValidationResult {
  currency: string;
}

export function validateAllCorridors(): CorridorValidationSummary[] {
  return Object.keys(CORRIDOR_CONFIG).map((currency) => ({
    currency,
    ...validateCorridorConfig(currency),
  }));
}
