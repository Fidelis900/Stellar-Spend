'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import type { Shortcut } from '@/hooks/useKeyboardShortcuts';
import {
  saveShortcutOverride,
  resetShortcutOverrides,
  ShortcutOverrides,
} from '@/hooks/useKeyboardShortcuts';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/cn';
import { useFocusTrap, useFocusRestore } from '@/hooks/useFocusTrap';

interface Props {
  open: boolean;
  shortcuts: Shortcut[];
  onClose: () => void;
}

function isMac() {
  if (typeof navigator === 'undefined') return false;
  return navigator.platform.toUpperCase().includes('MAC');
}

function formatKey(shortcut: { key: string; ctrl?: boolean; shift?: boolean }): string {
  const parts: string[] = [];
  if (shortcut.ctrl) parts.push(isMac() ? '⌘' : 'Ctrl');
  if (shortcut.shift) parts.push('Shift');
  parts.push(shortcut.key.toUpperCase());
  return parts.join(' + ');
}

function shortcutId(s: Shortcut) {
  return s.key + String(s.ctrl) + String(s.shift);
}

export function KeyboardShortcutsModal({ open, shortcuts, onClose }: Props) {
  const [customizing, setCustomizing] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState('');
  const [pendingModifiers, setPendingModifiers] = useState<{ ctrl?: boolean; shift?: boolean }>({});
  const [conflict, setConflict] = useState<string | null>(null);

  const { t } = useI18n();

  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open);
  useFocusRestore(open);

  // Load current overrides to check for conflicts
  const currentOverrides = useMemo(() => {
    if (typeof window === 'undefined') return {};
    try {
      return JSON.parse(localStorage.getItem('stellar_spend_shortcut_overrides') ?? '{}');
    } catch {
      return {};
    }
  }, [customizing]); // Re-evaluate when customization changes

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !customizing) {
        onClose();
      }
      if (e.key === 'Escape' && customizing) {
        setCustomizing(null);
        setConflict(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose, customizing]);

  const checkConflict = (key: string, ctrl?: boolean, shift?: boolean, currentId?: string) => {
    for (const s of shortcuts) {
      const id = shortcutId(s);
      if (id === currentId) continue;

      const override = currentOverrides[id];
      const effectiveKey = override?.key ?? s.key;
      const effectiveCtrl = override?.ctrl ?? s.ctrl;
      const effectiveShift = override?.shift ?? s.shift;

      if (
        effectiveKey.toLowerCase() === key.toLowerCase() &&
        !!effectiveCtrl === !!ctrl &&
        !!effectiveShift === !!shift
      ) {
        return s.description;
      }
    }
    return null;
  };

  const handleCapture = (e: React.KeyboardEvent, id: string) => {
    e.preventDefault();
    if (e.key === 'Escape') {
      setCustomizing(null);
      setConflict(null);
      return;
    }

    // Don't capture modifiers alone
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
      setPendingModifiers({
        ctrl: e.ctrlKey || e.metaKey,
        shift: e.shiftKey,
      });
      return;
    }

    const key = e.key;
    const ctrl = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;

    const conflictDescription = checkConflict(key, ctrl, shift, id);
    if (conflictDescription) {
      setConflict(conflictDescription);
      setPendingKey(key);
      setPendingModifiers({ ctrl, shift });
      return;
    }

    saveShortcutOverride(id, { key, ctrl, shift });
    setCustomizing(null);
    setPendingKey('');
    setPendingModifiers({});
    setConflict(null);

    // Refresh page or trigger state update to apply changes
    window.dispatchEvent(new Event('storage'));
  };

  const handleReset = () => {
    resetShortcutOverrides();
    setCustomizing(null);
    setConflict(null);
    window.dispatchEvent(new Event('storage'));
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      aria-hidden="true"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-modal-title"
        className="w-full max-w-md border border-[#333] bg-[#0a0a0a] p-8 flex flex-col gap-6 shadow-2xl animate-in zoom-in-95 duration-200"
      >
        <div className="flex items-center justify-between border-b border-[#222] pb-4">
          <h2
            id="shortcuts-modal-title"
            className="text-white font-bold text-sm uppercase tracking-widest"
          >
            Keyboard shortcuts
          </h2>
          <div className="flex gap-4 items-center">
            <button
              onClick={handleReset}
              className="text-[#777] hover:text-[#c9a962] text-[10px] uppercase tracking-widest transition-colors font-bold"
            >
              Reset to Defaults
            </button>
            <button
              onClick={onClose}
              aria-label="Close shortcuts modal"
              className="text-[#555] hover:text-white transition-colors text-xl leading-none"
            >
              ×
            </button>
          </div>
        </div>

        <ul className="flex flex-col gap-3">
          {shortcuts.map((s) => {
            const id = shortcutId(s);
            const isCustomizing = customizing === id;
            const override = currentOverrides[id];
            const displayShortcut = override ? { ...s, ...override } : s;

            return (
              <li
                key={id}
                className={cn(
                  'flex items-center justify-between gap-4 p-3 border transition-colors',
                  isCustomizing
                    ? 'border-[#c9a962] bg-[#c9a962]/5'
                    : 'border-[#1a1a1a] hover:bg-[#111]',
                )}
              >
                <span className="text-[#aaa] text-xs font-medium">{s.description}</span>
                <div className="flex items-center gap-2 shrink-0">
                  {isCustomizing ? (
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex items-center gap-2">
                        {conflict && (
                          <span className="text-[10px] text-red-400 font-bold uppercase tracking-tight animate-pulse">
                            Conflict: {conflict}
                          </span>
                        )}
                        <input
                          autoFocus
                          placeholder="Press key…"
                          value={
                            pendingKey ? formatKey({ key: pendingKey, ...pendingModifiers }) : ''
                          }
                          onKeyDown={(e) => handleCapture(e, id)}
                          readOnly
                          className={cn(
                            'w-32 px-3 py-1.5 text-xs bg-[#000] border font-mono outline-none text-center',
                            conflict
                              ? 'border-red-500 text-red-400'
                              : 'border-[#c9a962] text-[#c9a962]',
                          )}
                        />
                      </div>
                      <span className="text-[9px] text-[#555] uppercase tracking-tighter">
                        ESC to cancel
                      </span>
                    </div>
                  ) : (
                    <kbd
                      className={cn(
                        'px-3 py-1.5 text-xs border font-mono cursor-pointer transition-all',
                        override
                          ? 'border-[#c9a962] text-[#c9a962] bg-[#c9a962]/5'
                          : 'border-[#333] text-[#777] hover:border-[#555] hover:text-white',
                      )}
                      title={s.hint ?? formatKey(displayShortcut)}
                      onClick={() => {
                        setCustomizing(id);
                        setPendingKey('');
                        setConflict(null);
                      }}
                    >
                      {formatKey(displayShortcut)}
                    </kbd>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="pt-4 border-t border-[#222] space-y-2">
          <p className="text-[#555] text-[10px] uppercase tracking-widest leading-relaxed">
            • Click a shortcut key to customize it.
            <br />
            • Shortcuts are disabled when typing in forms.
            <br />• Global trigger: Press <span className="text-[#c9a962] font-bold">?</span>{' '}
            anywhere to open this menu.
          </p>
        </div>
      </div>
    </div>
  );
}
