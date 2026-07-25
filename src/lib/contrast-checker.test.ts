import { describe, it, expect } from 'vitest';
import {
  getContrastRatio,
  isWcagAA,
  isWcagAAA,
  auditContrastPairs,
} from './contrast-checker';

describe('contrast-checker', () => {
  describe('getContrastRatio', () => {
    it('calculates contrast ratio between white and black', () => {
      const ratio = getContrastRatio('#ffffff', '#000000');
      expect(ratio).toBeCloseTo(21, 0);
    });

    it('calculates contrast ratio between black and white', () => {
      const ratio = getContrastRatio('#000000', '#ffffff');
      expect(ratio).toBeCloseTo(21, 0);
    });

    it('calculates contrast ratio for same colors (1:1)', () => {
      const ratio = getContrastRatio('#ffffff', '#ffffff');
      expect(ratio).toBeCloseTo(1, 1);
    });

    it('calculates contrast ratio for light colors', () => {
      const ratio = getContrastRatio('#d0d0d0', '#f5f5f5');
      expect(ratio).toBeGreaterThan(1);
      expect(ratio).toBeLessThan(10);
    });

    it('handles hex colors case-insensitively', () => {
      const ratio1 = getContrastRatio('#FFFFFF', '#000000');
      const ratio2 = getContrastRatio('#ffffff', '#000000');
      expect(ratio1).toBeCloseTo(ratio2, 1);
    });

    it('throws on invalid hex color', () => {
      expect(() => getContrastRatio('invalid', '#000000')).toThrow();
    });
  });

  describe('isWcagAA', () => {
    it('passes for contrast >= 4.5', () => {
      expect(isWcagAA(4.5)).toBe(true);
      expect(isWcagAA(7)).toBe(true);
      expect(isWcagAA(21)).toBe(true);
    });

    it('fails for contrast < 4.5', () => {
      expect(isWcagAA(4.4)).toBe(false);
      expect(isWcagAA(3)).toBe(false);
      expect(isWcagAA(1)).toBe(false);
    });
  });

  describe('isWcagAAA', () => {
    it('passes for contrast >= 7', () => {
      expect(isWcagAAA(7)).toBe(true);
      expect(isWcagAAA(21)).toBe(true);
    });

    it('fails for contrast < 7', () => {
      expect(isWcagAAA(6.9)).toBe(false);
      expect(isWcagAAA(4.5)).toBe(false);
      expect(isWcagAAA(1)).toBe(false);
    });
  });

  describe('auditContrastPairs', () => {
    it('audits all text-to-background pairs', () => {
      const tokens = {
        text: '#ffffff',
        'text-subtle': '#d0d0d0',
        muted: '#8a8a8a',
        bg: '#0a0a0a',
        panel: '#131313',
        'panel-elevated': '#1a1a1a',
        'panel-overlay': '#1f1f1f',
        line: '#2a2a2a',
        'line-strong': '#3a3a3a',
      };

      const pairs = auditContrastPairs(tokens);
      expect(pairs.length).toBeGreaterThan(0);
      expect(pairs[0]).toHaveProperty('foregroundName');
      expect(pairs[0]).toHaveProperty('backgroundName');
      expect(pairs[0]).toHaveProperty('contrast');
      expect(pairs[0]).toHaveProperty('wcagAA');
      expect(pairs[0]).toHaveProperty('wcagAAA');
    });

    it('marks high contrast pairs as WCAG AA compliant', () => {
      const tokens = {
        text: '#ffffff',
        bg: '#000000',
        muted: '#8a8a8a',
        panel: '#131313',
      };

      const pairs = auditContrastPairs(tokens);
      const whiteOnBlack = pairs.find(
        p => p.foregroundName === 'text' && p.backgroundName === 'bg'
      );
      expect(whiteOnBlack?.wcagAA).toBe(true);
      expect(whiteOnBlack?.contrast).toBeGreaterThan(4.5);
    });

    it('marks low contrast pairs as failing', () => {
      const tokens = {
        muted: '#aaaaaa',
        panel: '#bbbbbb',
        text: '#000000',
        bg: '#ffffff',
      };

      const pairs = auditContrastPairs(tokens);
      const lowContrast = pairs.find(
        p => p.foregroundName === 'muted' && p.backgroundName === 'panel'
      );
      expect(lowContrast).toBeDefined();
    });

    it('rounds contrast ratio to 2 decimal places', () => {
      const tokens = {
        text: '#ffffff',
        bg: '#000000',
        muted: '#aaaaaa',
        panel: '#131313',
      };

      const pairs = auditContrastPairs(tokens);
      const pair = pairs[0];
      const decimalPlaces = (pair.contrast.toString().split('.')[1] || '').length;
      expect(decimalPlaces).toBeLessThanOrEqual(2);
    });
  });
});
