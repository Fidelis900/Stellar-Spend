'use client';

import { useReducer, useCallback, useContext, createContext, ReactNode } from 'react';

export type KYCStatus = 'unverified' | 'pending' | 'approved' | 'rejected';
export type LimitTier = 'tier1' | 'tier2' | 'tier3';
export type DocumentType = 'passport' | 'license' | 'id';

export interface LimitIncreaseRequest {
  id: string;
  requestedTier: LimitTier;
  status: 'pending' | 'approved' | 'rejected';
}

export interface UserLimits {
  tier: LimitTier;
  dailyLimit: number;
  monthlyLimit: number;
  dailyUsed: number;
  monthlyUsed: number;
  limitIncreaseRequests: LimitIncreaseRequest[];
}

export interface KYCFlowState {
  userId: string;
  status: KYCStatus;
  limits: UserLimits | null;
  showKYCForm: boolean;
  showLimitRequest: boolean;
  formData: {
    documentType: DocumentType;
    documentId: string;
  };
  requestedTier: LimitTier;
  loading: boolean;
  error: string | null;
}

export type KYCFlowAction =
  | { type: 'INITIALIZE'; payload: { userId: string; limits: UserLimits | null; status: KYCStatus } }
  | { type: 'SET_KYC_STATUS'; payload: KYCStatus }
  | { type: 'TOGGLE_KYC_FORM'; payload?: boolean }
  | { type: 'TOGGLE_LIMIT_REQUEST'; payload?: boolean }
  | { type: 'UPDATE_FORM_FIELD'; payload: Partial<KYCFlowState['formData']> }
  | { type: 'SET_REQUESTED_TIER'; payload: LimitTier }
  | { type: 'SET_LIMITS'; payload: UserLimits }
  | { type: 'RESET_FORM' }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null };

const TIER_LIMITS: Record<LimitTier, { daily: number; monthly: number }> = {
  tier1: { daily: 1000, monthly: 10000 },
  tier2: { daily: 5000, monthly: 50000 },
  tier3: { daily: 50000, monthly: 500000 },
};

const initialState: KYCFlowState = {
  userId: '',
  status: 'unverified',
  limits: null,
  showKYCForm: false,
  showLimitRequest: false,
  formData: {
    documentType: 'passport',
    documentId: '',
  },
  requestedTier: 'tier2',
  loading: false,
  error: null,
};

function kycFlowReducer(state: KYCFlowState, action: KYCFlowAction): KYCFlowState {
  switch (action.type) {
    case 'INITIALIZE':
      return {
        ...state,
        userId: action.payload.userId,
        status: action.payload.status,
        limits: action.payload.limits,
      };

    case 'SET_KYC_STATUS':
      return {
        ...state,
        status: action.payload,
      };

    case 'TOGGLE_KYC_FORM':
      return {
        ...state,
        showKYCForm: action.payload !== undefined ? action.payload : !state.showKYCForm,
      };

    case 'TOGGLE_LIMIT_REQUEST':
      return {
        ...state,
        showLimitRequest: action.payload !== undefined ? action.payload : !state.showLimitRequest,
      };

    case 'UPDATE_FORM_FIELD':
      return {
        ...state,
        formData: {
          ...state.formData,
          ...action.payload,
        },
      };

    case 'SET_REQUESTED_TIER':
      return {
        ...state,
        requestedTier: action.payload,
      };

    case 'SET_LIMITS':
      return {
        ...state,
        limits: action.payload,
      };

    case 'RESET_FORM':
      return {
        ...state,
        showKYCForm: false,
        showLimitRequest: false,
        formData: {
          documentType: 'passport',
          documentId: '',
        },
        requestedTier: 'tier2',
        error: null,
      };

    case 'SET_LOADING':
      return {
        ...state,
        loading: action.payload,
      };

    case 'SET_ERROR':
      return {
        ...state,
        error: action.payload,
      };

    default:
      return state;
  }
}

export interface KYCFlowContextType {
  state: KYCFlowState;
  initialize: (userId: string, limits: UserLimits | null, status: KYCStatus) => void;
  setKycStatus: (status: KYCStatus) => void;
  toggleKycForm: (show?: boolean) => void;
  toggleLimitRequest: (show?: boolean) => void;
  updateFormField: (updates: Partial<KYCFlowState['formData']>) => void;
  setRequestedTier: (tier: LimitTier) => void;
  setLimits: (limits: UserLimits) => void;
  resetForm: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  tierLimits: typeof TIER_LIMITS;
}

export const KYCFlowContext = createContext<KYCFlowContextType | undefined>(undefined);

export interface KYCFlowProviderProps {
  children: ReactNode;
}

export function KYCFlowProvider({ children }: KYCFlowProviderProps) {
  const [state, dispatch] = useReducer(kycFlowReducer, initialState);

  const initialize = useCallback((userId: string, limits: UserLimits | null, status: KYCStatus) => {
    dispatch({ type: 'INITIALIZE', payload: { userId, limits, status } });
  }, []);

  const setKycStatus = useCallback((status: KYCStatus) => {
    dispatch({ type: 'SET_KYC_STATUS', payload: status });
  }, []);

  const toggleKycForm = useCallback((show?: boolean) => {
    dispatch({ type: 'TOGGLE_KYC_FORM', payload: show });
  }, []);

  const toggleLimitRequest = useCallback((show?: boolean) => {
    dispatch({ type: 'TOGGLE_LIMIT_REQUEST', payload: show });
  }, []);

  const updateFormField = useCallback((updates: Partial<KYCFlowState['formData']>) => {
    dispatch({ type: 'UPDATE_FORM_FIELD', payload: updates });
  }, []);

  const setRequestedTier = useCallback((tier: LimitTier) => {
    dispatch({ type: 'SET_REQUESTED_TIER', payload: tier });
  }, []);

  const setLimits = useCallback((limits: UserLimits) => {
    dispatch({ type: 'SET_LIMITS', payload: limits });
  }, []);

  const resetForm = useCallback(() => {
    dispatch({ type: 'RESET_FORM' });
  }, []);

  const setLoading = useCallback((loading: boolean) => {
    dispatch({ type: 'SET_LOADING', payload: loading });
  }, []);

  const setError = useCallback((error: string | null) => {
    dispatch({ type: 'SET_ERROR', payload: error });
  }, []);

  const value: KYCFlowContextType = {
    state,
    initialize,
    setKycStatus,
    toggleKycForm,
    toggleLimitRequest,
    updateFormField,
    setRequestedTier,
    setLimits,
    resetForm,
    setLoading,
    setError,
    tierLimits: TIER_LIMITS,
  };

  return <KYCFlowContext.Provider value={value}>{children}</KYCFlowContext.Provider>;
}

export function useKycFlow(): KYCFlowContextType {
  const context = useContext(KYCFlowContext);
  if (!context) {
    throw new Error('useKycFlow must be used within KYCFlowProvider');
  }
  return context;
}
