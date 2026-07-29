/**
 * Code splitting utilities for reducing initial bundle size.
 * Enables dynamic imports and lazy loading of components.
 */

import dynamic from 'next/dynamic';
import { ComponentType, ReactNode } from 'react';

/**
 * Dynamically import a component with loading and error states.
 */
export function dynamicComponent<P extends object>(
  importFn: () => Promise<{ default: ComponentType<P> }>,
  options?: {
    loading?: () => ReactNode;
    ssr?: boolean;
  },
): ComponentType<P> {
  return dynamic(importFn, {
    loading: options?.loading || (() => <div>Loading...</div>),
    ssr: options?.ssr !== false,
  });
}

/**
 * Lazy load a module on demand.
 */
export async function lazyLoadModule<T>(importFn: () => Promise<T>): Promise<T> {
  return importFn();
}

/**
 * Preload a module in the background.
 */
export function preloadModule<T>(importFn: () => Promise<T>): void {
  if (typeof window !== 'undefined') {
    // Use requestIdleCallback if available, otherwise use setTimeout
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => importFn());
    } else {
      setTimeout(() => importFn(), 2000);
    }
  }
}

/**
 * Split code by route for better code splitting.
 */
export const routeChunks = {
  dashboard: () => import('@/components/StellarSpendDashboard').then((m) => m.default),
  history: () => import('@/components/RecentOfframpsTable').then((m) => m.default),
  analytics: () => import('@/components/AnalyticsDashboard').then((m) => m.default),
  settings: () => import('@/components/ShareSettings').then((m) => m.default),
} as const;

/**
 * Split code by feature for better code splitting.
 */
export const featureChunks = {
  qrScanner: () => import('@/components/QRScanner').then((m) => m.default),
  walletModal: () => import('@/components/WalletModal').then((m) => m.default),
  twoFA: () => import('@/components/TwoFASetup').then((m) => m.default),
  insurance: () => import('@/components/InsuranceOption').then((m) => m.default),
  referral: () => import('@/components/ReferralDashboard').then((m) => m.default),
  loyalty: () => import('@/components/LoyaltyDashboard').then((m) => m.default),
} as const;
