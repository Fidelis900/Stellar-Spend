import { describe, it, expect } from 'vitest';
import {
  calculateBridgeFee,
  calculateNetworkFee,
  calculatePaycrestFee,
  calculateTotalFees,
  calculateAmountAfterFees,
  calculateAllFees,
  getDetailedFeeBreakdown,
} from '@/lib/fee-calculation';

describe('calculateBridgeFee', () => {
  it('returns 0 for native fee method', () => {
    expect(calculateBridgeFee('100', 'native')).toBe('0');
  });

  it('calculates 0.5% fee for stablecoin method', () => {
    expect(calculateBridgeFee('100', 'stablecoin')).toBe('0.500000');
  });

  it('calculates fee for large amount', () => {
    expect(calculateBridgeFee('1000', 'stablecoin')).toBe('5.000000');
  });

  it('calculates fee for very large amount', () => {
    expect(calculateBridgeFee('10000000', 'stablecoin')).toBe('50000.000000');
  });

  it('calculates fee for very small amount', () => {
    expect(calculateBridgeFee('0.01', 'stablecoin')).toBe('0.000050');
  });

  it('calculates fee for scientific notation', () => {
    expect(calculateBridgeFee('1e3', 'stablecoin')).toBe('5.000000');
  });

  it('handles decimal precision with many decimals', () => {
    expect(calculateBridgeFee('99.999999', 'stablecoin')).toBe('0.500000');
  });

  it('throws for zero amount', () => {
    expect(() => calculateBridgeFee('0', 'stablecoin')).toThrow('Invalid amount');
  });

  it('throws for negative amount', () => {
    expect(() => calculateBridgeFee('-50', 'stablecoin')).toThrow('Invalid amount');
  });

  it('throws for non-numeric string', () => {
    expect(() => calculateBridgeFee('abc', 'stablecoin')).toThrow('Invalid amount');
  });

  it('throws for empty string', () => {
    expect(() => calculateBridgeFee('', 'stablecoin')).toThrow('Invalid amount');
  });

  it('throws for whitespace string', () => {
    expect(() => calculateBridgeFee('   ', 'stablecoin')).toThrow('Invalid amount');
  });
});

describe('calculateNetworkFee', () => {
  it('returns 0 for stablecoin method', () => {
    expect(calculateNetworkFee('stablecoin')).toBe('0');
  });

  it('returns XLM base fee for native method', () => {
    expect(calculateNetworkFee('native')).toBe('0.00001');
  });
});

describe('calculatePaycrestFee', () => {
  it('calculates 1% fee on receive amount', () => {
    expect(calculatePaycrestFee('100')).toBe('1.00');
  });

  it('calculates fee for large receive amount', () => {
    expect(calculatePaycrestFee('158202')).toBe('1582.02');
  });

  it('calculates fee for very small amount', () => {
    expect(calculatePaycrestFee('0.01')).toBe('0.00');
  });

  it('calculates fee for scientific notation', () => {
    expect(calculatePaycrestFee('1e2')).toBe('1.00');
  });

  it('calculates fee that produces fractional cent', () => {
    expect(calculatePaycrestFee('0.50')).toBe('0.01');
  });

  it('returns 0 for zero amount', () => {
    expect(calculatePaycrestFee('0')).toBe('0');
  });

  it('returns 0 for negative amount', () => {
    expect(calculatePaycrestFee('-100')).toBe('0');
  });

  it('returns 0 for non-numeric string', () => {
    expect(calculatePaycrestFee('abc')).toBe('0');
  });

  it('returns 0 for empty string', () => {
    expect(calculatePaycrestFee('')).toBe('0');
  });
});

describe('calculateTotalFees', () => {
  it('sums all fee components', () => {
    const total = calculateTotalFees('0.5', '0', '1.58', 'NGN');
    expect(parseFloat(total)).toBeCloseTo(2.08, 5);
  });

  it('handles zero fees', () => {
    expect(calculateTotalFees('0', '0', '0', 'NGN')).toBe('0.000000');
  });

  it('handles native fee method (XLM network fee)', () => {
    const total = calculateTotalFees('0', '0.00001', '1.00', 'NGN');
    expect(parseFloat(total)).toBeCloseTo(1.00001, 5);
  });

  it('includes contract resource fee when provided', () => {
    const total = calculateTotalFees('0.5', '0', '1.00', 'NGN', '0.001500');
    expect(parseFloat(total)).toBeCloseTo(1.5015, 5);
  });

  it('handles contractResourceFee as undefined', () => {
    const total = calculateTotalFees('0.5', '0', '1.00', 'NGN');
    expect(parseFloat(total)).toBeCloseTo(1.5, 5);
  });

  it('handles all four components together', () => {
    const total = calculateTotalFees('0.500000', '0.000010', '1.50', 'NGN', '0.002000');
    expect(parseFloat(total)).toBeCloseTo(2.00201, 5);
  });

  it('handles invalid fee values as 0', () => {
    const total = calculateTotalFees('abc', '', 'xyz', 'NGN');
    expect(total).toBe('0.000000');
  });
});

