import { describe, it, expect } from 'vitest';
import {
  getJurisdictionStatus,
  isRestrictedJurisdiction,
  RESTRICTED_JURISDICTIONS,
  WARNING_JURISDICTIONS,
} from './kyc-limits';

describe('getJurisdictionStatus', () => {
  it('flags every restricted jurisdiction as restricted', () => {
    for (const code of RESTRICTED_JURISDICTIONS) {
      expect(getJurisdictionStatus(code)).toBe('restricted');
    }
  });

  it('flags every warning jurisdiction as warning', () => {
    for (const code of WARNING_JURISDICTIONS) {
      expect(getJurisdictionStatus(code)).toBe('warning');
    }
  });

  it('treats an unlisted country as allowed', () => {
    expect(getJurisdictionStatus('NG')).toBe('allowed');
    expect(getJurisdictionStatus('US')).toBe('allowed');
  });

  it('is case-insensitive', () => {
    expect(getJurisdictionStatus('kp')).toBe('restricted');
  });
});

describe('isRestrictedJurisdiction', () => {
  it('is true only for restricted jurisdictions', () => {
    expect(isRestrictedJurisdiction('KP')).toBe(true);
    expect(isRestrictedJurisdiction('RU')).toBe(false); // warning, not restricted
    expect(isRestrictedJurisdiction('NG')).toBe(false);
  });
});
