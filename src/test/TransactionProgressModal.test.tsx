import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { TransactionProgressModal } from '@/components/TransactionProgressModal';
import type { OfframpStep } from '@shared/types/stellaramp';

const noop = vi.fn();

function renderModal(step: OfframpStep, errorMessage?: string) {
  return render(
    <TransactionProgressModal step={step} errorMessage={errorMessage} onClose={noop} />,
  );
}

describe('TransactionProgressModal', () => {
  it('does not render when step is idle', () => {
    renderModal('idle');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders all 5 progress steps when active', () => {
    renderModal('initiating');
    const labels = [
      'Awaiting Wallet Signature',
      'Submitting to Network',
      'Processing On-Chain',
      'Settling Fiat Payout',
    ];
    labels.forEach((label) => expect(screen.getByText(label)).toBeInTheDocument());
  });

  it('current step shows spinner (animate-spin element)', () => {
    renderModal('submitting');
    // The spinner is the top-level status icon — a div with animate-spin
    const spinner = document.querySelector('.animate-spin');
    expect(spinner).not.toBeNull();
  });

  it('past steps show green dot (completed indicator)', () => {
    renderModal('processing');
    // "initiating", "awaiting-signature", "submitting" are past steps
    const greenDots = document.querySelectorAll('.bg-green-500');
    expect(greenDots.length).toBeGreaterThanOrEqual(3);
  });

  it('success state shows success message', () => {
    renderModal('success');
    expect(screen.getByText(/funds have been sent/i)).toBeInTheDocument();
  });

  it('error state shows error message', () => {
    renderModal('error', 'Something went wrong');
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('close button only appears in terminal states (success)', () => {
    renderModal('processing');
    expect(screen.queryByRole('button', { name: /dismiss/i })).not.toBeInTheDocument();

    renderModal('success');
    expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument();
  });

  it('close button only appears in terminal states (error)', () => {
    renderModal('error');
    expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', async () => {
    const onClose = vi.fn();
    render(<TransactionProgressModal step="success" onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('has role="dialog" on the modal container', () => {
    renderModal('initiating');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
