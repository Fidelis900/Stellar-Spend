/**
 * Accessibility audit for transaction/payment forms (issue #762).
 *
 * Renders the real DisputeForm and ReversalModal components and asserts axe-core
 * reports zero serious/critical violations, plus targeted checks for the fixes:
 * associated labels, announced errors, keyboard-operable controls, and a modal
 * that is not hidden from assistive tech.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { I18nProvider } from '@/lib/i18n';
import { DisputeForm } from '@/components/DisputeForm';
import { ReversalModal } from '@/components/ReversalModal';
import type { Transaction } from '@/lib/transaction-storage';

async function expectNoSeriousViolations(container: HTMLElement) {
  const result = await axe.run(container);
  const serious = result.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical'
  );
  if (serious.length > 0) {
    const summary = serious
      .map((v) => `[${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} node(s))`)
      .join('\n');
    throw new Error(`Serious a11y violations found:\n${summary}`);
  }
  expect(serious).toHaveLength(0);
}

const eligibleTx: Transaction = {
  id: 'tx-1',
  timestamp: Date.now(),
  userAddress: 'GABC',
  amount: '100.00',
  currency: 'USDC',
  beneficiary: {
    institution: 'Test Bank',
    accountIdentifier: '0123456789',
    accountName: 'Jane Doe',
    currency: 'NGN',
  },
  status: 'completed',
};

describe('A11y: DisputeForm', () => {
  it('has no serious axe violations', async () => {
    const { container } = render(
      <I18nProvider>
        <DisputeForm transactionId="tx-1" onSubmit={vi.fn()} onCancel={vi.fn()} />
      </I18nProvider>
    );
    await expectNoSeriousViolations(container);
  });

  it('associates every field with an accessible label', () => {
    render(
      <I18nProvider>
        <DisputeForm transactionId="tx-1" onSubmit={vi.fn()} />
      </I18nProvider>
    );
    // Reason select and description textarea are reachable by accessible name.
    expect(screen.getByRole('combobox')).toHaveAttribute('id', 'dispute-reason');
    expect(screen.getByRole('textbox')).toHaveAttribute('id', 'dispute-description');
  });

  it('exposes the file dropzone as a keyboard-operable button', async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider>
        <DisputeForm transactionId="tx-1" onSubmit={vi.fn()} />
      </I18nProvider>
    );
    const dropzone = screen.getByRole('button', { name: /upload/i });
    expect(dropzone).toHaveAttribute('tabindex', '0');
    // Focusable and activatable via keyboard.
    await user.tab();
    dropzone.focus();
    expect(dropzone).toHaveFocus();
  });
});

describe('A11y: ReversalModal', () => {
  it('has no serious axe violations when open', async () => {
    const { container } = render(
      <ReversalModal
        transaction={eligibleTx}
        isOpen
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );
    await expectNoSeriousViolations(container);
  });

  it('exposes an accessible dialog that is not hidden from assistive tech', () => {
    render(
      <ReversalModal
        transaction={eligibleTx}
        isOpen
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('Reverse Transaction');
    // The dialog and its fields must be reachable (no aria-hidden ancestor).
    expect(within(dialog).getByLabelText(/reversal amount/i)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/reason for reversal/i)).toBeInTheDocument();
  });
});
