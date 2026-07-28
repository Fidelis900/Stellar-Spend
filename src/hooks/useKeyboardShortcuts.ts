'use client';

import { useEffect, useCallback, useState } from 'react';

export interface Shortcut {
  key: string;
  /** Modifier: ctrl/cmd */
  ctrl?: boolean;
  /** Modifier: shift */
  shift?: boolean;
  description: string;
  action: () => void;
  /** Hint text shown on hover via data-shortcut-hint attribute */
  hint?: string;
}

export type ShortcutOverrides = Record<string, { key: string; ctrl?: boolean; shift?: boolean }>;

const STORAGE_KEY = 'stellar_spend_shortcut_overrides';

function loadOverrides(): ShortcutOverrides {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function saveShortcutOverride(
  id: string,
  override: { key: string; ctrl?: boolean; shift?: boolean },
) {
  const overrides = loadOverrides();
  overrides[id] = override;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
}

export function resetShortcutOverrides() {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Registers global keyboard shortcuts.
 * Skips when focus is inside an input, textarea, or select to avoid conflicts.
 * Supports per-shortcut customization stored in localStorage.
 */
export function useKeyboardShortcuts(shortcuts: Shortcut[], enabled = true) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;

      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.target as HTMLElement)?.isContentEditable) return;

      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey;
      const overrides = loadOverrides();

      for (const shortcut of shortcuts) {
        const id = shortcut.key + String(shortcut.ctrl) + String(shortcut.shift);
        const override = overrides[id];
        const effectiveKey = override?.key ?? shortcut.key;
        const effectiveCtrl = override?.ctrl ?? shortcut.ctrl;
        const effectiveShift = override?.shift ?? shortcut.shift;

        const keyMatch = e.key.toLowerCase() === effectiveKey.toLowerCase();
        const ctrlMatch = effectiveCtrl ? ctrlOrCmd : !ctrlOrCmd && !e.metaKey;
        const shiftMatch = effectiveShift ? e.shiftKey : !e.shiftKey;

        if (keyMatch && ctrlMatch && shiftMatch) {
          e.preventDefault();
          shortcut.action();
          return;
        }
      }
    },
    [enabled, shortcuts],
  );

  useEffect(() => {
    if (!enabled) return;
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, handleKeyDown]);
}

/**
 * Returns a data attribute object to attach shortcut hints to elements.
 * Usage: <button {...shortcutHint('Ctrl+N')}>New</button>
 */
export function shortcutHint(label: string): { 'data-shortcut-hint': string; title: string } {
  return { 'data-shortcut-hint': label, title: label };
}

/**
 * Hook that builds the standard app-wide shortcut list and wires them up.
 * Returns the shortcut list for display in the help modal.
 */
export function useAppShortcuts({
  onNewTransaction,
  onSearch,
  onNavigateHome,
  onNavigateHistory,
  onToggleTheme,
  onHelp,
}: {
  onNewTransaction?: () => void;
  onSearch?: () => void;
  onNavigateHome?: () => void;
  onNavigateHistory?: () => void;
  onToggleTheme?: () => void;
  onHelp?: () => void;
}): Shortcut[] {
  const shortcuts: Shortcut[] = [
    {
      key: 'n',
      ctrl: true,
      description: 'New transaction',
      hint: 'Ctrl+N',
      action: () => onNewTransaction?.(),
    },
    {
      key: 'k',
      ctrl: true,
      description: 'Search transactions',
      hint: 'Ctrl+K',
      action: () => onSearch?.(),
    },
    {
      key: 'h',
      ctrl: true,
      description: 'Go to Home',
      hint: 'Ctrl+H',
      action: () => onNavigateHome?.(),
    },
    {
      key: 'j',
      ctrl: true,
      description: 'Go to History',
      hint: 'Ctrl+J',
      action: () => onNavigateHistory?.(),
    },
    {
      key: 'd',
      ctrl: true,
      description: 'Toggle dark/light theme',
      hint: 'Ctrl+D',
      action: () => onToggleTheme?.(),
    },
    {
      key: '?',
      description: 'Show keyboard shortcuts',
      hint: '?',
      action: () => onHelp?.(),
    },
  ];

  useKeyboardShortcuts(shortcuts);
  return shortcuts;
}

/**
 * Hook to manage the shortcut customization UI state.
 */
export function useShortcutCustomizer() {
  const [overrides, setOverrides] = useState<ShortcutOverrides>(loadOverrides);

  const save = (id: string, override: { key: string; ctrl?: boolean; shift?: boolean }) => {
    saveShortcutOverride(id, override);
    setOverrides(loadOverrides());
  };

  const reset = () => {
    resetShortcutOverrides();
    setOverrides({});
  };

  return { overrides, save, reset };
}
