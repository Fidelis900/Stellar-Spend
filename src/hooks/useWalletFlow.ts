'use client';

import { useMemo, useState, useCallback } from 'react';
import { buildProgressSteps, STATE_VARIANTS } from '@/data/stellaramp';
import type { WalletFlowState } from '@shared/types/stellaramp';

/**
 * useWalletFlow
 *
 * Manages the UI-related state machine for the wallet connection flow.
 * Returns the current state, progress steps, and UI variant data.
 */
export function useWalletFlow(initialState: WalletFlowState = 'pre_connect') {
  const [state, setState] = useState<WalletFlowState>(initialState);

  // Derive the UI variant based on the current state.
  // STATE_VARIANTS is a static lookup, so we can memoize it.
  const variant = useMemo(() => STATE_VARIANTS[state], [state]);

  // Derive and memoize the progress steps based on the variant.
  // This ensures steps only re-calculates when the variant (and thus the state) changes.
  const steps = useMemo(() => buildProgressSteps(variant), [variant]);

  // State transition helpers for cleaner consumption
  const setPreConnect = useCallback(() => setState('pre_connect'), []);
  const setConnecting = useCallback(() => setState('connecting'), []);
  const setConnected = useCallback(() => setState('connected'), []);

  return {
    state,
    setState,
    variant,
    steps,
    setPreConnect,
    setConnecting,
    setConnected,
  };
}
