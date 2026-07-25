import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { KYCFlowProvider, useKycFlow, KYCFlowState, UserLimits } from '../useKycFlow';

const mockLimits: UserLimits = {
  tier: 'tier1',
  dailyLimit: 1000,
  monthlyLimit: 10000,
  dailyUsed: 500,
  monthlyUsed: 5000,
  limitIncreaseRequests: [],
};

function wrapper({ children }: any) {
  return <KYCFlowProvider>{children}</KYCFlowProvider>;
}

describe('useKycFlow', () => {
  describe('initialization', () => {
    it('starts with initial state', () => {
      const { result } = renderHook(() => useKycFlow(), { wrapper });
      expect(result.current.state.status).toBe('unverified');
      expect(result.current.state.userId).toBe('');
      expect(result.current.state.showKYCForm).toBe(false);
    });

    it('initializes with userId and limits', () => {
      const { result } = renderHook(() => useKycFlow(), { wrapper });
      act(() => {
        result.current.initialize('user123', mockLimits, 'approved');
      });
      expect(result.current.state.userId).toBe('user123');
      expect(result.current.state.status).toBe('approved');
      expect(result.current.state.limits).toEqual(mockLimits);
    });
  });

  describe('KYC status management', () => {
    it('updates KYC status', () => {
      const { result } = renderHook(() => useKycFlow(), { wrapper });
      act(() => {
        result.current.setKycStatus('pending');
      });
      expect(result.current.state.status).toBe('pending');
    });

    it('transitions through valid status states', () => {
      const { result } = renderHook(() => useKycFlow(), { wrapper });
      act(() => {
        result.current.setKycStatus('pending');
      });
      expect(result.current.state.status).toBe('pending');

      act(() => {
        result.current.setKycStatus('approved');
      });
      expect(result.current.state.status).toBe('approved');
    });
  });

  describe('KYC form management', () => {
    it('toggles KYC form visibility', () => {
      const { result } = renderHook(() => useKycFlow(), { wrapper });
      expect(result.current.state.showKYCForm).toBe(false);

      act(() => {
        result.current.toggleKycForm();
      });
      expect(result.current.state.showKYCForm).toBe(true);

      act(() => {
        result.current.toggleKycForm();
      });
      expect(result.current.state.showKYCForm).toBe(false);
    });

    it('can set KYC form visibility explicitly', () => {
      const { result } = renderHook(() => useKycFlow(), { wrapper });
      act(() => {
        result.current.toggleKycForm(true);
      });
      expect(result.current.state.showKYCForm).toBe(true);

      act(() => {
        result.current.toggleKycForm(false);
      });
      expect(result.current.state.showKYCForm).toBe(false);
    });

    it('updates form data fields', () => {
      const { result } = renderHook(() => useKycFlow(), { wrapper });
      act(() => {
        result.current.updateFormField({ documentType: 'license', documentId: 'ABC123' });
      });
      expect(result.current.state.formData.documentType).toBe('license');
      expect(result.current.state.formData.documentId).toBe('ABC123');
    });

    it('partially updates form data', () => {
      const { result } = renderHook(() => useKycFlow(), { wrapper });
      act(() => {
        result.current.updateFormField({ documentType: 'id' });
      });
      expect(result.current.state.formData.documentType).toBe('id');
      expect(result.current.state.formData.documentId).toBe('');
    });

    it('resets form to initial state', () => {
      const { result } = renderHook(() => useKycFlow(), { wrapper });
      act(() => {
        result.current.toggleKycForm(true);
        result.current.updateFormField({ documentId: 'ABC123' });
      });
      expect(result.current.state.showKYCForm).toBe(true);
      expect(result.current.state.formData.documentId).toBe('ABC123');

      act(() => {
        result.current.resetForm();
      });
      expect(result.current.state.showKYCForm).toBe(false);
      expect(result.current.state.formData.documentId).toBe('');
    });
  });

  describe('limit request management', () => {
    it('toggles limit request visibility', () => {
      const { result } = renderHook(() => useKycFlow(), { wrapper });
      expect(result.current.state.showLimitRequest).toBe(false);

      act(() => {
        result.current.toggleLimitRequest();
      });
      expect(result.current.state.showLimitRequest).toBe(true);
    });

    it('can set limit request visibility explicitly', () => {
      const { result } = renderHook(() => useKycFlow(), { wrapper });
      act(() => {
        result.current.toggleLimitRequest(true);
      });
      expect(result.current.state.showLimitRequest).toBe(true);

      act(() => {
        result.current.toggleLimitRequest(false);
      });
      expect(result.current.state.showLimitRequest).toBe(false);
    });

    it('sets requested tier', () => {
      const { result } = renderHook(() => useKycFlow(), { wrapper });
      act(() => {
        result.current.setRequestedTier('tier3');
      });
      expect(result.current.state.requestedTier).toBe('tier3');
    });
  });

  describe('limits management', () => {
    it('updates limits', () => {
      const { result } = renderHook(() => useKycFlow(), { wrapper });
      act(() => {
        result.current.setLimits(mockLimits);
      });
      expect(result.current.state.limits).toEqual(mockLimits);
    });

    it('provides tier limits', () => {
      const { result } = renderHook(() => useKycFlow(), { wrapper });
      expect(result.current.tierLimits.tier1).toEqual({ daily: 1000, monthly: 10000 });
      expect(result.current.tierLimits.tier2).toEqual({ daily: 5000, monthly: 50000 });
      expect(result.current.tierLimits.tier3).toEqual({ daily: 50000, monthly: 500000 });
    });
  });

  describe('loading and error states', () => {
    it('manages loading state', () => {
      const { result } = renderHook(() => useKycFlow(), { wrapper });
      expect(result.current.state.loading).toBe(false);

      act(() => {
        result.current.setLoading(true);
      });
      expect(result.current.state.loading).toBe(true);

      act(() => {
        result.current.setLoading(false);
      });
      expect(result.current.state.loading).toBe(false);
    });

    it('manages error state', () => {
      const { result } = renderHook(() => useKycFlow(), { wrapper });
      expect(result.current.state.error).toBeNull();

      act(() => {
        result.current.setError('Verification failed');
      });
      expect(result.current.state.error).toBe('Verification failed');

      act(() => {
        result.current.setError(null);
      });
      expect(result.current.state.error).toBeNull();
    });
  });

  describe('flow scenarios', () => {
    it('handles complete KYC submission flow', () => {
      const { result } = renderHook(() => useKycFlow(), { wrapper });

      act(() => {
        result.current.initialize('user123', null, 'unverified');
      });

      act(() => {
        result.current.toggleKycForm(true);
      });
      expect(result.current.state.showKYCForm).toBe(true);

      act(() => {
        result.current.setLoading(true);
        result.current.updateFormField({ documentType: 'passport', documentId: 'ABC123' });
      });
      expect(result.current.state.formData).toEqual({ documentType: 'passport', documentId: 'ABC123' });
      expect(result.current.state.loading).toBe(true);

      act(() => {
        result.current.setLoading(false);
        result.current.setKycStatus('pending');
        result.current.resetForm();
      });
      expect(result.current.state.status).toBe('pending');
      expect(result.current.state.showKYCForm).toBe(false);
    });

    it('handles limit increase request flow', () => {
      const { result } = renderHook(() => useKycFlow(), { wrapper });

      act(() => {
        result.current.initialize('user123', mockLimits, 'approved');
      });

      act(() => {
        result.current.toggleLimitRequest(true);
      });
      expect(result.current.state.showLimitRequest).toBe(true);

      act(() => {
        result.current.setRequestedTier('tier2');
      });
      expect(result.current.state.requestedTier).toBe('tier2');

      act(() => {
        result.current.setLoading(true);
      });
      expect(result.current.state.loading).toBe(true);

      act(() => {
        result.current.setLoading(false);
        result.current.resetForm();
      });
      expect(result.current.state.showLimitRequest).toBe(false);
    });
  });
});
