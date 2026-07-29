'use client';

import { useToast } from '@/contexts/ToastContext';

export function ToastContainer() {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none"
      role="region"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`
            pointer-events-auto px-4 py-3 rounded border min-w-[300px] max-w-[400px]
            animate-scale-in shadow-lg backdrop-blur-sm
            ${
              toast.type === 'success'
                ? 'bg-green-900/80 border-green-600 text-green-100'
                : toast.type === 'error'
                  ? 'bg-red-900/80 border-red-600 text-red-100'
                  : toast.type === 'warning'
                    ? 'bg-yellow-900/80 border-yellow-600 text-yellow-100'
                    : 'bg-panel/80 border-line text-text'
            }
          `}
          role="alert"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm flex-1">{toast.message}</p>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-current opacity-70 hover:opacity-100 transition-opacity"
              aria-label="Close notification"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M12 4L4 12M4 4L12 12"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
