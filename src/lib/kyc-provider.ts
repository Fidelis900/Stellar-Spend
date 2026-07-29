import type { KYCData } from './kyc-limits';

export type VerificationLevel = 'basic' | 'advanced' | 'enhanced';

export interface VerificationResponse {
  verified: boolean;
  verificationId: string;
  level: VerificationLevel;
  providerName: string;
  verifiedAt: number;
  expiryAt: number | null;
  metadata?: Record<string, unknown>;
}

export interface VerificationError {
  code: string;
  message: string;
  retryable: boolean;
}

export interface KycProviderInterface {
  readonly name: string;

  /** Submit identity data for verification */
  submitVerification(
    userId: string,
    level: VerificationLevel,
    identityData: Record<string, unknown>,
  ): Promise<{ success: boolean; verificationId: string }>;

  /** Check verification status */
  checkStatus(verificationId: string): Promise<VerificationResponse>;

  /** Initiate re-verification when limits change */
  requestReverification(
    userId: string,
    reason: string,
  ): Promise<{ required: boolean; message: string }>;
}

export class SandboxKycProvider implements KycProviderInterface {
  readonly name = 'sandbox';

  private results = new Map<string, VerificationResponse>();

  async submitVerification(
    userId: string,
    level: VerificationLevel,
    _identityData: Record<string, unknown>,
  ): Promise<{ success: boolean; verificationId: string }> {
    const verificationId = `sandbox_${userId}_${level}_${Date.now()}`;
    const now = Date.now();

    const expiryMs: Record<VerificationLevel, number | null> = {
      basic: null,
      advanced: 365 * 24 * 60 * 60 * 1000,
      enhanced: 180 * 24 * 60 * 60 * 1000,
    };

    const response: VerificationResponse = {
      verified: true,
      verificationId,
      level,
      providerName: 'sandbox',
      verifiedAt: now,
      expiryAt: expiryMs[level] ? now + expiryMs[level]! : null,
      metadata: { simulated: true },
    };

    this.results.set(verificationId, response);
    return { success: true, verificationId };
  }

  async checkStatus(verificationId: string): Promise<VerificationResponse> {
    const result = this.results.get(verificationId);
    if (!result) {
      throw new Error(`Verification ${verificationId} not found`);
    }
    return result;
  }

  async requestReverification(
    _userId: string,
    _reason: string,
  ): Promise<{ required: boolean; message: string }> {
    return {
      required: true,
      message: 'Sandbox: re-verification would be required in production',
    };
  }
}

const DEFAULT_PROVIDER: KycProviderInterface = new SandboxKycProvider();

export function getKycProvider(name?: string): KycProviderInterface {
  if (!name || name === 'sandbox') return DEFAULT_PROVIDER;
  throw new Error(`Unknown KYC provider: ${name}`);
}

export const VERIFICATION_LEVEL_MAP: Record<
  VerificationLevel,
  { tier: import('./kyc-limits').LimitTier; label: string }
> = {
  basic: { tier: 'tier1', label: 'Basic - email & phone' },
  advanced: { tier: 'tier2', label: 'Advanced - government ID' },
  enhanced: { tier: 'tier3', label: 'Enhanced - in-person verification' },
};

export function getRequiredVerificationLevel(
  kyc: KYCData | null,
  requestedTier: import('./kyc-limits').LimitTier,
): VerificationLevel {
  if (requestedTier === 'tier1') return 'basic';
  if (requestedTier === 'tier2') return 'advanced';
  return 'enhanced';
}
