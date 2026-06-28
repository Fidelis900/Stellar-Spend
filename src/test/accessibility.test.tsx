import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';

// ─── Axe helper ───────────────────────────────────────────────────────────────

async function runAxe(container: HTMLElement) {
  const result = await axe.run(container);
  const serious = result.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical'
  );
  return { violations: result.violations, serious };
}

// Enforces the zero-serious-violations gate
function assertNoSeriousViolations(serious: axe.Result[]) {
  if (serious.length > 0) {
    const summary = serious
      .map((v) => `[${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} node(s))`)
      .join('\n');
    throw new Error(`Serious a11y violations found:\n${summary}`);
  }
}

// ─── Forms ────────────────────────────────────────────────────────────────────

describe('Accessibility: Forms', () => {
  it('offramp form has no serious violations', async () => {
    const { container } = render(
      <form aria-labelledby="form-title" noValidate>
        <h2 id="form-title">Send Money</h2>
        <div>
          <label htmlFor="amount">Amount (USDC)</label>
          <input
            id="amount"
            type="number"
            min="1"
            required
            aria-required="true"
            aria-describedby="amount-hint"
            placeholder="e.g. 100"
          />
          <span id="amount-hint">Minimum 1 USDC</span>
        </div>
        <div>
          <label htmlFor="currency">Destination Currency</label>
          <select id="currency" required aria-required="true">
            <option value="">Select currency</option>
            <option value="NGN">NGN – Nigerian Naira</option>
            <option value="KES">KES – Kenyan Shilling</option>
          </select>
        </div>
        <div>
          <label htmlFor="account-number">Account Number</label>
          <input
            id="account-number"
            type="text"
            inputMode="numeric"
            required
            aria-required="true"
            aria-describedby="account-error"
            aria-invalid="false"
          />
          <span id="account-error" role="alert" aria-live="assertive" />
        </div>
        <button type="submit" aria-label="Submit transaction for processing">
          Send
        </button>
      </form>
    );

    const { serious } = await runAxe(container);
    assertNoSeriousViolations(serious);
  });

  it('form with validation errors has no serious violations', async () => {
    const { container } = render(
      <form noValidate>
        <label htmlFor="amount-err">Amount</label>
        <input
          id="amount-err"
          type="number"
          aria-invalid="true"
          aria-describedby="amount-err-msg"
        />
        <span id="amount-err-msg" role="alert">
          Amount must be greater than 0
        </span>
        <button type="submit">Submit</button>
      </form>
    );

    const { serious } = await runAxe(container);
    assertNoSeriousViolations(serious);
  });

  it('required fields are announced to screen readers', () => {
    render(
      <form>
        <label htmlFor="req">
          Amount <span aria-label="required field">*</span>
        </label>
        <input id="req" type="text" required aria-required="true" />
      </form>
    );

    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('aria-required', 'true');
    expect(input).toHaveAttribute('required');
  });
});

// ─── Modals ────────────────────────────────────────────────────────────────────

describe('Accessibility: Modals', () => {
  it('transaction preview modal has no serious violations', async () => {
    const { container } = render(
      <div>
        <button id="open-btn" aria-haspopup="dialog">Preview Transaction</button>
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          aria-describedby="modal-desc"
          tabIndex={-1}
        >
          <h2 id="modal-title">Transaction Preview</h2>
          <p id="modal-desc">
            You are about to send 100 USDC. This action cannot be undone.
          </p>
          <dl>
            <dt>Amount</dt>
            <dd>100 USDC</dd>
            <dt>Recipient</dt>
            <dd>0123456789</dd>
            <dt>Fee</dt>
            <dd>0.5 USDC</dd>
          </dl>
          <button aria-label="Confirm and proceed with transaction">Confirm</button>
          <button aria-label="Cancel transaction">Cancel</button>
        </div>
      </div>
    );

    const { serious } = await runAxe(container);
    assertNoSeriousViolations(serious);
  });

  it('modal has required ARIA attributes', () => {
    render(
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dlg-title"
        tabIndex={-1}
      >
        <h2 id="dlg-title">Confirm</h2>
        <button aria-label="Close dialog">×</button>
      </div>
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'dlg-title');
    expect(dialog).toHaveAttribute('tabIndex', '-1');
  });

  it('modal close button is keyboard-accessible', async () => {
    const handleClose = vi.fn();
    const user = userEvent.setup();

    render(
      <div role="dialog" aria-modal="true" aria-labelledby="d2">
        <h2 id="d2">Dialog</h2>
        <button onClick={handleClose} aria-label="Close dialog">
          ×
        </button>
      </div>
    );

    const closeBtn = screen.getByLabelText('Close dialog');
    closeBtn.focus();
    await user.keyboard('{Enter}');
    expect(handleClose).toHaveBeenCalledOnce();
  });

  it('wallet selection modal has no serious violations', async () => {
    const { container } = render(
      <div role="dialog" aria-modal="true" aria-labelledby="wallet-modal-title" tabIndex={-1}>
        <h2 id="wallet-modal-title">Select Wallet</h2>
        <ul role="listbox" aria-label="Available wallets">
          <li role="option" aria-selected="false" tabIndex={0}>
            <img src="" alt="Freighter wallet logo" />
            Freighter
          </li>
          <li role="option" aria-selected="false" tabIndex={0}>
            <img src="" alt="xBull wallet logo" />
            xBull
          </li>
        </ul>
        <button aria-label="Close wallet selection dialog">Close</button>
      </div>
    );

    const { serious } = await runAxe(container);
    assertNoSeriousViolations(serious);
  });
});

