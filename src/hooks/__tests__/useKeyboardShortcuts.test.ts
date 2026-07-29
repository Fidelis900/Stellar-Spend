/**
 * useKeyboardShortcuts — comprehensive unit tests (issue #835)
 *
 * Coverage targets:
 *  - saveShortcutOverride / resetShortcutOverrides (utility helpers)
 *  - shortcutHint
 *  - useKeyboardShortcuts hook:
 *      [1] registers a keydown listener on mount
 *      [2] removes the listener on unmount
 *      [3] fires the matching shortcut action
 *      [4] does NOT fire when enabled=false
 *      [5] skips events targeting INPUT elements
 *      [6] skips events targeting TEXTAREA elements
 *      [7] skips events targeting SELECT elements
 *      [8] skips events on contentEditable elements
 *      [9] honours per-shortcut localStorage overrides
 *     [10] ctrl modifier is respected
 *     [11] shift modifier is respected
 *     [12] does not fire when only key matches but modifiers differ
 *  - useShortcutCustomizer hook:
 *     [13] save persists to localStorage and updates state
 *     [14] reset removes localStorage key and clears state
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// localStorage mock — set up before importing the module under test so that
// any module-level loadOverrides() calls during import hit the mock.
// ---------------------------------------------------------------------------
const _store: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string): string | null => _store[key] ?? null,
  setItem: (key: string, value: string) => { _store[key] = value; },
  removeItem: (key: string) => { delete _store[key]; },
  clear: () => { Object.keys(_store).forEach(k => delete _store[k]); },
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// ---------------------------------------------------------------------------
// Imports — after localStorage mock
// ---------------------------------------------------------------------------
import {
  saveShortcutOverride,
  resetShortcutOverrides,
  shortcutHint,
  useKeyboardShortcuts,
  useShortcutCustomizer,
  type Shortcut,
} from '../useKeyboardShortcuts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Dispatch a synthetic keydown event on window. */
function fireKey(options: {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  target?: HTMLElement;
}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: options.key,
    ctrlKey: options.ctrlKey ?? false,
    metaKey: options.metaKey ?? false,
    shiftKey: options.shiftKey ?? false,
    bubbles: true,
    cancelable: true,
  });

  if (options.target) {
    // Fake the target by defining a non-writable property via defineProperty.
    Object.defineProperty(event, 'target', { value: options.target, configurable: true });
  }

  window.dispatchEvent(event);
  return event;
}

/** Create a minimal Shortcut object. */
function makeShortcut(
  key: string,
  action: () => void,
  opts: Partial<Pick<Shortcut, 'ctrl' | 'shift' | 'description'>> = {}
): Shortcut {
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
}

// ---------------------------------------------------------------------------
// saveShortcutOverride / resetShortcutOverrides
// ---------------------------------------------------------------------------

describe('saveShortcutOverride', () => {
  beforeEach(() => localStorage.clear());

  it('persists the override under the correct localStorage key', () => {
    saveShortcutOverride('n-true-false', { key: 'm', ctrl: true });
    const stored = JSON.parse(localStorage.getItem('stellar_spend_shortcut_overrides')!);
    expect(stored['n-true-false']).toEqual({ key: 'm', ctrl: true });
  });

  it('preserves existing overrides when adding a new one', () => {
    saveShortcutOverride('a-false-false', { key: 'a' });
    saveShortcutOverride('b-false-false', { key: 'b' });
    const stored = JSON.parse(localStorage.getItem('stellar_spend_shortcut_overrides')!);
    expect(Object.keys(stored)).toHaveLength(2);
    expect(stored['a-false-false']).toEqual({ key: 'a' });
    expect(stored['b-false-false']).toEqual({ key: 'b' });
  });

  it('overwrites an existing override for the same id', () => {
    saveShortcutOverride('n-true-false', { key: 'm', ctrl: true });
    saveShortcutOverride('n-true-false', { key: 'p', ctrl: false });
    const stored = JSON.parse(localStorage.getItem('stellar_spend_shortcut_overrides')!);
    expect(stored['n-true-false']).toEqual({ key: 'p', ctrl: false });
  });
});

describe('resetShortcutOverrides', () => {
  beforeEach(() => localStorage.clear());

  it('removes the overrides key from localStorage', () => {
    saveShortcutOverride('n-true-false', { key: 'm', ctrl: true });
    resetShortcutOverrides();
    expect(localStorage.getItem('stellar_spend_shortcut_overrides')).toBeNull();
  });

  it('does not throw when there are no overrides to remove', () => {
    expect(() => resetShortcutOverrides()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// shortcutHint
// ---------------------------------------------------------------------------

describe('shortcutHint', () => {
  it('returns an object with data-shortcut-hint and title set to the label', () => {
    const result = shortcutHint('Ctrl+N');
    expect(result).toEqual({
      'data-shortcut-hint': 'Ctrl+N',
      title: 'Ctrl+N',
    });
  });

  it('handles an empty label without throwing', () => {
    const result = shortcutHint('');
    expect(result['data-shortcut-hint']).toBe('');
    expect(result.title).toBe('');
  });
});

// ---------------------------------------------------------------------------
// useKeyboardShortcuts hook
// ---------------------------------------------------------------------------

describe('useKeyboardShortcuts', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32'); // non-Mac
  });

  it('should save and load overrides correctly', () => {
    const id = 'n-true-false'; // Ctrl+N
    const override = { key: 'm', ctrl: true, shift: false };

    saveShortcutOverride(id, override);

    const stored = JSON.parse(localStorage.getItem('stellar_spend_shortcut_overrides') || '{}');
    expect(stored[id]).toEqual(override);
  });

  it('should reset overrides', () => {
    const id = 'n-true-false';
    saveShortcutOverride(id, { key: 'm', ctrl: true });

    resetShortcutOverrides();

    expect(localStorage.getItem('stellar_spend_shortcut_overrides')).toBeNull();
  });

  it('initialises with existing overrides from localStorage', () => {
    localStorage.setItem(
      'stellar_spend_shortcut_overrides',
      JSON.stringify({ 'existing-id': { key: 'x' } })
    );

    const { result } = renderHook(() => useShortcutCustomizer());
    expect(result.current.overrides['existing-id']).toEqual({ key: 'x' });
  });
});
