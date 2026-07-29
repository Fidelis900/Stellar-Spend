import { describe, it, expect } from 'vitest';
import {
  getStablecoinConfig,
  getActiveStablecoins,
  isSupportedStablecoin,
  calculateStablecoinBridgeFee,
  SUPPORTED_STABLECOINS,
} from './stablecoins';

describe('SUPPORTED_STABLECOINS', () => {
  it('contains USDC and USDT', () => {
    const symbols = SUPPORTED_STABLECOINS.map((s) => s.symbol);
    expect(symbols).toContain('USDC');
    expect(symbols).toContain('USDT');
  });

  it('all entries have required fields', () => {
    for (const s of SUPPORTED_STABLECOINS) {
      expect(s.symbol).toBeTruthy();
      expect(s.name).toBeTruthy();
      expect(typeof s.decimals).toBe('number');
      expect(s.decimals).toBeGreaterThan(0);
      expect(s.allbridgeSymbol).toBeTruthy();
      expect(s.bridgeFeePercent).toBeGreaterThan(0);
      expect(typeof s.active).toBe('boolean');
    }
  });

  it('both USDC and USDT have 6 decimals', () => {
    for (const s of SUPPORTED_STABLECOINS) {
      expect(s.decimals).toBe(6);
    }
  });

  it('both USDC and USDT use 0.5% bridge fee', () => {
    for (const s of SUPPORTED_STABLECOINS) {
      expect(s.bridgeFeePercent).toBe(0.5);
    }
  });
});

describe('getStablecoinConfig', () => {
  it('returns config for USDC', () => {
    const config = getStablecoinConfig('USDC');
    expect(config).toBeDefined();
    expect(config?.symbol).toBe('USDC');
  });

  it('returns config for USDT', () => {
    const config = getStablecoinConfig('USDT');
    expect(config).toBeDefined();
    expect(config?.symbol).toBe('USDT');
  });

  it('is case-insensitive', () => {
    expect(getStablecoinConfig('usdc')).toBeDefined();
    expect(getStablecoinConfig('Usdc')).toBeDefined();
  });

  it('returns undefined for unknown symbol', () => {
    expect(getStablecoinConfig('DAI')).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(getStablecoinConfig('')).toBeUndefined();
  });

  it('returns undefined for inactive stablecoin', () => {
    const inactive = SUPPORTED_STABLECOINS.find((s) => !s.active);
    if (inactive) {
      expect(getStablecoinConfig(inactive.symbol)).toBeUndefined();
    }
  });
});

describe('getActiveStablecoins', () => {
  it('returns only active stablecoins', () => {
    const active = getActiveStablecoins();
    expect(active.every((s) => s.active)).toBe(true);
    expect(active.length).toBeGreaterThan(0);
  });

  it('includes USDC and USDT', () => {
    const active = getActiveStablecoins();
    const symbols = active.map((s) => s.symbol);
    expect(symbols).toContain('USDC');
    expect(symbols).toContain('USDT');
  });
});

describe('isSupportedStablecoin', () => {
  it('returns true for USDC and USDT', () => {
    expect(isSupportedStablecoin('USDC')).toBe(true);
    expect(isSupportedStablecoin('USDT')).toBe(true);
  });

  it('returns false for unknown symbols', () => {
    expect(isSupportedStablecoin('DAI')).toBe(false);
    expect(isSupportedStablecoin('BUSD')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isSupportedStablecoin('usdc')).toBe(true);
    expect(isSupportedStablecoin('usdt')).toBe(true);
  });

  it('returns false for empty string', () => {
    expect(isSupportedStablecoin('')).toBe(false);
  });
});

describe('calculateStablecoinBridgeFee', () => {
  it('calculates 0.5% fee for USDC', () => {
    expect(calculateStablecoinBridgeFee('USDC', '100')).toBe('0.500000');
  });

  it('calculates fee for USDT', () => {
    expect(calculateStablecoinBridgeFee('USDT', '100')).toBe('0.500000');
  });

  it('calculates fee for large amount', () => {
    expect(calculateStablecoinBridgeFee('USDC', '10000')).toBe('50.000000');
  });

  it('calculates fee for very small amount', () => {
    expect(calculateStablecoinBridgeFee('USDC', '0.01')).toBe('0.000050');
  });

  it('returns 0 for unknown stablecoin', () => {
    expect(calculateStablecoinBridgeFee('DAI', '100')).toBe('0');
  });

  it('returns 0 for zero amount', () => {
    expect(calculateStablecoinBridgeFee('USDC', '0')).toBe('0');
  });

  it('returns 0 for negative amount', () => {
    expect(calculateStablecoinBridgeFee('USDC', '-100')).toBe('0');
  });

  it('returns 0 for non-numeric amount', () => {
    expect(calculateStablecoinBridgeFee('USDC', 'abc')).toBe('0');
  });

  it('handles scientific notation', () => {
    expect(calculateStablecoinBridgeFee('USDC', '1e3')).toBe('5.000000');
  });

  it('handles maximum precision values', () => {
    expect(calculateStablecoinBridgeFee('USDC', '0.000001')).toBe('0.000000');
  });

  it('handles decimal-heavy amount', () => {
    expect(calculateStablecoinBridgeFee('USDC', '99.999999')).toBe('0.500000');
  });

  it('is case-insensitive for symbol', () => {
    expect(calculateStablecoinBridgeFee('usdc', '100')).toBe('0.500000');
  });
});

describe('precision and rounding', () => {
  it('bridge fee is always 6 decimal places', () => {
    const amounts = ['0.01', '0.1', '1', '10', '100', '1000', '0.001', '50.50'];
    for (const amt of amounts) {
      const fee = calculateStablecoinBridgeFee('USDC', amt);
      expect(fee).toMatch(/^\d+\.\d{6}$/);
    }
  });

  it('fee is proportional to amount', () => {
    const fee100 = parseFloat(calculateStablecoinBridgeFee('USDC', '100'));
    const fee200 = parseFloat(calculateStablecoinBridgeFee('USDC', '200'));
    expect(fee200).toBeCloseTo(fee100 * 2, 6);
  });

  it('bridge fee is always >= 0', () => {
    const amounts = ['0', '0.001', '0.1', '1', '100', '10000', 'abc', '-100'];
    for (const amt of amounts) {
      const fee = parseFloat(calculateStablecoinBridgeFee('USDC', amt));
      expect(fee).toBeGreaterThanOrEqual(0);
    }
  });
});
