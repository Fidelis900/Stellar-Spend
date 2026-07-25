import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Input, inputVariants } from '../Input';

describe('Input (cva variants)', () => {
  it('defaults to the default/md variant', () => {
    render(<Input placeholder="email" />);
    const input = screen.getByPlaceholderText('email');
    expect(input.className).toContain('border-gray-300');
    expect(input.className).toContain('px-3');
  });

  it('applies error styling and marks the field invalid for assistive tech', () => {
    render(<Input variant="error" placeholder="email" />);
    const input = screen.getByPlaceholderText('email');
    expect(input.className).toContain('border-red-500');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it.each([
    ['sm', 'px-2.5'],
    ['md', 'px-3'],
    ['lg', 'px-4'],
  ] as const)('applies the %s size classes', (inputSize, expected) => {
    render(<Input inputSize={inputSize} placeholder="x" />);
    expect(screen.getByPlaceholderText('x').className).toContain(expected);
  });

  it('does not force aria-invalid on the default variant', () => {
    render(<Input placeholder="x" />);
    expect(screen.getByPlaceholderText('x')).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('forwards value changes', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Input placeholder="x" onChange={onChange} />);
    await user.type(screen.getByPlaceholderText('x'), 'hi');
    expect(onChange).toHaveBeenCalled();
  });

  it('exposes inputVariants as a standalone class generator', () => {
    expect(inputVariants({ variant: 'error' })).toContain('border-red-500');
  });
});
