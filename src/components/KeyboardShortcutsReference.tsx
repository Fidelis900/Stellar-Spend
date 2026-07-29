'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';

export interface KeyboardShortcut {
  keys: string[];
  description: string;
  category: 'navigation' | 'form' | 'transaction' | 'general';
}

const KEYBOARD_SHORTCUTS: KeyboardShortcut[] = [
  // Navigation
  { keys: ['Tab'], description: 'Move to next focusable element', category: 'navigation' },
  {
    keys: ['Shift', 'Tab'],
    description: 'Move to previous focusable element',
    category: 'navigation',
  },
  { keys: ['Escape'], description: 'Close modal or dialog', category: 'navigation' },
  { keys: ['Enter'], description: 'Activate button or submit form', category: 'navigation' },
  { keys: ['Space'], description: 'Toggle checkbox or activate button', category: 'navigation' },

  // Form
  { keys: ['Alt', 'A'], description: 'Focus amount input', category: 'form' },
  { keys: ['Alt', 'C'], description: 'Focus currency selector', category: 'form' },
  { keys: ['Alt', 'B'], description: 'Focus bank selector', category: 'form' },

  // Transaction
  { keys: ['Ctrl', 'Enter'], description: 'Submit transaction', category: 'transaction' },
  { keys: ['Ctrl', 'Z'], description: 'Undo last action', category: 'transaction' },
  { keys: ['Ctrl', 'Y'], description: 'Redo last action', category: 'transaction' },

  // General
  { keys: ['?'], description: 'Show keyboard shortcuts', category: 'general' },
  { keys: ['Ctrl', 'K'], description: 'Open command palette', category: 'general' },
];

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps) {
  const [selectedCategory, setSelectedCategory] = useState<KeyboardShortcut['category'] | 'all'>(
    'all',
  );

  if (!isOpen) return null;

  const categories: Array<KeyboardShortcut['category']> = [
    'navigation',
    'form',
    'transaction',
    'general',
  ];
  const filteredShortcuts =
    selectedCategory === 'all'
      ? KEYBOARD_SHORTCUTS
      : KEYBOARD_SHORTCUTS.filter((s) => s.category === selectedCategory);

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
    >
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 p-6">
          <h2 id="shortcuts-title" className="text-2xl font-bold text-gray-900 dark:text-white">
            Keyboard Shortcuts
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Use these shortcuts to navigate and control the application
          </p>
        </div>

        {/* Category Filter */}
        <div className="border-b border-gray-200 dark:border-gray-700 p-6">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedCategory('all')}
              className={cn(
                'px-3 py-1 rounded-full text-sm font-medium transition-colors',
                selectedCategory === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600',
              )}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={cn(
                  'px-3 py-1 rounded-full text-sm font-medium transition-colors capitalize',
                  selectedCategory === cat
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600',
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Shortcuts List */}
        <div className="p-6 space-y-6">
          {filteredShortcuts.map((shortcut, idx) => (
            <div key={idx} className="flex items-start gap-4">
              <div className="flex gap-1 flex-wrap">
                {shortcut.keys.map((key, keyIdx) => (
                  <div key={keyIdx} className="flex items-center gap-1">
                    <kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded text-sm font-mono border border-gray-300 dark:border-gray-600">
                      {key}
                    </kbd>
                    {keyIdx < shortcut.keys.length - 1 && (
                      <span className="text-gray-500 dark:text-gray-400 text-sm">+</span>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-gray-700 dark:text-gray-300 text-sm flex-1 pt-1">
                {shortcut.description}
              </p>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 p-6">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            aria-label="Close keyboard shortcuts"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
