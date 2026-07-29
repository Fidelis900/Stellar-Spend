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
    key,
    description: opts.description ?? `Test shortcut for ${key}`,
    action,
    ctrl: opts.ctrl,
    shift: opts.shift,
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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // [1] registers listener
  it('[1] adds a keydown listener on window on mount', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const action = vi.fn();
    const { unmount } = renderHook(() =>
      useKeyboardShortcuts([makeShortcut('n', action)])
    );
    expect(addSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    unmount();
  });

  // [2] removes listener on unmount
  it('[2] removes the keydown listener on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const action = vi.fn();
    const { unmount } = renderHook(() =>
      useKeyboardShortcuts([makeShortcut('n', action)])
    );
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
  });

  // [3] fires matching shortcut action
  it('[3] fires the action when the matching key is pressed', () => {
    const action = vi.fn();
    renderHook(() => useKeyboardShortcuts([makeShortcut('n', action)]));
    fireKey({ key: 'n' });
    expect(action).toHaveBeenCalledTimes(1);
  });

  // [4] does not fire when enabled=false
  it('[4] does not fire the action when enabled is false', () => {
    const action = vi.fn();
    renderHook(() => useKeyboardShortcuts([makeShortcut('n', action)], false));
    fireKey({ key: 'n' });
    expect(action).not.toHaveBeenCalled();
  });

  // [5] skips INPUT targets
  it('[5] skips the shortcut when focus is on an INPUT element', () => {
    const action = vi.fn();
    renderHook(() => useKeyboardShortcuts([makeShortcut('n', action)]));
    const input = document.createElement('input');
    fireKey({ key: 'n', target: input });
    expect(action).not.toHaveBeenCalled();
  });

  // [6] skips TEXTAREA targets
  it('[6] skips the shortcut when focus is on a TEXTAREA element', () => {
    const action = vi.fn();
    renderHook(() => useKeyboardShortcuts([makeShortcut('n', action)]));
    const textarea = document.createElement('textarea');
    fireKey({ key: 'n', target: textarea });
    expect(action).not.toHaveBeenCalled();
  });

  // [7] skips SELECT targets
  it('[7] skips the shortcut when focus is on a SELECT element', () => {
    const action = vi.fn();
    renderHook(() => useKeyboardShortcuts([makeShortcut('n', action)]));
    const select = document.createElement('select');
    fireKey({ key: 'n', target: select });
    expect(action).not.toHaveBeenCalled();
  });

  // [8] skips contentEditable elements
  it('[8] skips the shortcut when focus is on a contentEditable element', () => {
    const action = vi.fn();
    renderHook(() => useKeyboardShortcuts([makeShortcut('n', action)]));

    // jsdom does not implement isContentEditable, so we build a target that
    // mimics the property the hook checks: (e.target as HTMLElement).isContentEditable
    const div = document.createElement('div');
    // Directly define the property the hook checks
    Object.defineProperty(div, 'isContentEditable', { get: () => true, configurable: true });

    fireKey({ key: 'n', target: div });
    expect(action).not.toHaveBeenCalled();
  });

  // [9] honours localStorage overrides
  it('[9] uses the overridden key from localStorage when present', () => {
    const action = vi.fn();
    // Default shortcut is 'n'; override to 'm'
    const shortcut = makeShortcut('n', action);
    const id = shortcut.key + String(shortcut.ctrl) + String(shortcut.shift); // 'nundefinedundefined'
    saveShortcutOverride(id, { key: 'm' });

    renderHook(() => useKeyboardShortcuts([shortcut]));

    // Original key should NOT trigger
    fireKey({ key: 'n' });
    expect(action).not.toHaveBeenCalled();

    // Overridden key SHOULD trigger
    fireKey({ key: 'm' });
    expect(action).toHaveBeenCalledTimes(1);
  });

  // [10] ctrl modifier
  it('[10] fires the action only when the ctrl modifier is held for a ctrl shortcut', () => {
    const action = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([makeShortcut('n', action, { ctrl: true })])
    );

    // Without ctrl — should NOT fire
    fireKey({ key: 'n' });
    expect(action).not.toHaveBeenCalled();

    // With ctrl — SHOULD fire
    fireKey({ key: 'n', ctrlKey: true });
    expect(action).toHaveBeenCalledTimes(1);
  });

  // [11] shift modifier
  it('[11] fires the action only when the shift modifier is held for a shift shortcut', () => {
    const action = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([makeShortcut('s', action, { shift: true })])
    );

    // Without shift — should NOT fire
    fireKey({ key: 's' });
    expect(action).not.toHaveBeenCalled();

    // With shift — SHOULD fire
    fireKey({ key: 's', shiftKey: true });
    expect(action).toHaveBeenCalledTimes(1);
  });

  // [12] wrong modifier combination does not trigger
  it('[12] does not fire when key matches but ctrl/shift combination differs', () => {
    const action = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([makeShortcut('k', action, { ctrl: true, shift: true })])
    );

    // Only ctrl pressed (no shift)
    fireKey({ key: 'k', ctrlKey: true });
    expect(action).not.toHaveBeenCalled();

    // Only shift pressed (no ctrl)
    fireKey({ key: 'k', shiftKey: true });
    expect(action).not.toHaveBeenCalled();

    // Both modifiers — should fire
    fireKey({ key: 'k', ctrlKey: true, shiftKey: true });
    expect(action).toHaveBeenCalledTimes(1);
  });

  // key case insensitivity
  it('handles case-insensitive key matching', () => {
    const action = vi.fn();
    renderHook(() => useKeyboardShortcuts([makeShortcut('N', action)]));
    // Dispatch lowercase 'n' — should still fire
    fireKey({ key: 'n' });
    expect(action).toHaveBeenCalledTimes(1);
  });

  // multiple shortcuts — only the matching one fires
  it('only fires the action for the matched shortcut among many', () => {
    const actionA = vi.fn();
    const actionB = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([
        makeShortcut('a', actionA),
        makeShortcut('b', actionB),
      ])
    );

    fireKey({ key: 'a' });
    expect(actionA).toHaveBeenCalledTimes(1);
    expect(actionB).not.toHaveBeenCalled();
  });

  // prevents default when a shortcut matches
  it('calls event.preventDefault() when a shortcut fires', () => {
    const action = vi.fn();
    renderHook(() => useKeyboardShortcuts([makeShortcut('n', action)]));

    const event = new KeyboardEvent('keydown', { key: 'n', cancelable: true, bubbles: true });
    const preventSpy = vi.spyOn(event, 'preventDefault');
    window.dispatchEvent(event);

    expect(preventSpy).toHaveBeenCalled();
  });

  // Mac: metaKey treated as ctrl
  it('treats metaKey as ctrlOrCmd on Mac platform', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    const action = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([makeShortcut('n', action, { ctrl: true })])
    );

    // macOS Cmd (metaKey) should trigger a ctrl shortcut
    fireKey({ key: 'n', metaKey: true });
    expect(action).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// useShortcutCustomizer hook
// ---------------------------------------------------------------------------

describe('useShortcutCustomizer', () => {
  beforeEach(() => localStorage.clear());

  // [13] save persists and updates state
  it('[13] save persists the override to localStorage and updates hook state', () => {
    const { result } = renderHook(() => useShortcutCustomizer());

    act(() => {
      result.current.save('n-true-false', { key: 'm', ctrl: true });
    });

    // State should reflect the new override
    expect(result.current.overrides['n-true-false']).toEqual({ key: 'm', ctrl: true });

    // localStorage should be persisted
    const stored = JSON.parse(localStorage.getItem('stellar_spend_shortcut_overrides')!);
    expect(stored['n-true-false']).toEqual({ key: 'm', ctrl: true });
  });

  // [14] reset clears state and localStorage
  it('[14] reset removes the localStorage key and clears overrides state', () => {
    const { result } = renderHook(() => useShortcutCustomizer());

    act(() => {
      result.current.save('n-true-false', { key: 'm', ctrl: true });
    });

    act(() => {
      result.current.reset();
    });

    expect(result.current.overrides).toEqual({});
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
