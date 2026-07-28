import { logger } from '@/lib/logger';
('use client');

import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

export default function ServiceWorkerRegistration() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      return;
    }

    const registerServiceWorker = async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
        });

        setRegistration(reg);

        // Check for updates periodically
        const interval = setInterval(() => {
          reg.update();
        }, 60000); // Check every minute

        // Listen for updates
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New service worker is ready
              setUpdateAvailable(true);
              notifyUpdateAvailable();
            }
          });
        });

        return () => clearInterval(interval);
      } catch (error) {
        logger.error('Service Worker registration failed:', {}, error);
      }
    };

    registerServiceWorker();
  }, []);

  const handleUpdate = () => {
    if (!registration?.waiting) return;

    // Tell the new service worker to take control
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });

    // Reload the page when the new service worker takes control
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    });
  };

  const notifyUpdateAvailable = () => {
    // Show a toast or notification that an update is available
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Stellar Spend Update Available', {
        body: 'A new version is available. Refresh to update.',
        icon: '/icons/icon-192x192.png',
      });
    }
  };

  if (!updateAvailable) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-sm z-50">
      <div className="bg-[#111111] border border-[#c9a962] rounded-lg p-4 shadow-lg backdrop-filter backdrop-blur-sm">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 text-xl">🔄</div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-[#c9a962] mb-1">Update Available</h3>
            <p className="text-xs text-[#999999] mb-3">
              A new version of Stellar-Spend is ready. Refresh to get the latest features and fixes.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleUpdate}
                className={cn(
                  'flex-1 px-3 py-2 text-xs font-semibold tracking-widest uppercase',
                  'bg-[#c9a962] text-[#0a0a0a] rounded transition-colors duration-150',
                  'hover:bg-[#d4b982] focus:outline-none focus-visible:ring-1 focus-visible:ring-[#c9a962]',
                )}
              >
                Refresh
              </button>
              <button
                onClick={() => setUpdateAvailable(false)}
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
        </div>
      </div>
    </div>
  );
}
