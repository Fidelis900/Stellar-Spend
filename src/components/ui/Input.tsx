import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

/**
 * Single source of truth for text-input styling (issue #761).
 *
 * Replaces per-feature, hand-rolled input classes with one `cva` definition.
 * Callers choose a look through the `variant` / `inputSize` props.
 */
export const inputVariants = cva(
  'w-full rounded-lg border bg-white text-gray-900 placeholder:text-gray-400 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed',
  {
    variants: {
      variant: {
        default: 'border-gray-300 focus:border-blue-500 focus:ring-blue-500',
        error: 'border-red-500 focus:border-red-500 focus:ring-red-500',
      },
      inputSize: {
        sm: 'px-2.5 py-1.5 text-sm',
        md: 'px-3 py-2 text-base',
        lg: 'px-4 py-3 text-lg',
      },
    },
    defaultVariants: {
      variant: 'default',
      inputSize: 'md',
    },
  }
);

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>,
    VariantProps<typeof inputVariants> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, variant, inputSize, ...props }, ref) => (
    <input
      ref={ref}
      aria-invalid={variant === 'error' ? true : props['aria-invalid']}
      className={cn(inputVariants({ variant, inputSize }), className)}
      {...props}
    />
  )
);

Input.displayName = 'Input';
