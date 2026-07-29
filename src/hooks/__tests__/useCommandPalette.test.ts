import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCommandPalette } from '../useCommandPalette';

const STORAGE_KEY = 'stellar_spend_recent_commands';

describe('useCommandPalette', () => {
  beforeEach(() => {
    localStorage.clear();
    // Ensure navigator.platform is non-Mac so Ctrl+K is used
    Object.defineProperty(navigator, 'platform', {
      writable: true,
      value: 'Win32',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should initialise with isOpen = false', () => {
    const { result } = renderHook(() => useCommandPalette());
    expect(result.current.isOpen).toBe(false);
  });

  it('should open the palette via open()', () => {
    const { result } = renderHook(() => useCommandPalette());

    act(() => { result.current.open(); });

    expect(result.current.isOpen).toBe(true);
  });

  it('should close the palette via close()', () => {
    const { result } = renderHook(() => useCommandPalette());

    act(() => { result.current.open(); });
    act(() => { result.current.close(); });

    expect(result.current.isOpen).toBe(false);
  });

  it('should toggle the palette via toggle()', () => {
    const { result } = renderHook(() => useCommandPalette());

    act(() => { result.current.toggle(); });
    expect(result.current.isOpen).toBe(true);

    act(() => { result.current.toggle(); });
    expect(result.current.isOpen).toBe(false);
  });

  it('should open the palette on Ctrl+K keydown', () => {
    const { result } = renderHook(() => useCommandPalette());

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }),
      );
    });

    expect(result.current.isOpen).toBe(true);
  });

  it('should track recent commands via onCommandExecute', () => {
    const { result } = renderHook(() => useCommandPalette());

    act(() => { result.current.onCommandExecute('transfer'); });
    act(() => { result.current.onCommandExecute('settings'); });

    expect(result.current.recentCommands).toEqual(['settings', 'transfer']);
    expect(localStorage.getItem(STORAGE_KEY)).toContain('settings');
  });

  it('should cap recent commands at 5', () => {
    const { result } = renderHook(() => useCommandPalette());

    act(() => {
      ['a', 'b', 'c', 'd', 'e', 'f'].forEach((id) =>
        result.current.onCommandExecute(id),
      );
    });

    expect(result.current.recentCommands).toHaveLength(5);
  });

  it('should load stored recent commands from localStorage on mount', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['cmd1', 'cmd2']));

    const { result } = renderHook(() => useCommandPalette());

    expect(result.current.recentCommands).toEqual(['cmd1', 'cmd2']);
  });

  it('should de-duplicate commands when re-executing an existing one', () => {
    const { result } = renderHook(() => useCommandPalette());

    act(() => { result.current.onCommandExecute('transfer'); });
    act(() => { result.current.onCommandExecute('settings'); });
    act(() => { result.current.onCommandExecute('transfer'); }); // duplicate

    expect(result.current.recentCommands[0]).toBe('transfer');
    // 'transfer' should appear only once
    const count = result.current.recentCommands.filter((c) => c === 'transfer').length;
    expect(count).toBe(1);
  });
});
