import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button, buttonVariants } from '../Button';

describe('Button (cva variants)', () => {
  it('renders children and defaults to the primary/md variant', () => {
    render(<Button>Save</Button>);
    const btn = screen.getByRole('button', { name: 'Save' });
    expect(btn.className).toContain('bg-blue-600');
    expect(btn.className).toContain('px-4');
  });

  it.each([
    ['primary', 'bg-blue-600'],
    ['secondary', 'bg-gray-200'],
    ['danger', 'bg-red-600'],
    ['ghost', 'bg-transparent'],
  ] as const)('applies the %s variant classes', (variant, expected) => {
    render(<Button variant={variant}>x</Button>);
    expect(screen.getByRole('button').className).toContain(expected);
  });

  it.each([
    ['sm', 'px-3'],
    ['md', 'px-4'],
    ['lg', 'px-6'],
  ] as const)('applies the %s size classes', (size, expected) => {
    render(<Button size={size}>x</Button>);
    expect(screen.getByRole('button').className).toContain(expected);
  });

  it('shows a loading indicator and disables the button while loading', () => {
    render(<Button isLoading>Submit</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent('...');
  });

  it('merges caller className with the variant classes', () => {
    render(<Button className="w-full">x</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('w-full');
    expect(btn.className).toContain('bg-blue-600');
  });

  it('forwards clicks when enabled and blocks them when disabled', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<Button onClick={onClick}>x</Button>);
    await user.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(
      <Button onClick={onClick} disabled>
        x
      </Button>
    );
    await user.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('exposes buttonVariants as a standalone class generator', () => {
    expect(buttonVariants({ variant: 'danger', size: 'lg' })).toContain('bg-red-600');
    expect(buttonVariants({ variant: 'danger', size: 'lg' })).toContain('px-6');
  });
});
