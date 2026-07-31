import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWalletFlow } from '../useWalletFlow';
import type { WalletFlowState } from '@shared/types/stellaramp';

describe('useWalletFlow', () => {
  it('should initialise to "pre_connect" by default', () => {
    const { result } = renderHook(() => useWalletFlow());
    expect(result.current.state).toBe('pre_connect');
  });

  it('should accept a custom initial state', () => {
    const { result } = renderHook(() => useWalletFlow('connected' as WalletFlowState));
    expect(result.current.state).toBe('connected');
  });

  it('should transition to "connecting" via setConnecting', () => {
    const { result } = renderHook(() => useWalletFlow());

    act(() => { result.current.setConnecting(); });

    expect(result.current.state).toBe('connecting');
  });

  it('should transition to "connected" via setConnected', () => {
    const { result } = renderHook(() => useWalletFlow());

    act(() => { result.current.setConnected(); });

    expect(result.current.state).toBe('connected');
  });

  it('should transition back to "pre_connect" via setPreConnect', () => {
    const { result } = renderHook(() => useWalletFlow('connected' as WalletFlowState));

    act(() => { result.current.setPreConnect(); });

    expect(result.current.state).toBe('pre_connect');
  });

  it('should derive a non-null variant from the current state', () => {
    const { result } = renderHook(() => useWalletFlow());
    expect(result.current.variant).toBeDefined();
    expect(result.current.variant.key).toBe('pre_connect');
  });

  it('should build progress steps based on the variant', () => {
    const { result } = renderHook(() => useWalletFlow());
    expect(Array.isArray(result.current.steps)).toBe(true);
    expect(result.current.steps.length).toBeGreaterThan(0);
  });

  it('should update steps when state changes', () => {
    const { result } = renderHook(() => useWalletFlow());

    const initialSteps = result.current.steps;

    act(() => { result.current.setConnecting(); });

    // Steps are re-derived; they may differ between states
    expect(result.current.steps).toBeDefined();
    // The first step title should reflect the new state variant
    const connectingSteps = result.current.steps;
    expect(connectingSteps).not.toBe(initialSteps); // new reference
  });

  it('should allow arbitrary state via setState', () => {
    const { result } = renderHook(() => useWalletFlow());

    act(() => { result.current.setState('connecting' as WalletFlowState); });

    expect(result.current.state).toBe('connecting');
  });
});
