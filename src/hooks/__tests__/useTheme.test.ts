import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTheme } from '../useTheme';

// Helper to mock window.matchMedia
function mockMatchMedia(prefersDark: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-color-scheme: dark)' ? prefersDark : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset document attribute
    document.documentElement.removeAttribute('data-theme');
    mockMatchMedia(false);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should default to system theme when nothing is stored', () => {
    // No stored value → should default to "system"
    const { result } = renderHook(() => useTheme());
    // After the effect, theme is set to "system"
    expect(result.current.theme).toBe('system');
  });

  it('should read the stored theme from localStorage on mount', () => {
    localStorage.setItem('theme', 'light');
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('light');
  });

  it('should update localStorage and data-theme attribute when setTheme is called', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setTheme('dark');
    });

    expect(result.current.theme).toBe('dark');
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('should toggle from dark to light', () => {
    const { result } = renderHook(() => useTheme());

    act(() => { result.current.setTheme('dark'); });
    act(() => { result.current.toggleTheme(); });

    expect(result.current.theme).toBe('light');
    expect(localStorage.getItem('theme')).toBe('light');
  });

  it('should toggle from light to dark', () => {
    const { result } = renderHook(() => useTheme());

    act(() => { result.current.setTheme('light'); });
    act(() => { result.current.toggleTheme(); });

    expect(result.current.theme).toBe('dark');
  });

  it('should apply the system preference (dark) when "system" theme is set', () => {
    mockMatchMedia(true); // system prefers dark
    const { result } = renderHook(() => useTheme());

    act(() => { result.current.setTheme('system'); });

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('should apply the system preference (light) when "system" theme is set', () => {
    mockMatchMedia(false); // system prefers light
    const { result } = renderHook(() => useTheme());

    act(() => { result.current.setTheme('system'); });

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});
