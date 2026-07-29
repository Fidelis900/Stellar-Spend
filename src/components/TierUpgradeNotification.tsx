'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { type LoyaltyTier, getTierConfig } from '@/lib/loyalty';
import { useI18n } from '@/lib/i18n';

interface Props {
  tier: LoyaltyTier | null;
  onClose: () => void;
}

export function TierUpgradeNotification({ tier, onClose }: Props) {
  const [isVisible, setIsVisible] = useState(false);
  const { t } = useI18n();

  useEffect(() => {
    if (tier) {
      setIsVisible(true);
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(onClose, 500); // Wait for exit animation
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [tier, onClose]);

  if (!tier) return null;

  const config = getTierConfig(tier);

  return (
    <div
      className={cn(
        'fixed bottom-8 right-8 z-50 transition-all duration-500 transform',
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-12 opacity-0',
      )}
      role="alert"
      aria-live="polite"
    >
      <div
        className="bg-[#111111] border-2 p-6 shadow-2xl max-w-sm"
        style={{ borderColor: config.color }}
      >
        <div className="flex flex-col items-center text-center space-y-4">
          {/* Celebratory Icon/Graphic */}
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center animate-bounce"
            style={{ backgroundColor: config.color + '22' }}
          >
            <span className="text-3xl" style={{ color: config.color }}>
              ★
            </span>
          </div>

          <div className="space-y-1">
            <h3 className="text-lg font-bold text-white uppercase tracking-tighter">
              {t('loyalty.upgrade_title')}
            </h3>
            <p className="text-2xl font-black uppercase italic" style={{ color: config.color }}>
              {config.label} {t('loyalty.tier')}
            </p>
          </div>

          <div className="w-full h-px bg-[#333333]" />

          <div className="space-y-2">
            <p className="text-[10px] text-[#777777] uppercase tracking-widest">
              {t('loyalty.new_benefits_unlocked')}
            </p>
            <ul className="space-y-1">
              {config.benefits.slice(0, 3).map((benefit) => (
                <li
                  key={benefit}
                  className="text-xs text-[#aaaaaa] flex items-center justify-center gap-2"
                >
                  <span style={{ color: config.color }}>✓</span>
                  {benefit}
                </li>
              ))}
            </ul>
          </div>

          <button
            onClick={() => {
              setIsVisible(false);
              setTimeout(onClose, 500);
            }}
            className="w-full py-2 border text-[10px] uppercase tracking-widest transition-colors"
            style={{
              color: config.color,
              borderColor: config.color,
              backgroundColor: 'transparent',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = config.color;
              e.currentTarget.style.color = '#0a0a0a';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = config.color;
            }}
          >
            {t('common.close')}
          </button>
        </div>
      </div>

      {/* Confetti-like particles (simple CSS implementation) */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {[...Array(10)].map((_, i) => (
          <div
            key={i}
            className="absolute animate-ping"
            style={{
              top: `${Math.random() * 100}%`,
              left: `${Math.random() * 100}%`,
              width: '4px',
              height: '4px',
              backgroundColor: config.color,
              animationDelay: `${Math.random() * 2}s`,
              animationDuration: `${2 + Math.random() * 2}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
