import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Inline the pure validation logic so the test has no React/DOM dependencies.
// This mirrors the implementation in StellarSpendDashboard exactly.
// ---------------------------------------------------------------------------

const MIN_XLM_RESERVE = 3;
const ESTIMATED_GAS = 2.5;

function parseBalance(raw: string | null): number {
  if (!raw) return 0;
  return Number(raw.replace(/,/g, ''));
}

function checkBalance(
  payload: { amount: string; feeMethod: 'USDC' | 'XLM' },
  usdcBalance: string | null,
  xlmBalance: string | null,
): string | null {
  const usdc = parseBalance(usdcBalance);
  const needed = Number(payload.amount);

  if (!isNaN(needed) && needed > usdc) {
    return `Insufficient USDC balance. You have ${usdcBalance ?? '0'} USDC but are trying to send ${payload.amount} USDC.`;
  }

  if (payload.feeMethod === 'XLM') {
    const xlm = parseBalance(xlmBalance);
    const required = MIN_XLM_RESERVE + ESTIMATED_GAS;
    if (xlm < required) {
      return `Insufficient XLM for gas. You need at least ${required} XLM (Reserve + Gas) but have ${xlmBalance ?? '0'} XLM. Try switching to USDC fee payment.`;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------

describe('Pre-flight balance validation', () => {
  it('blocks trade when USDC balance is insufficient', () => {
    const err = checkBalance({ amount: '100', feeMethod: 'USDC' }, '50.00', '10.00');
    expect(err).toMatch(/Insufficient USDC balance/);
    expect(err).toMatch(/50\.00 USDC/);
    expect(err).toMatch(/100 USDC/);
  });

  it('blocks trade when USDC balance is insufficient (comma-formatted balance)', () => {
    const err = checkBalance({ amount: '2000', feeMethod: 'USDC' }, '1,500.00', '10.00');
    expect(err).toMatch(/Insufficient USDC balance/);
  });

  it('blocks trade when XLM balance is below reserve + gas', () => {
    const err = checkBalance({ amount: '10', feeMethod: 'XLM' }, '100.00', '4.00');
    expect(err).toMatch(/Insufficient XLM for gas/);
    expect(err).toMatch(/5\.5 XLM/);
    expect(err).toMatch(/4\.00 XLM/);
    expect(err).toMatch(/USDC fee payment/);
  });

  it('blocks trade when XLM balance is zero', () => {
    const err = checkBalance({ amount: '10', feeMethod: 'XLM' }, '100.00', '0.00');
    expect(err).toMatch(/Insufficient XLM for gas/);
  });

  it('allows trade when USDC and XLM balances are sufficient', () => {
    const err = checkBalance({ amount: '50', feeMethod: 'XLM' }, '100.00', '10.00');
    expect(err).toBeNull();
  });

  it('allows trade when USDC fee method and balance is sufficient', () => {
    const err = checkBalance({ amount: '50', feeMethod: 'USDC' }, '100.00', '0.00');
    expect(err).toBeNull();
  });

  it('skips XLM check when feeMethod is USDC', () => {
    // XLM balance is 0 but feeMethod is USDC — should not block on XLM
    const err = checkBalance({ amount: '10', feeMethod: 'USDC' }, '100.00', '0.00');
    expect(err).toBeNull();
  });

  it('treats null balances as 0 and blocks the trade', () => {
    const err = checkBalance({ amount: '1', feeMethod: 'XLM' }, null, null);
    // USDC null → 0, amount 1 > 0 → USDC error fires first
    expect(err).toMatch(/Insufficient USDC balance/);
  });
});
