'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface AccessibleFormFieldProps {
  id: string;
  label: string;
  description?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

export function AccessibleFormField({
  id,
  label,
  description,
  error,
  required,
  children,
  className,
}: AccessibleFormFieldProps) {
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;

  return (
    <div className={cn('space-y-2', className)}>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
        {required && (
          <span className="text-red-500 ml-1" aria-label="required">
            *
          </span>
        )}
      </label>

      {description && (
        <p id={descriptionId} className="text-xs text-gray-600 dark:text-gray-400">
          {description}
        </p>
      )}

      <div aria-describedby={description ? descriptionId : error ? errorId : undefined}>
        {children}
      </div>

      {error && (
        <p id={errorId} className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

interface AccessibleButtonProps {
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  variant?: 'primary' | 'secondary' | 'danger';
  type?: 'button' | 'submit' | 'reset';
}

export function AccessibleButton({
  onClick,
  children,
  disabled = false,
  ariaLabel,
  ariaDescription,
  className,
  variant = 'primary',
  type = 'button',
}: AccessibleButtonProps) {
  const variantClasses = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white',
    secondary:
      'bg-gray-200 hover:bg-gray-300 text-gray-900 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white',
    danger: 'bg-red-600 hover:bg-red-700 text-white',
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-description={ariaDescription}
      className={cn(
        'px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
        variantClasses[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}

interface AccessibleAlertProps {
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  onClose?: () => void;
}

export function AccessibleAlert({ type, title, message, onClose }: AccessibleAlertProps) {
  const typeClasses = {
    success:
      'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-900 dark:text-green-200',
    error:
      'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-900 dark:text-red-200',
    warning:
      'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 text-yellow-900 dark:text-yellow-200',
    info: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-200',
  };

  const roleMap = {
    success: 'status' as const,
    error: 'alert' as const,
    warning: 'alert' as const,
    info: 'status' as const,
  };

  return (
    <div
      role={roleMap[type]}
      aria-live="polite"
      aria-atomic="true"
      className={cn('border p-4 rounded-lg', typeClasses[type])}
    >
      <h3 className="font-semibold mb-1">{title}</h3>
      <p className="text-sm">{message}</p>
      {onClose && (
        <button
          onClick={onClose}
          className="mt-2 text-sm font-medium underline hover:no-underline"
          aria-label={`Close ${type} alert`}
        >
          Dismiss
        </button>
      )}
    </div>
  );
}