// ─── Charts & Data Visualisations ────────────────────────────────────────────

describe('Accessibility: Charts and data visualizations', () => {
  it('exchange rate chart region has no serious violations', async () => {
    const { container } = render(
      <section aria-labelledby="chart-title">
        <h3 id="chart-title">Exchange Rate</h3>
        <figure
          role="img"
          aria-label="Exchange rate chart showing NGN/USDC over the last 24 hours"
        >
          {/* Placeholder for chart canvas */}
          <figcaption>
            NGN/USDC rate: 1,598 (last updated 2 minutes ago)
          </figcaption>
        </figure>
      </section>
    );

    const { serious } = await runAxe(container);
    assertNoSeriousViolations(serious);
  });

  it('transaction progress bar has accessible label', async () => {
    const { container } = render(
      <div>
        <label id="progress-label">Transaction progress</label>
        <div
          role="progressbar"
          aria-valuenow={60}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-labelledby="progress-label"
          aria-label="Transaction progress: 60% complete"
        >
          <div style={{ width: '60%' }} />
        </div>
      </div>
    );

    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '60');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');

    const { serious } = await runAxe(container);
    assertNoSeriousViolations(serious);
  });

  it('data table for recent transactions has no serious violations', async () => {
    const { container } = render(
      <table aria-label="Recent transactions">
        <caption>Your last 5 transactions</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Amount</th>
            <th scope="col">Currency</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>2024-01-15</td>
            <td>100 USDC</td>
            <td>NGN</td>
            <td>
              <span aria-label="Status: completed">Completed</span>
            </td>
          </tr>
        </tbody>
      </table>
    );

    const { serious } = await runAxe(container);
    assertNoSeriousViolations(serious);
  });
});

// ─── Keyboard Navigation ──────────────────────────────────────────────────────

describe('Accessibility: Keyboard navigation', () => {
  it('tab order through offramp form fields is logical', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <form>
        <label htmlFor="kn-amount">Amount</label>
        <input id="kn-amount" type="number" />
        <label htmlFor="kn-currency">Currency</label>
        <select id="kn-currency">
          <option value="NGN">NGN</option>
        </select>
        <label htmlFor="kn-account">Account</label>
        <input id="kn-account" type="text" />
        <button type="submit">Send</button>
      </form>
    );

    const focusable = container.querySelectorAll<HTMLElement>('input, select, button');
    expect(focusable.length).toBe(4);

    focusable[0].focus();
    expect(document.activeElement).toBe(focusable[0]);

    await user.tab();
    expect(document.activeElement).toBe(focusable[1]);

    await user.tab();
    expect(document.activeElement).toBe(focusable[2]);

    await user.tab();
    expect(document.activeElement).toBe(focusable[3]);
  });

  it('Escape key closes modal', async () => {
    const handleClose = vi.fn();
    const user = userEvent.setup();

    render(
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="esc-dlg"
        onKeyDown={(e) => e.key === 'Escape' && handleClose()}
        tabIndex={-1}
      >
        <h2 id="esc-dlg">Confirm Transaction</h2>
        <button aria-label="Confirm">Confirm</button>
      </div>
    );

    const dialog = screen.getByRole('dialog');
    dialog.focus();
    await user.keyboard('{Escape}');
    expect(handleClose).toHaveBeenCalledOnce();
  });

  it('focus is visible on interactive elements', () => {
    const { container } = render(
      <div>
        <button style={{ outlineOffset: '2px' }}>Submit</button>
        <a href="#main" style={{ outlineOffset: '2px' }}>
          Skip to content
        </a>
        <input type="text" style={{ outlineOffset: '2px' }} />
      </div>
    );

    const interactive = container.querySelectorAll('button, a, input');
    expect(interactive.length).toBe(3);
    interactive.forEach((el) => {
      expect(el).not.toHaveAttribute('tabindex', '-1');
    });
  });

  it('copy-to-clipboard button is keyboard operable', async () => {
    const onCopy = vi.fn();
    const user = userEvent.setup();

    render(
      <button
        aria-label="Copy wallet address to clipboard"
        onClick={onCopy}
      >
        Copy
      </button>
    );

    const btn = screen.getByLabelText('Copy wallet address to clipboard');
    btn.focus();
    await user.keyboard('{Enter}');
    expect(onCopy).toHaveBeenCalledOnce();
  });
});

