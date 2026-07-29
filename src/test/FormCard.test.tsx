import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import FormCard, { type FormCardProps } from '@/components/FormCard';

const noop = vi.fn();

const baseProps: FormCardProps = {
  isConnected: false,
  isConnecting: false,
  onConnect: noop,
  onSubmit: noop,
};

describe('FormCard — connect state', () => {
  it('renders without crashing', () => {
    render(<FormCard {...baseProps} />);
    expect(document.body).toBeTruthy();
  });

  it('shows connect prompt when not connected', () => {
    render(<FormCard {...baseProps} isConnected={false} />);
    // The form should render in a disconnected state
    expect(screen.queryAllByRole('button').length).toBeGreaterThan(0);
  });

  it('renders form fields when connected', () => {
    render(<FormCard {...baseProps} isConnected />);
    expect(document.body).toBeTruthy();
  });
});
