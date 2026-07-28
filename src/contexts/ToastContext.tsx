'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastStateContextValue {
  toasts: Toast[];
}

interface ToastActionContextValue {
  showToast: (message: string, type?: ToastType) => void;
  removeToast: (id: string) => void;
}

const ToastStateContext = createContext<ToastStateContextValue | undefined>(undefined);
const ToastActionContext = createContext<ToastActionContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastStateContext.Provider value={{ toasts }}>
      <ToastActionContext.Provider value={{ showToast, removeToast }}>
        {children}
      </ToastActionContext.Provider>
    </ToastStateContext.Provider>
  );
}

export function useToasts() {
  const context = useContext(ToastStateContext);
  if (!context) {
    throw new Error('useToasts must be used within ToastProvider');
  }
  return context.toasts;
}

export function useToastActions() {
  const context = useContext(ToastActionContext);
  if (!context) {
    throw new Error('useToastActions must be used within ToastProvider');
  }
  return context;
}

export function useToast() {
  const toasts = useToasts();
  const actions = useToastActions();
  return { toasts, ...actions };
}
