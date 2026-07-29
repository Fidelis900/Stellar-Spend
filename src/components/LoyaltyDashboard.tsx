'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import {
  type LoyaltyProfile,
  type LoyaltyTier,
  type RedemptionRecord,
  LoyaltyStorage,
  TIERS,
  getTierConfig,
  getNextTier,
  volumeToNextTier,
  DEFAULT_PROGRAM_CONFIG,
  pointsToUSDC,
} from '@/lib/loyalty';
import { useI18n } from '@/lib/i18n';
import { TierUpgradeNotification } from './TierUpgradeNotification';

interface Props {
  userAddress: string;
  onTierUpgrade?: (tier: LoyaltyTier) => void;
}

type Tab = 'overview' | 'rewards' | 'tiers' | 'history';

const REWARDS_CATALOG = [
  {
    id: 'r1',
    name: 'Fee Waiver',
    description: 'Waive next transaction fee',
    points: 500,
    tier: 'bronze' as LoyaltyTier,
  },
  {
    id: 'r2',
    name: 'Priority Processing',
    description: 'Skip the queue for 7 days',
    points: 1000,
    tier: 'silver' as LoyaltyTier,
  },
  {
    id: 'r3',
    name: 'Rate Boost',
    description: '0.1% better rate for 30 days',
    points: 2500,
    tier: 'gold' as LoyaltyTier,
  },
  {
    id: 'r4',
    name: 'VIP Support',
    description: 'Dedicated support agent for 30 days',
    points: 5000,
    tier: 'platinum' as LoyaltyTier,
  },
];

