import { logger } from '@/lib/logger';
('use client');

import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if app is already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowPrompt(true);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setShowPrompt(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;

      if (outcome === 'accepted') {
        setIsInstalled(true);
      }
      setShowPrompt(false);
      setDeferredPrompt(null);
    } catch (err) {
      logger.error('Installation failed:', {}, err);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
  };

  if (!showPrompt || isInstalled) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-sm z-50">
      <div className="bg-[#111111] border border-[#333333] rounded-lg p-4 shadow-lg backdrop-filter backdrop-blur-sm">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 text-xl">📱</div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-[#c9a962] mb-1">Install Stellar-Spend</h3>
            <p className="text-xs text-[#999999] mb-3">
              Install our app for faster access and offline support. Works on mobile and desktop.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleInstall}
                className={cn(
                  'flex-1 px-3 py-2 text-xs font-semibold tracking-widest uppercase',
                  'bg-[#c9a962] text-[#0a0a0a] rounded transition-colors duration-150',
                  'hover:bg-[#d4b982] focus:outline-none focus-visible:ring-1 focus-visible:ring-[#c9a962]',
                )}
              >
                Install
              </button>
              <button
                onClick={handleDismiss}
                className={cn(
                  'flex-1 px-3 py-2 text-xs font-semibold tracking-widest uppercase',
                  'border border-[#555555] text-[#555555] rounded transition-colors duration-150',
                  'hover:border-[#c9a962] hover:text-[#c9a962] focus:outline-none focus-visible:ring-1 focus-visible:ring-[#555555]',
                )}
              >
                Later
              </button>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 text-[#666666] hover:text-[#999999] transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
