import { logger } from '@/lib/logger';
('use client');

import { useState, useEffect } from 'react';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/cn';

interface ReferralStats {
  total_referrals: number;
  total_rewards: number;
  completed_referrals: number;
  pending_referrals: number;
  conversion_rate: number;
}

interface ReferralHistoryItem {
  id: string;
  referred_user_id: string;
  status: 'pending' | 'completed' | 'failed';
  reward_amount: number;
  created_at: string;
}

interface LeaderboardEntry {
  userId: string;
  totalReferrals: number;
  totalRewardsEarned: number;
  rank: number;
}

interface ReferralDashboardProps {
  userId: string;
}

type Tab = 'overview' | 'history' | 'leaderboard';

export function ReferralDashboard({ userId }: ReferralDashboardProps) {
  const [referralCode, setReferralCode] = useState('');
  const [stats, setStats] = useState<ReferralStats>({
    total_referrals: 0,
    total_rewards: 0,
    completed_referrals: 0,
    pending_referrals: 0,
    conversion_rate: 0,
  });
  const [history, setHistory] = useState<ReferralHistoryItem[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);

  const { t } = useI18n();

  useEffect(() => {
    fetchReferralData();
  }, [userId]);

  const fetchReferralData = async () => {
    setLoading(true);
    try {
      const [codeRes, statsRes, historyRes, leaderboardRes] = await Promise.all([
        fetch(`/api/offramp/referral?userId=${userId}`),
        fetch(`/api/offramp/referral/analytics?userId=${userId}`),
        fetch(`/api/offramp/referral/history?userId=${userId}`),
        fetch(`/api/offramp/referral/leaderboard`),
      ]);

      const codeData = await codeRes.json();
      if (codeData.code) setReferralCode(codeData.code.code);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }

      if (historyRes.ok) {
        const historyData = await historyRes.json();
        setHistory(historyData.referrals ?? []);
      }

      if (leaderboardRes.ok) {
        const lbData = await leaderboardRes.json();
        setLeaderboard(lbData.leaderboard ?? []);
      }
    } catch (error) {
      logger.error('Failed to fetch referral data', {}, error);
    } finally {
      setLoading(false);
    }
  };

  const generateCode = async () => {
    try {
      const res = await fetch('/api/offramp/referral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action: 'generate' }),
      });
      const data = await res.json();
      setReferralCode(data.code.code);
    } catch (error) {
      logger.error('Failed to generate referral code', {}, error);
    }
  };

  const referralLink = `${typeof window !== 'undefined' ? window.location.origin : ''}/signup?ref=${referralCode}&utm_source=referral&utm_campaign=app_share`;

  const copyCode = () => {
    navigator.clipboard.writeText(referralCode);
    setCopied('code');
    setTimeout(() => setCopied(null), 2000);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(referralLink);
    setCopied('link');
    setTimeout(() => setCopied(null), 2000);
  };

  const shareLink = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join Stellar-Spend',
          text: `Use my referral code ${referralCode} to sign up for Stellar-Spend and we both earn rewards!`,
          url: referralLink,
        });
      } catch (err) {
        copyLink();
      }
    } else {
      copyLink();
    }
  };

  const statusColor = (status: string) => {
    if (status === 'completed') return 'text-green-400';
    if (status === 'pending') return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className="border border-[#333333] bg-[#111111] p-5 space-y-4">
      <h2 className="text-sm font-semibold text-white tracking-wider uppercase">
        {t('referral.title')}
      </h2>

      {/* Referral Code & Sharing */}
      <div className="space-y-3 p-4 bg-[#0a0a0a] border border-[#222222]">
        <div className="text-[10px] text-[#777777] uppercase tracking-widest">
          {t('referral.your_code')}
        </div>
        {referralCode ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1 group">
                <input
                  type="text"
                  value={referralCode}
                  readOnly
                  aria-label="Referral code"
                  className="w-full bg-[#111111] border border-[#333333] px-4 py-3 text-lg text-[#c9a962] font-black tracking-[0.2em] focus:outline-none transition-all group-hover:border-[#c9a962]"
                />
                <div className="absolute inset-0 bg-[#c9a962]/5 pointer-events-none" />
              </div>
              <button
                onClick={copyCode}
                className={cn(
                  'px-6 py-2 border font-bold text-[10px] uppercase tracking-widest transition-all',
                  copied === 'code'
                    ? 'bg-[#c9a962] text-[#0a0a0a] border-[#c9a962]'
                    : 'border-[#c9a962] text-[#c9a962] hover:bg-[#c9a962] hover:text-[#0a0a0a]',
                )}
              >
                {copied === 'code' ? t('referral.copied') : t('referral.copy')}
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={copyLink}
                className={cn(
                  'flex-1 px-4 py-2.5 border text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2',
                  copied === 'link'
                    ? 'bg-[#333333] text-white border-[#555555]'
                    : 'border-[#333333] text-[#777777] hover:border-[#c9a962] hover:text-[#c9a962]',
                )}
              >
                <span>{copied === 'link' ? t('referral.copied') : t('referral.copy_link')}</span>
              </button>
              <button
                onClick={shareLink}
                className="flex-1 px-4 py-2.5 bg-[#c9a962] text-[#0a0a0a] border border-[#c9a962] text-[10px] font-black uppercase tracking-widest hover:bg-[#d4b97a] transition-all shadow-[0_4px_10px_rgba(201,169,98,0.2)]"
              >
                {t('referral.share')}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={generateCode}
            className="w-full px-4 py-3 border border-[#c9a962] text-[#c9a962] text-[10px] font-black uppercase tracking-widest hover:bg-[#c9a962] hover:text-[#0a0a0a] transition-all"
          >
            {t('referral.generate_code')}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#222222]">
        {(['overview', 'history', 'leaderboard'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-[10px] uppercase tracking-widest transition-all ${
              activeTab === tab
                ? 'text-[#c9a962] border-b-2 border-[#c9a962] -mb-[2px] font-bold'
                : 'text-[#555555] hover:text-[#777777]'
            }`}
          >
            {t(`navigation.${tab === 'history' ? 'history' : tab === 'overview' ? 'home' : tab}`)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <div className="w-8 h-8 border-2 border-[#c9a962]/20 border-t-[#c9a962] rounded-full animate-spin" />
          <div className="text-[10px] text-[#555555] uppercase tracking-widest">
            {t('common.loading')}
          </div>
        </div>
      ) : (
        <div className="animate-in fade-in duration-500">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="border border-[#222222] p-4 bg-[#161616] hover:border-[#333333] transition-colors">
                  <div className="text-[10px] text-[#777777] uppercase tracking-widest mb-1">
                    {t('referral.total_referrals')}
                  </div>
                  <div className="text-2xl text-white font-black tabular-nums">
                    {stats.total_referrals}
                  </div>
                </div>
                <div className="border border-[#222222] p-4 bg-[#161616] hover:border-[#333333] transition-colors">
                  <div className="text-[10px] text-[#777777] uppercase tracking-widest mb-1">
                    {t('referral.total_rewards')}
                  </div>
                  <div className="text-2xl text-[#c9a962] font-black tabular-nums">
                    ${stats.total_rewards}
                  </div>
                </div>
                <div className="border border-[#222222] p-4 bg-[#161616] hover:border-[#333333] transition-colors">
                  <div className="text-[10px] text-[#777777] uppercase tracking-widest mb-1">
                    {t('referral.completed')}
                  </div>
                  <div className="text-2xl text-green-400 font-black tabular-nums">
                    {stats.completed_referrals}
                  </div>
                </div>
                <div className="border border-[#222222] p-4 bg-[#161616] hover:border-[#333333] transition-colors">
                  <div className="text-[10px] text-[#777777] uppercase tracking-widest mb-1">
                    {t('referral.pending')}
                  </div>
                  <div className="text-2xl text-yellow-400 font-black tabular-nums">
                    {stats.pending_referrals}
                  </div>
                </div>
              </div>
              {stats.total_referrals > 0 && (
                <div className="border border-[#222222] p-4 bg-[#0a0a0a] space-y-3">
                  <div className="flex justify-between items-end">
                    <div className="text-[10px] text-[#777777] uppercase tracking-widest">
                      {t('referral.conversion_rate')}
                    </div>
                    <div className="text-lg text-white font-black">
                      {(stats.conversion_rate * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div className="h-1.5 bg-[#222222] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#c9a962]/50 to-[#c9a962] transition-all duration-1000"
                      style={{ width: `${stats.conversion_rate * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* History Tab */}
          {activeTab === 'history' && (
            <div className="space-y-2">
              {history.length === 0 ? (
                <div className="text-[10px] text-[#555555] text-center py-12 border border-dashed border-[#222222] uppercase tracking-widest">
                  {t('referral.history_empty')}
                </div>
              ) : (
                history.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between border border-[#222222] p-4 bg-[#161616] hover:bg-[#1a1a1a] transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="text-xs text-white font-mono font-bold">
                        {item.referred_user_id.slice(0, 12)}…
                      </div>
                      <div className="text-[9px] text-[#555555] font-mono uppercase">
                        {new Date(item.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="text-right space-y-1">
                      <div
                        className={cn(
                          'text-[10px] font-black uppercase tracking-widest',
                          statusColor(item.status),
                        )}
                      >
                        {item.status}
                      </div>
                      <div className="text-[10px] text-[#c9a962] font-mono font-bold">
                        ${item.reward_amount} {t('referral.reward')}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Leaderboard Tab */}
          {activeTab === 'leaderboard' && (
            <div className="space-y-2">
              {leaderboard.length === 0 ? (
                <div className="text-[10px] text-[#555555] text-center py-12 border border-dashed border-[#222222] uppercase tracking-widest">
                  {t('referral.leaderboard_empty')}
                </div>
              ) : (
                leaderboard.map((entry) => (
                  <div
                    key={entry.userId}
                    className={cn(
                      'flex items-center justify-between border p-4 transition-all',
                      entry.userId === userId
                        ? 'border-[#c9a962] bg-[#c9a962]/5 shadow-[inset_0_0_10px_rgba(201,169,98,0.1)]'
                        : 'border-[#222222] bg-[#161616] hover:bg-[#1a1a1a]',
                    )}
                  >
                    <div className="flex items-center gap-4">
                      <span
                        className={cn(
                          'text-lg font-black w-8 italic',
                          entry.rank === 1
                            ? 'text-yellow-400 drop-shadow-[0_0_5px_rgba(250,204,21,0.5)]'
                            : entry.rank === 2
                              ? 'text-[#c0c0c0]'
                              : entry.rank === 3
                                ? 'text-[#cd7f32]'
                                : 'text-[#555555]',
                        )}
                      >
                        #{entry.rank}
                      </span>
                      <div className="space-y-0.5">
                        <div
                          className={cn(
                            'text-xs font-bold',
                            entry.userId === userId ? 'text-[#c9a962]' : 'text-white',
                          )}
                        >
                          {entry.userId === userId
                            ? t('referral.you')
                            : `${entry.userId.slice(0, 10)}…`}
                        </div>
                        <div className="text-[9px] text-[#555555] uppercase tracking-widest">
                          {entry.totalReferrals} {t('referral.total_referrals')}
                        </div>
                      </div>
                    </div>
                    <div className="text-sm text-[#c9a962] font-black tabular-nums">
                      ${entry.totalRewardsEarned}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
