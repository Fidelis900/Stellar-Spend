'use client';

import { useEffect, useState } from 'react';
import type { UndoableAction } from '@/hooks/useUndo';

interface UndoNotificationProps {
  action: UndoableAction | null;
  onUndo: () => void;
  isVisible: boolean;
}

export function UndoNotification({ action, onUndo, isVisible }: UndoNotificationProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isVisible && action) {
      setShow(true);
      const timer = setTimeout(() => setShow(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [isVisible, action]);

  if (!show || !action) return null;

  return (
    <div
      className="fixed bottom-4 left-4 bg-gray-900 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 z-50"
      role="status"
      aria-live="polite"
      aria-label={`Action: ${action.description}`}
    >
      <span className="text-sm">{action.description}</span>
      <button
        onClick={onUndo}
        className="ml-2 px-3 py-1 bg-white text-gray-900 rounded text-sm font-medium hover:bg-gray-100 transition-colors"
        aria-label={`Undo ${action.description}`}
      >
        Undo
      </button>
    </div>
  );
}
