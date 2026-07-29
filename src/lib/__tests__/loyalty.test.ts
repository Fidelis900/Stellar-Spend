import { describe, it, expect } from 'vitest';
import {
  getTierForVolume,
  getNextTier,
  volumeToNextTier,
  calculatePoints,
  TIERS,
  DEFAULT_PROGRAM_CONFIG,
  type LoyaltyProfile,
} from '../loyalty';

describe('Loyalty Progress Calculations', () => {
  it('should return correct tier for given volume', () => {
    expect(getTierForVolume(0)).toBe('bronze');
    expect(getTierForVolume(499)).toBe('bronze');
    expect(getTierForVolume(500)).toBe('silver');
    expect(getTierForVolume(1999)).toBe('silver');
    expect(getTierForVolume(2000)).toBe('gold');
    expect(getTierForVolume(9999)).toBe('gold');
    expect(getTierForVolume(10000)).toBe('platinum');
    expect(getTierForVolume(1000000)).toBe('platinum');
  });

  it('should return next tier correctly', () => {
    expect(getNextTier('bronze')?.tier).toBe('silver');
    expect(getNextTier('silver')?.tier).toBe('gold');
    expect(getNextTier('gold')?.tier).toBe('platinum');
    expect(getNextTier('platinum')).toBeNull();
  });

  it('should calculate volume to next tier correctly', () => {
    const profile: LoyaltyProfile = {
      userAddress: 'GA...',
      totalVolume: 100,
      transactionCount: 1,
      tier: 'bronze',
      points: 1000,
      lifetimePoints: 1000,
      updatedAt: Date.now(),
    };

    expect(volumeToNextTier(profile)).toBe(400); // 500 - 100

    profile.totalVolume = 600;
    profile.tier = 'silver';
    expect(volumeToNextTier(profile)).toBe(1400); // 2000 - 600

    profile.totalVolume = 10000;
    profile.tier = 'platinum';
    expect(volumeToNextTier(profile)).toBeNull();
  });

  it('should calculate points based on multipliers', () => {
    const config = DEFAULT_PROGRAM_CONFIG; // 10 points per USDC

    // Bronze: 1x multiplier
    expect(calculatePoints(100, 'bronze', config)).toBe(1000);

    // Silver: 1.5x multiplier
    expect(calculatePoints(100, 'silver', config)).toBe(1500);

    // Gold: 2x multiplier
    expect(calculatePoints(100, 'gold', config)).toBe(2000);

    // Platinum: 3x multiplier
    expect(calculatePoints(100, 'platinum', config)).toBe(3000);
  });
});
