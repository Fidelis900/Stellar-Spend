'use client';

import { useState, useCallback, useRef } from 'react';

export interface UndoableAction {
  id: string;
  description: string;
  undo: () => void;
  redo?: () => void;
  timestamp: number;
}

interface UseUndoOptions {
  maxHistory?: number;
  timeout?: number; // ms before undo expires
}

export function useUndo(options: UseUndoOptions = {}) {
  const { maxHistory = 50, timeout = 30000 } = options;
  const [history, setHistory] = useState<UndoableAction[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const addAction = useCallback(
    (action: UndoableAction) => {
      setHistory((prev) => {
        const newHistory = prev.slice(0, currentIndex + 1);
        newHistory.push(action);
        if (newHistory.length > maxHistory) {
          newHistory.shift();
        }
        return newHistory;
      });
      setCurrentIndex((prev) => Math.min(prev + 1, maxHistory - 1));

      // Clear previous timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Set new timeout to expire the action
      timeoutRef.current = setTimeout(() => {
        setHistory((prev) => prev.filter((a) => a.id !== action.id));
      }, timeout);
    },
    [currentIndex, maxHistory, timeout],
  );

  const undo = useCallback(() => {
    if (currentIndex > 0) {
      const action = history[currentIndex];
      action.undo();
      setCurrentIndex((prev) => prev - 1);
    }
  }, [history, currentIndex]);

  const redo = useCallback(() => {
    if (currentIndex < history.length - 1) {
      const action = history[currentIndex + 1];
      action.redo?.();
      setCurrentIndex((prev) => prev + 1);
    }
  }, [history, currentIndex]);

  const canUndo = currentIndex >= 0;
  const canRedo = currentIndex < history.length - 1;
  const lastAction = canUndo ? history[currentIndex] : null;

  return {
    addAction,
    undo,
    redo,
    canUndo,
    canRedo,
    lastAction,
    history: history.slice(0, currentIndex + 1),
  };
}
