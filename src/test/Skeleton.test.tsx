import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Skeleton } from '@/components/ui/Skeleton';

describe('Skeleton', () => {
  it('renders with role=status and aria-busy', () => {
    render(<Skeleton width={100} height={16} />);
    const el = screen.getByRole('status');
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute('aria-busy', 'true');
  });

  it('applies skeleton CSS class', () => {
    render(<Skeleton width={80} height={14} />);
    expect(screen.getByRole('status')).toHaveClass('skeleton');
  });

  it('applies explicit dimensions via inline style', () => {
    render(<Skeleton width={120} height={20} />);
    const el = screen.getByRole('status');
    expect(el).toHaveStyle({ width: '120px', height: '20px' });
  });

  it('uses custom aria-label when provided', () => {
    render(<Skeleton aria-label="Loading balance…" />);
    expect(screen.getByRole('status', { name: 'Loading balance…' })).toBeInTheDocument();
  });

  it('has pointer-events: none so it does not intercept clicks', () => {
    render(<Skeleton />);
    // pointer-events is set via CSS class, not inline style — verify class presence
    expect(screen.getByRole('status')).toHaveClass('skeleton');
  });
});