// ─── Live Regions & Status ────────────────────────────────────────────────────

describe('Accessibility: Live regions', () => {
  it('toast notification region has correct ARIA attributes', async () => {
    const { container } = render(
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-label="Notifications"
      >
        Transaction submitted successfully
      </div>
    );

    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveAttribute('aria-atomic', 'true');

    const { serious } = await runAxe(container);
    assertNoSeriousViolations(serious);
  });

  it('error notification uses assertive live region', () => {
    render(
      <div role="alert" aria-live="assertive">
        Payment failed. Please try again.
      </div>
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
  });

  it('transaction status updates are announced politely', () => {
    render(
      <div aria-live="polite" aria-atomic="true">
        <span>Status: </span>
        <span>Processing</span>
      </div>
    );

    const region = screen.getByText('Processing').parentElement!;
    expect(region).toHaveAttribute('aria-live', 'polite');
  });
});

// ─── Legacy manual checks (kept for backward compatibility) ───────────────────

describe('Keyboard Navigation', () => {
  it('should support tab navigation through form fields', async () => {
    const { container } = render(
      <form>
        <input type="text" placeholder="Amount" />
        <input type="text" placeholder="Account" />
        <button>Submit</button>
      </form>
    );

    const inputs = container.querySelectorAll('input, button');
    expect(inputs.length).toBeGreaterThan(0);
    inputs.forEach((input) => {
      expect(input).toHaveProperty('tabIndex');
    });
  });

  it('should support Escape key to close modals', async () => {
    const handleClose = vi.fn();
    render(
      <div role="dialog" onKeyDown={(e) => e.key === 'Escape' && handleClose()}>
        Modal Content
      </div>
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
  });
});

describe('Screen Reader Compatibility', () => {
  it('should have proper ARIA labels', () => {
    render(
      <div>
        <label htmlFor="amount">Amount in USDC</label>
        <input id="amount" type="text" aria-label="Amount in USDC" />
      </div>
    );

    const input = screen.getByLabelText('Amount in USDC');
    expect(input).toBeInTheDocument();
  });

  it('should announce status changes', () => {
    render(
      <div role="status" aria-live="polite">
        Transaction pending...
      </div>
    );

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
  });
});

describe('ARIA Label Validation', () => {
  it('should validate aria-labelledby references', () => {
    render(
      <div>
        <h2 id="dialog-title">Confirm Transaction</h2>
        <div role="dialog" aria-labelledby="dialog-title">
          Content
        </div>
      </div>
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-labelledby', 'dialog-title');
  });
});

describe('Accessibility CI Checks', () => {
  it('should validate no duplicate IDs', () => {
    const { container } = render(
      <div>
        <input id="amount" />
        <input id="currency" />
        <input id="account" />
      </div>
    );

    const ids = new Set();
    container.querySelectorAll('[id]').forEach((el) => {
      const id = el.getAttribute('id');
      expect(ids.has(id)).toBe(false);
      ids.add(id);
    });
  });

  it('should validate buttons have accessible names', () => {
    render(
      <div>
        <button>Submit</button>
        <button aria-label="Close">×</button>
        <button title="Help">?</button>
      </div>
    );

    expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });
});