describe('calculateAmountAfterFees', () => {
  it('subtracts fee from amount', () => {
    expect(calculateAmountAfterFees('100', '0.5')).toBe('99.500000');
  });

  it('returns 0 when fee exceeds amount', () => {
    expect(calculateAmountAfterFees('0.1', '1')).toBe('0');
  });

  it('returns 0 when fee equals amount', () => {
    expect(calculateAmountAfterFees('100', '100')).toBe('0');
  });

  it('handles very small difference', () => {
    expect(calculateAmountAfterFees('0.000011', '0.000010')).toBe('0.000001');
  });

  it('handles large numbers', () => {
    expect(calculateAmountAfterFees('10000000', '50000')).toBe('9950000.000000');
  });

  it('throws for non-numeric amount', () => {
    expect(() => calculateAmountAfterFees('abc', '1')).toThrow('Invalid amounts');
  });

  it('throws for non-numeric fee', () => {
    expect(() => calculateAmountAfterFees('100', 'abc')).toThrow('Invalid amounts');
  });

  it('throws for empty string', () => {
    expect(() => calculateAmountAfterFees('', '1')).toThrow('Invalid amounts');
  });
});

describe('calculateAllFees', () => {
  it('returns full fee breakdown for stablecoin method', async () => {
    const result = await calculateAllFees({
      amount: '100',
      currency: 'NGN',
      feeMethod: 'stablecoin',
      receiveAmount: '158202',
    });

    expect(result.bridgeFee).toBe('0.500000');
    expect(result.networkFee).toBe('0');
    expect(result.paycrestFee).toBe('1582.02');
    expect(result.amount).toBe('100');
    expect(result.currency).toBe('NGN');
    expect(parseFloat(result.amountAfterFees)).toBeCloseTo(99.5, 4);
  });

  it('returns full fee breakdown for native method', async () => {
    const result = await calculateAllFees({
      amount: '100',
      currency: 'NGN',
      feeMethod: 'native',
    });

    expect(result.bridgeFee).toBe('0');
    expect(result.networkFee).toBe('0.00001');
    expect(result.paycrestFee).toBe('0');
    expect(result.amountAfterFees).toBe('100.000000');
  });

  it('sets paycrestFee to 0 when receiveAmount is omitted', async () => {
    const result = await calculateAllFees({
      amount: '50',
      currency: 'KES',
      feeMethod: 'stablecoin',
    });
    expect(result.paycrestFee).toBe('0');
  });

  it('includes contract resource fee estimate', async () => {
    const result = await calculateAllFees({
      amount: '100',
      currency: 'NGN',
      feeMethod: 'stablecoin',
      receiveAmount: '100',
      contractResourceEstimate: { estimatedFeeXLM: '0.001500', minResourceFeeXLM: '0.001000' },
    });

    expect(result.contractResourceFee).toBe('0.001500');
    expect(parseFloat(result.totalFee)).toBeCloseTo(1.5015, 5);
  });

  it('handles native method with receive amount', async () => {
    const result = await calculateAllFees({
      amount: '100',
      currency: 'NGN',
      feeMethod: 'native',
      receiveAmount: '50000',
    });

    expect(result.bridgeFee).toBe('0');
    expect(result.networkFee).toBe('0.00001');
    expect(result.paycrestFee).toBe('500.00');
  });

  it('handles very large amounts', async () => {
    const result = await calculateAllFees({
      amount: '9999999.999999',
      currency: 'NGN',
      feeMethod: 'stablecoin',
      receiveAmount: '9999999.999999',
    });

    expect(parseFloat(result.bridgeFee)).toBeCloseTo(49999.999999, 4);
    expect(parseFloat(result.paycrestFee)).toBeCloseTo(100000.0, 0);
  });

  it('preserves contractResourceFee when undefined', async () => {
    const result = await calculateAllFees({
      amount: '100',
      currency: 'NGN',
      feeMethod: 'stablecoin',
    });

    expect(result.contractResourceFee).toBeUndefined();
  });
});

