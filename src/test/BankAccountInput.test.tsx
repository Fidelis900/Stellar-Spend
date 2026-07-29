import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { BankAccountInput, BankField } from '@/components/BankAccountInput';

const noop = vi.fn();

describe('BankField', () => {
  it('renders label and input', () => {
    render(<BankField type="account" value="" onChange={noop} />);
    expect(screen.getByLabelText(/account number/i)).toBeInTheDocument();
  });

  it('shows error message after blur with invalid value', async () => {
    render(<BankField type="account" value="ab" onChange={noop} />);
    await userEvent.tab(); // focus then blur
    const input = screen.getByRole('textbox');
    await userEvent.click(input);
    await userEvent.tab();
    expect(screen.queryByRole('alert')).toBeInTheDocument();
  });

  it('shows success checkmark for valid account number after blur', async () => {
    const { rerender } = render(<BankField type="account" value="" onChange={noop} />);
    const input = screen.getByRole('textbox');
    await userEvent.click(input);
    rerender(<BankField type="account" value="0123456789" onChange={noop} />);
    await userEvent.tab();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('respects disabled prop', () => {
    render(<BankField type="account" value="" onChange={noop} disabled />);
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('renders routing number field with correct placeholder', () => {
    render(<BankField type="routing" value="" onChange={noop} />);
    expect(screen.getByPlaceholderText(/9-digit/i)).toBeInTheDocument();
  });

  it('renders IBAN field with correct placeholder', () => {
    render(<BankField type="iban" value="" onChange={noop} />);
    expect(screen.getByPlaceholderText(/GB29/i)).toBeInTheDocument();
  });
});

describe('BankAccountInput', () => {
  const baseProps = {
    mode: 'local' as const,
    onModeChange: noop,
    accountNumber: '',
    onAccountNumberChange: noop,
  };

  it('renders mode tabs', () => {
    render(<BankAccountInput {...baseProps} />);
    expect(screen.getByText('Local')).toBeInTheDocument();
    expect(screen.getByText('US (ABA)')).toBeInTheDocument();
    expect(screen.getByText('IBAN')).toBeInTheDocument();
  });

  it('calls onModeChange when a tab is clicked', async () => {
    const onModeChange = vi.fn();
    render(<BankAccountInput {...baseProps} onModeChange={onModeChange} />);
    await userEvent.click(screen.getByText('IBAN'));
    expect(onModeChange).toHaveBeenCalledWith('iban');
  });

  it('shows account field in local mode', () => {
    render(<BankAccountInput {...baseProps} mode="local" />);
    expect(screen.getByLabelText(/account number/i)).toBeInTheDocument();
  });

  it('shows routing + account fields in US mode', () => {
    render(
      <BankAccountInput {...baseProps} mode="us" routingNumber="" onRoutingNumberChange={noop} />,
    );
    expect(screen.getByLabelText(/routing number/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/account number/i)).toBeInTheDocument();
  });

  it('shows IBAN field in iban mode', () => {
    render(<BankAccountInput {...baseProps} mode="iban" iban="" onIbanChange={noop} />);
    expect(screen.getByLabelText(/iban/i)).toBeInTheDocument();
  });
});