export default function LoyaltyDashboard({ userAddress, onTierUpgrade }: Props) {
  const [profile, setProfile] = useState<LoyaltyProfile | null>(null);
  const [redemptionHistory, setRedemptionHistory] = useState<RedemptionRecord[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [redeemPoints, setRedeemPoints] = useState('');
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [redeemSuccess, setRedeemSuccess] = useState<string | null>(null);
  const [upgradedTier, setUpgradedTier] = useState<LoyaltyTier | null>(null);

  const { t } = useI18n();

  useEffect(() => {
    if (!userAddress) return;
    setProfile(LoyaltyStorage.get(userAddress));
    setRedemptionHistory(LoyaltyStorage.getRedemptionHistory(userAddress));
  }, [userAddress]);

  if (!profile) return null;

  const tierConfig = getTierConfig(profile.tier);
  const nextTier = getNextTier(profile.tier);
  const remaining = volumeToNextTier(profile);
  const currentTierDef = TIERS.find((t) => t.tier === profile.tier)!;
  const progressPct = nextTier
    ? Math.min(
        100,
        ((profile.totalVolume - currentTierDef.minVolume) /
          (nextTier.minVolume - currentTierDef.minVolume)) *
          100,
      )
    : 100;

  const handleRedeem = (points: number) => {
    setRedeemError(null);
    setRedeemSuccess(null);
    const result = LoyaltyStorage.redeemPoints(userAddress, points);
    if (result.success) {
      setProfile(result.profile);
      setRedemptionHistory(LoyaltyStorage.getRedemptionHistory(userAddress));
      setRedeemSuccess(
        `${t('loyalty.redeem')} ${points} pts for $${result.usdcValue.toFixed(2)} USDC`,
      );
      setRedeemPoints('');
    } else {
      setRedeemError(result.error ?? 'Redemption failed');
    }
  };

  const handleCustomRedeem = () => {
    const pts = parseInt(redeemPoints, 10);
    if (isNaN(pts) || pts <= 0) {
      setRedeemError('Enter a valid points amount');
      return;
    }
    handleRedeem(pts);
  };

  const config = DEFAULT_PROGRAM_CONFIG;

  return (
    <div className="border border-[#333333] bg-[#111111] p-5 space-y-4">
      <TierUpgradeNotification tier={upgradedTier} onClose={() => setUpgradedTier(null)} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white tracking-wider uppercase">
          {t('loyalty.title')}
        </h2>
        <div className="flex flex-col items-end">
          <span
            className="text-[10px] font-bold tracking-widest uppercase px-3 py-1 border animate-pulse"
            style={{ color: tierConfig.color, borderColor: tierConfig.color + '55' }}
          >
            {tierConfig.label} {t('loyalty.tier')}
          </span>
        </div>
      </div>

      {/* Points Balance */}
      <div className="border border-[#222222] p-4 flex items-center justify-between bg-gradient-to-r from-[#111111] to-[#1a1a1a]">
        <div>
          <div className="text-[10px] text-[#777777] uppercase tracking-widest mb-1">
            {t('loyalty.points_balance')}
          </div>
          <div className="text-3xl text-white font-bold tabular-nums tracking-tighter">
            {profile.points.toLocaleString()}
            <span className="text-xs ml-1 font-normal text-[#555555]">pts</span>
          </div>
          <div className="text-[10px] text-[#555555] mt-1 font-mono">
            ≈ ${pointsToUSDC(profile.points, config).toFixed(2)} USDC
          </div>
        </div>
        <div className="text-right border-l border-[#222222] pl-4">
          <div className="text-[10px] text-[#777777] uppercase tracking-widest mb-1">
            {t('loyalty.lifetime_points')}
          </div>
          <div className="text-sm text-[#aaaaaa] tabular-nums font-semibold">
            {profile.lifetimePoints.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Progress to next tier */}
      {nextTier && remaining !== null && (
        <div className="space-y-2 p-3 border border-[#222222] bg-[#0a0a0a]">
          <div className="flex justify-between items-end">
            <div className="space-y-0.5">
              <span className="text-[10px] text-[#777777] uppercase tracking-widest block">
                {t('loyalty.progress_to')} {nextTier.label}
              </span>
              <span className="text-xs text-white font-bold">
                {progressPct.toFixed(1)}% {t('common.success').toLowerCase()}
              </span>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-[#c9a962] font-mono block">
                {remaining.toLocaleString('en-US', { maximumFractionDigits: 0 })} USDC{' '}
                {t('loyalty.remaining')}
              </span>
            </div>
          </div>
          <div className="h-2 bg-[#222222] w-full rounded-full overflow-hidden">
            <div
              className="h-full transition-all duration-1000 ease-out relative"
              style={{ width: `${progressPct}%`, backgroundColor: nextTier.color }}
            >
              <div className="absolute inset-0 bg-white/20 animate-pulse" />
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-[#222222] overflow-x-auto scrollbar-hide">
        {(['overview', 'rewards', 'tiers', 'history'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-[10px] uppercase tracking-widest transition-all whitespace-nowrap ${
              activeTab === tab
                ? 'text-[#c9a962] border-b-2 border-[#c9a962] -mb-[2px] font-bold'
                : 'text-[#555555] hover:text-[#777777]'
            }`}
          >
            {t(`navigation.${tab === 'history' ? 'history' : tab === 'overview' ? 'home' : tab}`)}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-4 animate-in fade-in duration-500">
          <div className="grid grid-cols-2 gap-3">
            <div className="border border-[#222222] p-3 hover:border-[#333333] transition-colors">
              <div className="text-[10px] text-[#777777] uppercase tracking-widest mb-1">
                Total Volume
              </div>
              <div className="text-sm text-white font-semibold tabular-nums">
                {profile.totalVolume.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{' '}
                <span className="text-[10px] text-[#555555]">USDC</span>
              </div>
            </div>
            <div className="border border-[#222222] p-3 hover:border-[#333333] transition-colors">
              <div className="text-[10px] text-[#777777] uppercase tracking-widest mb-1">
                Transactions
              </div>
              <div className="text-sm text-white font-semibold tabular-nums">
                {profile.transactionCount}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-[#222222]" />
              <div className="text-[10px] text-[#777777] uppercase tracking-widest">
                {t('loyalty.exclusive_benefits')}
              </div>
              <div className="h-px flex-1 bg-[#222222]" />
            </div>
            <div className="grid grid-cols-1 gap-2">
              {tierConfig.benefits.map((b) => (
                <div
                  key={b}
                  className="flex items-center gap-3 text-xs text-[#aaaaaa] bg-[#1a1a1a] p-2 border border-[#222222]"
                >
                  <span
                    className="flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[10px]"
                    style={{ backgroundColor: tierConfig.color + '22', color: tierConfig.color }}
                  >
                    ✓
                  </span>
                  {b}
                </div>
              ))}
            </div>
          </div>

          <div className="border border-[#222222] p-3 space-y-2 bg-[#0a0a0a]">
            <div className="text-[10px] text-[#777777] uppercase tracking-widest border-b border-[#222222] pb-1 mb-2">
              {t('loyalty.multipliers_limits')}
            </div>
            <div className="flex justify-between text-xs text-[#aaaaaa]">
              <span>{t('loyalty.points_multiplier')}</span>
              <span className="text-white font-mono">{tierConfig.pointsMultiplier}×</span>
            </div>
            <div className="flex justify-between text-xs text-[#aaaaaa]">
              <span>{t('loyalty.fee_discount')}</span>
              <span className="text-green-400 font-mono">
                {(tierConfig.feeDiscount * 100).toFixed(2)}%
              </span>
            </div>
            <div className="flex justify-between text-xs text-[#aaaaaa]">
              <span>{t('loyalty.withdrawal_limit')}</span>
              <span className="text-white font-mono">
                {tierConfig.withdrawalLimit.toLocaleString()} USDC
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Rewards Catalog Tab */}
      {activeTab === 'rewards' && (
        <div className="space-y-3 animate-in fade-in duration-500">
          {redeemError && (
            <div className="p-2 bg-red-900/20 border border-red-500/50 text-[10px] text-red-400 uppercase tracking-widest">
              {redeemError}
            </div>
          )}
          {redeemSuccess && (
            <div className="p-2 bg-green-900/20 border border-green-500/50 text-[10px] text-green-400 uppercase tracking-widest">
              {redeemSuccess}
            </div>
          )}

          <div className="space-y-2">
            {REWARDS_CATALOG.map((reward) => {
              const tierCfg = getTierConfig(reward.tier);
              const canAfford = profile.points >= reward.points;
              const tierUnlocked =
                TIERS.findIndex((t) => t.tier === profile.tier) >=
                TIERS.findIndex((t) => t.tier === reward.tier);
              const available = canAfford && tierUnlocked;
              return (
                <div
                  key={reward.id}
                  className={cn(
                    'border p-3 flex items-center justify-between transition-all',
                    available
                      ? 'border-[#333333] bg-[#1a1a1a]'
                      : 'border-[#1a1a1a] opacity-50 grayscale',
                  )}
                >
                  <div className="space-y-1">
                    <div className="text-xs text-white font-bold uppercase tracking-tight">
                      {reward.name}
                    </div>
                    <div className="text-[10px] text-[#777777]">{reward.description}</div>
                    <div className="flex items-center gap-2 mt-2">
                      <span
                        className="text-[9px] px-1.5 py-0.5 rounded-sm bg-black/40 border border-white/10"
                        style={{ color: tierCfg.color }}
                      >
                        {tierCfg.label}+
                      </span>
                      <span className="text-[10px] text-white font-mono font-bold">
                        {reward.points.toLocaleString()} pts
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRedeem(reward.points)}
                    disabled={!available}
                    className={cn(
                      'text-[10px] font-bold uppercase tracking-widest px-4 py-2 border transition-all',
                      available
                        ? 'border-[#c9a962] text-[#c9a962] hover:bg-[#c9a962] hover:text-[#0a0a0a] shadow-[0_0_10px_rgba(201,169,98,0.2)]'
                        : 'border-[#222222] text-[#333333] cursor-not-allowed',
                    )}
                  >
                    {t('loyalty.redeem')}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Custom redemption */}
          <div className="border border-[#222222] p-4 space-y-3 bg-[#0a0a0a]">
            <div className="text-[10px] text-[#777777] uppercase tracking-widest">
              {t('loyalty.custom_redemption')}
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="number"
                  min={config.minRedemptionPoints}
                  value={redeemPoints}
                  onChange={(e) => setRedeemPoints(e.target.value)}
                  placeholder={`${t('loyalty.min_points')}: ${config.minRedemptionPoints}`}
                  aria-label="Points to redeem"
                  className="w-full bg-[#111111] border border-[#333333] px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#c9a962] transition-colors"
                />
              </div>
              <button
                onClick={handleCustomRedeem}
                className="px-6 py-2 border border-[#c9a962] text-[#c9a962] text-[10px] font-bold uppercase tracking-widest hover:bg-[#c9a962] hover:text-[#0a0a0a] transition-all"
              >
                {t('loyalty.redeem')}
              </button>
            </div>
            {redeemPoints && !isNaN(parseInt(redeemPoints)) && (
              <div className="text-[10px] text-[#555555] font-mono animate-pulse">
                ≈ ${pointsToUSDC(parseInt(redeemPoints), config).toFixed(2)} USDC
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tier Comparison Tab */}
      {activeTab === 'tiers' && (
        <div className="space-y-2 animate-in fade-in duration-500">
          {TIERS.map((t) => {
            const isActive = t.tier === profile.tier;
            const isUnlocked =
              TIERS.findIndex((x) => x.tier === profile.tier) >=
              TIERS.findIndex((x) => x.tier === t.tier);
            return (
              <div
                key={t.tier}
                className={cn(
                  'border p-4 space-y-3 transition-all',
                  isActive
                    ? 'bg-[#1a1a1a] ring-1 ring-inset'
                    : isUnlocked
                      ? 'border-[#222222] opacity-80'
                      : 'border-[#1a1a1a] opacity-40 grayscale',
                )}
                style={isActive ? { borderColor: t.color, ringColor: t.color + '44' } : {}}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-sm font-black uppercase italic tracking-tighter"
                      style={{ color: t.color }}
                    >
                      {t.label}
                    </span>
                    <span className="text-[9px] text-[#555555] font-mono">
                      {t.minVolume.toLocaleString()}+ USDC
                    </span>
                  </div>
                  {isActive && (
                    <span
                      className="text-[9px] font-bold px-2 py-0.5 border uppercase tracking-widest"
                      style={{ color: t.color, borderColor: t.color + '55' }}
                    >
                      Current
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-1">
                  {t.benefits.map((b) => (
                    <div key={b} className="text-[10px] text-[#888888] flex items-center gap-2">
                      <span className="text-xs" style={{ color: t.color }}>
                        •
                      </span>
                      {b}
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[9px] text-[#555555] pt-2 border-t border-[#222222] font-mono">
                  <span className="flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-[#c9a962]" /> {t.pointsMultiplier}×
                    points
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-green-500" />{' '}
                    {(t.feeDiscount * 100).toFixed(2)}% off
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-blue-500" />{' '}
                    {t.withdrawalLimit.toLocaleString()} limit
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Redemption History Tab */}
      {activeTab === 'history' && (
        <div className="space-y-2 animate-in fade-in duration-500">
          {redemptionHistory.length === 0 ? (
            <div className="text-xs text-[#555555] text-center py-8 border border-dashed border-[#222222]">
              No redemption history yet
            </div>
          ) : (
            redemptionHistory.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between border border-[#222222] p-3 bg-[#0a0a0a] hover:bg-[#111111] transition-colors"
              >
                <div className="space-y-1">
                  <div className="text-xs text-white font-bold">
                    {r.pointsRedeemed.toLocaleString()}{' '}
                    <span className="text-[#555555] font-normal uppercase text-[9px]">
                      pts redeemed
                    </span>
                  </div>
                  <div className="text-[10px] text-[#555555] font-mono">
                    {new Date(r.redeemedAt).toLocaleDateString()} ·{' '}
                    {new Date(r.redeemedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
                <div className="text-xs text-green-400 font-mono font-bold">
                  +${r.usdcValue.toFixed(2)} <span className="text-[9px] opacity-60">USDC</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