describe('getDetailedFeeBreakdown', () => {
  it('includes breakdown object with bridge, network, and paycrest details', async () => {
    const result = await getDetailedFeeBreakdown({
      amount: '100',
      currency: 'NGN',
      feeMethod: 'stablecoin',
      receiveAmount: '100',
    });

    expect(result.breakdown.bridge.percentage).toBe('0.5%');
    expect(result.breakdown.bridge.description).toContain('USDC');
    expect(result.breakdown.network.fee).toBe('0');
    expect(result.breakdown.network.description).toContain('USDC');
    expect(result.breakdown.paycrest.percentage).toBe('1%');
    expect(result.breakdown.paycrest.description).toContain('Paycrest');
  });

  it('shows 0% bridge percentage for native method', async () => {
    const result = await getDetailedFeeBreakdown({
      amount: '100',
      currency: 'NGN',
      feeMethod: 'native',
    });

    expect(result.breakdown.bridge.percentage).toBe('0%');
    expect(result.breakdown.bridge.description).toContain('XLM');
    expect(result.breakdown.network.fee).toBe('0.00001');
    expect(result.breakdown.network.description).toContain('Stellar');
  });

  it('includes contract resource fee in breakdown', async () => {
    const result = await getDetailedFeeBreakdown({
      amount: '100',
      currency: 'NGN',
      feeMethod: 'stablecoin',
      receiveAmount: '100',
      contractResourceEstimate: { estimatedFeeXLM: '0.001500', minResourceFeeXLM: '0.001000' },
    });

    expect(result.contractResourceFee).toBe('0.001500');
    expect(result.totalFee).toBeDefined();
  });

  it('returns FeeBreakdown fields in returned object', async () => {
    const result = await getDetailedFeeBreakdown({
      amount: '100',
      currency: 'NGN',
      feeMethod: 'stablecoin',
      receiveAmount: '100',
    });

    expect(result).toHaveProperty('totalFee');
    expect(result).toHaveProperty('amountAfterFees');
    expect(result).toHaveProperty('breakdown.bridge');
    expect(result).toHaveProperty('breakdown.network');
    expect(result).toHaveProperty('breakdown.paycrest');
  });
});

describe('property-based: fee idempotency', () => {
  it('bridgeFee + networkFee + paycrestFee = totalFee', async () => {
    const result = await calculateAllFees({
      amount: '1000',
      currency: 'NGN',
      feeMethod: 'stablecoin',
      receiveAmount: '50000',
    });

    const expectedTotal = (
      parseFloat(result.bridgeFee) +
      parseFloat(result.networkFee) +
      parseFloat(result.paycrestFee)
    ).toFixed(6);

    expect(result.totalFee).toBe(expectedTotal);
  });

  it('amount - bridgeFee = amountAfterFees for stablecoin', async () => {
    const result = await calculateAllFees({
      amount: '1000',
      currency: 'NGN',
      feeMethod: 'stablecoin',
    });

    const expectedAfter = (1000 - parseFloat(result.bridgeFee)).toFixed(6);
    expect(result.amountAfterFees).toBe(expectedAfter);
  });

  it('amountAfterFees never exceeds amount', async () => {
    const amounts = ['0.1', '1', '10', '100', '1000', '10000', '0.01', '0.001'];
    for (const amt of amounts) {
      const result = await calculateAllFees({
        amount: amt,
        currency: 'NGN',
        feeMethod: 'stablecoin',
        receiveAmount: amt,
      });
      expect(parseFloat(result.amountAfterFees)).toBeLessThanOrEqual(parseFloat(amt));
    }
  });

  it('totalFee is never negative', () => {
    const fees = calculateTotalFees('0.5', '0.00001', '1.00', 'NGN');
    expect(parseFloat(fees)).toBeGreaterThanOrEqual(0);
  });
});

describe('edge cases and boundary inputs', () => {
  it('handles maximum precision string', () => {
    expect(calculateBridgeFee('0.000001', 'stablecoin')).toBe('0.000000');
  });

  it('handles string with leading zeros', () => {
    expect(calculateBridgeFee('000100', 'stablecoin')).toBe('0.500000');
  });

  it('handles decimal-only string', () => {
    expect(calculateBridgeFee('.5', 'stablecoin')).toBe('0.002500');
  });

  it('handles whitespace padding in amount', () => {
    expect(calculateBridgeFee(' 100 ', 'stablecoin')).toBe('0.500000');
  });
});
