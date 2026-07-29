import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useProgressiveDisclosure } from '../useProgressiveDisclosure';

const STORAGE_KEY = 'stellar-spend-advanced-options';

describe('useProgressiveDisclosure', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should start closed when defaultOpen is false (default)', () => {
    const { result } = renderHook(() => useProgressiveDisclosure('settings'));
    expect(result.current.isOpen).toBe(false);
  });

  it('should start open when defaultOpen is true', () => {
    const { result } = renderHook(() => useProgressiveDisclosure('settings', true));
    expect(result.current.isOpen).toBe(true);
  });

  it('should set isMounted to true after mount', () => {
    const { result } = renderHook(() => useProgressiveDisclosure('settings'));
    expect(result.current.isMounted).toBe(true);
  });

  it('should read stored value from localStorage on mount', () => {
    localStorage.setItem(`${STORAGE_KEY}:mySection`, 'true');
    const { result } = renderHook(() => useProgressiveDisclosure('mySection'));
    expect(result.current.isOpen).toBe(true);
  });

  it('should toggle isOpen when toggle is called', () => {
    const { result } = renderHook(() => useProgressiveDisclosure('section'));

    expect(result.current.isOpen).toBe(false);

    act(() => { result.current.toggle(); });
    expect(result.current.isOpen).toBe(true);

    act(() => { result.current.toggle(); });
    expect(result.current.isOpen).toBe(false);
  });

  it('should persist the toggled value to localStorage', () => {
    const { result } = renderHook(() => useProgressiveDisclosure('section'));

    act(() => { result.current.toggle(); });

    expect(localStorage.getItem(`${STORAGE_KEY}:section`)).toBe('true');

    act(() => { result.current.toggle(); });

    expect(localStorage.getItem(`${STORAGE_KEY}:section`)).toBe('false');
  });

  it('should use separate localStorage keys for different hook instances', () => {
    const { result: a } = renderHook(() => useProgressiveDisclosure('sectionA'));
    const { result: b } = renderHook(() => useProgressiveDisclosure('sectionB'));

    act(() => { a.current.toggle(); });

    expect(a.current.isOpen).toBe(true);
    expect(b.current.isOpen).toBe(false);
    expect(localStorage.getItem(`${STORAGE_KEY}:sectionA`)).toBe('true');
    expect(localStorage.getItem(`${STORAGE_KEY}:sectionB`)).toBeNull();
  });
});
