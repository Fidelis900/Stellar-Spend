import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
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
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

import { saveShortcutOverride, resetShortcutOverrides } from '../useKeyboardShortcuts';

describe('Keyboard Shortcut Customization', () => {
  beforeEach(() => {
    localStorage.clear();
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
});
